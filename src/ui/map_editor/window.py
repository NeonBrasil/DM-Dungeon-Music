"""
DM - Dungeon Music
Map Editor — MapEditorWindow (QMainWindow).
"""

import os
import json
import copy
import uuid

from PySide6.QtWidgets import (
    QMainWindow, QApplication, QMenuBar, QMenu, QToolBar,
    QStatusBar, QWidget, QLabel, QHBoxLayout, QPushButton,
    QInputDialog, QMessageBox, QFileDialog, QComboBox,
    QSpinBox, QCheckBox, QFrame, QSizePolicy,
)
from PySide6.QtCore  import Qt, QTimer, Signal, QSettings
from PySide6.QtGui   import QAction, QKeySequence, QIcon, QCloseEvent

from .constants import (
    LAYER_ORDER, LAYER_LABELS, BG_STYLES, APP_QSS, DATA_DIR,
)
from .scene  import MapScene, MapView, SelectTool, FogPaintTool
from .panels import ToolSidebar, PropertiesPanel


# ─── Empty map template ───────────────────────────────────────────────────────

def _empty_level() -> dict:
    return {
        "items":          [],
        "fog":            [],
        "bg_style":       "dark",
        "bg_color":       BG_STYLES["dark"],
        "grid_type":      "none",
        "grid_size":      50,
        "layers_visible": {l: True for l in LAYER_ORDER},
    }


def _empty_map(name: str) -> dict:
    return {
        "name":      name,
        "version":   1,
        "levels":    [{"name": "Mundo", **_empty_level()}],
        "level_idx": 0,
    }


# ─── Level Breadcrumb ─────────────────────────────────────────────────────────

class LevelBar(QWidget):
    """Horizontal breadcrumb showing the current map level stack."""

    level_requested = Signal(int)   # index into map_data["levels"]

    def __init__(self, parent=None):
        super().__init__(parent)
        self._lay = QHBoxLayout(self)
        self._lay.setContentsMargins(4, 2, 4, 2)
        self._lay.setSpacing(2)

    def refresh(self, levels: list, current_idx: int):
        while self._lay.count():
            item = self._lay.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        for i, lv in enumerate(levels):
            if i > 0:
                arrow = QLabel("›")
                arrow.setStyleSheet("color: #94a3b8; padding: 0 2px;")
                self._lay.addWidget(arrow)

            btn = QPushButton(lv.get("name", f"Nível {i+1}"))
            btn.setFlat(True)
            btn.setCheckable(True)
            btn.setChecked(i == current_idx)
            btn.clicked.connect(lambda _, idx=i: self.level_requested.emit(idx))
            btn.setStyleSheet(
                "QPushButton { color: #e2e8f0; padding: 2px 6px; border-radius: 3px; }"
                "QPushButton:checked { background: #7c3aed; }"
                "QPushButton:hover   { background: #2f3055; }"
            )
            self._lay.addWidget(btn)

        add_btn = QPushButton("+ Nível")
        add_btn.setFlat(True)
        add_btn.setToolTip("Adicionar novo nível (cidade, dungeon…)")
        add_btn.setStyleSheet(
            "QPushButton { color: #94a3b8; padding: 2px 6px; }"
            "QPushButton:hover { color: #a78bfa; }"
        )
        add_btn.clicked.connect(lambda: self.level_requested.emit(-1))  # -1 = add
        self._lay.addWidget(add_btn)
        self._lay.addStretch()


# ─── MapEditorWindow ──────────────────────────────────────────────────────────

class MapEditorWindow(QMainWindow):
    """Janela principal do editor de mapas RPG."""

    def __init__(self, map_name: str = "", parent=None):
        super().__init__(parent)
        self.setWindowTitle("DM — Editor de Mapas")
        self.setMinimumSize(1000, 680)
        self.setStyleSheet(APP_QSS)

        # ── Map data ──────────────────────────────────────────────────────
        self._map_name  = map_name or "mapa_sem_titulo"
        self._map_path  = os.path.join(DATA_DIR, self._map_name + ".json")
        self._map_data  = _empty_map(self._map_name)
        self._level_idx = 0
        self._dirty     = False

        # ── Core widgets ──────────────────────────────────────────────────
        self._scene = MapScene()
        self._view  = MapView(self._scene)
        self.setCentralWidget(self._view)

        # ── Panels ────────────────────────────────────────────────────────
        self._sidebar = ToolSidebar(self._scene, self)
        self._sidebar.setObjectName("ToolSidebar")
        self._props   = PropertiesPanel(self._scene, self)
        self._props.setObjectName("PropertiesPanel")
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea,  self._sidebar)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, self._props)

        # ── Level bar (top) ───────────────────────────────────────────────
        self._level_bar = LevelBar()
        self._level_bar.level_requested.connect(self._on_level_requested)

        top_bar = QWidget()
        top_lay = QHBoxLayout(top_bar)
        top_lay.setContentsMargins(6, 2, 6, 2)
        top_lay.setSpacing(6)
        top_lay.addWidget(QLabel("Níveis:"))
        top_lay.addWidget(self._level_bar, 1)

        # Grid / BG controls inside top bar
        top_lay.addWidget(self._make_bg_combo())
        top_lay.addWidget(self._make_grid_combo())
        top_lay.addWidget(self._make_grid_size_spin())

        self.addToolBarBreak(Qt.ToolBarArea.TopToolBarArea)
        top_tb = QToolBar("Níveis")
        top_tb.setObjectName("NiveisToolBar")
        top_tb.setMovable(False)
        top_tb.addWidget(top_bar)
        self.addToolBar(Qt.ToolBarArea.TopToolBarArea, top_tb)

        # ── Status bar ────────────────────────────────────────────────────
        self._status = QStatusBar()
        self.setStatusBar(self._status)
        self._coord_lbl = QLabel()
        self._status.addPermanentWidget(self._coord_lbl)

        # ── Menus & toolbars ──────────────────────────────────────────────
        self._build_menu()
        self._build_toolbar()

        # ── Signals ───────────────────────────────────────────────────────
        self._scene.status_msg.connect(self._status.showMessage)
        self._scene.map_changed.connect(self._mark_dirty)
        self._scene.item_selected.connect(self._on_item_selected)
        self._view.coords_changed.connect(self._on_coords)

        # ── Autosave ──────────────────────────────────────────────────────
        self._autosave_timer = QTimer(self)
        self._autosave_timer.setInterval(30_000)   # 30 s
        self._autosave_timer.timeout.connect(self._autosave)
        self._autosave_timer.start()

        # ── Load ──────────────────────────────────────────────────────────
        self._load_or_init()
        self._load_level(0)

        # ── Restore geometry ──────────────────────────────────────────────
        settings = QSettings("DM", "MapEditor")
        geom = settings.value("geometry")
        if geom:
            self.restoreGeometry(geom)
        state = settings.value("windowState")
        if state:
            self.restoreState(state)

    # ── UI helpers ────────────────────────────────────────────────────────

    def _make_bg_combo(self) -> QComboBox:
        cb = QComboBox()
        cb.setToolTip("Fundo do mapa")
        cb.addItem("Escuro",   "dark")
        cb.addItem("Pergaminho", "parchment")
        cb.addItem("Oceano",   "ocean")
        cb.setCurrentIndex(0)
        cb.currentIndexChanged.connect(self._on_bg_changed)
        self._bg_combo = cb
        return cb

    def _make_grid_combo(self) -> QComboBox:
        cb = QComboBox()
        cb.setToolTip("Grade")
        cb.addItem("Sem grade", "none")
        cb.addItem("Quadrada",  "square")
        cb.addItem("Hexagonal", "hex")
        cb.setCurrentIndex(0)
        cb.currentIndexChanged.connect(self._on_grid_changed)
        self._grid_combo = cb
        return cb

    def _make_grid_size_spin(self) -> QSpinBox:
        sp = QSpinBox()
        sp.setRange(10, 500)
        sp.setValue(50)
        sp.setSuffix(" px")
        sp.setToolTip("Tamanho da grade")
        sp.valueChanged.connect(self._on_grid_size_changed)
        self._grid_size_spin = sp
        return sp

    # ── Menu ──────────────────────────────────────────────────────────────

    def _build_menu(self):
        mb = self.menuBar()

        # File
        fm = mb.addMenu("Arquivo")
        self._act(fm, "Novo mapa…",          self._new_map,    "Ctrl+N")
        self._act(fm, "Abrir…",              self._open_map,   "Ctrl+O")
        fm.addSeparator()
        self._act(fm, "Salvar",              self._save,       "Ctrl+S")
        self._act(fm, "Salvar como…",        self._save_as,    "Ctrl+Shift+S")
        fm.addSeparator()
        self._act(fm, "Exportar PNG…",       self._export_png, "Ctrl+E")
        fm.addSeparator()
        self._act(fm, "Fechar",              self.close,       "Ctrl+W")

        # Edit
        em = mb.addMenu("Editar")
        undo_act = self._scene.undo_stack.createUndoAction(self, "Desfazer")
        undo_act.setShortcut(QKeySequence.StandardKey.Undo)
        redo_act = self._scene.undo_stack.createRedoAction(self, "Refazer")
        redo_act.setShortcut(QKeySequence.StandardKey.Redo)
        em.addAction(undo_act)
        em.addAction(redo_act)

        # View
        vm = mb.addMenu("Visão")
        self._act(vm, "Zoom +",     self._view.zoom_in,    "Ctrl+=")
        self._act(vm, "Zoom -",     self._view.zoom_out,   "Ctrl+-")
        self._act(vm, "Reset zoom", self._view.zoom_reset, "Ctrl+0")
        vm.addSeparator()
        lm = vm.addMenu("Camadas")
        for layer in LAYER_ORDER:
            label = LAYER_LABELS.get(layer, layer)
            chk = QAction(label, self)
            chk.setCheckable(True)
            chk.setChecked(True)
            chk.toggled.connect(lambda vis, l=layer: self._scene.set_layer_visible(l, vis))
            lm.addAction(chk)

    def _act(self, menu: QMenu, label: str, slot, shortcut: str = ""):
        a = QAction(label, self)
        if shortcut:
            a.setShortcut(QKeySequence(shortcut))
        a.triggered.connect(slot)
        menu.addAction(a)
        return a

    # ── Toolbar ───────────────────────────────────────────────────────────

    def _build_toolbar(self):
        tb = QToolBar("Principal")
        tb.setObjectName("PrincipalToolBar")
        tb.setMovable(False)
        self.addToolBar(Qt.ToolBarArea.TopToolBarArea, tb)

        for label, slot in [
            ("💾 Salvar",    self._save),
            ("↩ Desfazer",  self._undo),
            ("↪ Refazer",   self._redo),
        ]:
            btn = QPushButton(label)
            btn.setFixedHeight(28)
            tb.addWidget(btn)
            btn.clicked.connect(slot)

        tb.addSeparator()

        for label, slot in [
            ("🔍+", self._view.zoom_in),
            ("🔍-", self._view.zoom_out),
            ("⊡",   self._view.zoom_reset),
        ]:
            btn = QPushButton(label)
            btn.setFixedSize(32, 28)
            tb.addWidget(btn)
            btn.clicked.connect(slot)

    # ── File operations ───────────────────────────────────────────────────

    def _load_or_init(self):
        if os.path.isfile(self._map_path):
            try:
                with open(self._map_path, "r", encoding="utf-8") as f:
                    self._map_data = json.load(f)
                return
            except Exception as e:
                self._status.showMessage(f"Erro ao carregar: {e}", 5000)
        # else start empty
        self._map_data = _empty_map(self._map_name)

    def _save(self):
        self._sync_current_level()
        os.makedirs(DATA_DIR, exist_ok=True)
        try:
            with open(self._map_path, "w", encoding="utf-8") as f:
                json.dump(self._map_data, f, ensure_ascii=False, indent=2)
            self._dirty = False
            self._update_title()
            self._status.showMessage("Salvo.", 3000)
        except Exception as e:
            QMessageBox.critical(self, "Erro", f"Não foi possível salvar:\n{e}")

    def _save_as(self):
        path, _ = QFileDialog.getSaveFileName(
            self, "Salvar mapa como…", DATA_DIR,
            "Mapas DM (*.json);;Todos (*.*)"
        )
        if path:
            self._map_path = path
            self._map_name = os.path.splitext(os.path.basename(path))[0]
            self._save()

    def _autosave(self):
        if self._dirty:
            self._save()

    def _open_map(self):
        if not self._confirm_discard():
            return
        path, _ = QFileDialog.getOpenFileName(
            self, "Abrir mapa…", DATA_DIR,
            "Mapas DM (*.json);;Todos (*.*)"
        )
        if not path:
            return
        self._map_path = path
        self._map_name = os.path.splitext(os.path.basename(path))[0]
        self._load_or_init()
        self._level_idx = self._map_data.get("level_idx", 0)
        self._load_level(self._level_idx)

    def _new_map(self):
        if not self._confirm_discard():
            return
        name, ok = QInputDialog.getText(self, "Novo mapa", "Nome do mapa:")
        if not ok or not name.strip():
            return
        self._map_name = name.strip().replace(" ", "_")
        self._map_path = os.path.join(DATA_DIR, self._map_name + ".json")
        self._map_data = _empty_map(self._map_name)
        self._level_idx = 0
        self._load_level(0)

    def _export_png(self):
        path, _ = QFileDialog.getSaveFileName(
            self, "Exportar PNG", os.path.expanduser("~"),
            "PNG (*.png);;Todos (*.*)"
        )
        if not path:
            return
        from PySide6.QtGui import QImage
        rect  = self._scene.sceneRect()
        scale = 2
        img   = QImage(int(rect.width() * scale), int(rect.height() * scale),
                       QImage.Format.Format_ARGB32)
        img.fill(0)
        from PySide6.QtGui import QPainter
        painter = QPainter(img)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.scale(scale, scale)
        painter.translate(-rect.x(), -rect.y())
        self._scene.render(painter)
        painter.end()
        if img.save(path):
            self._status.showMessage(f"Exportado: {path}", 4000)
        else:
            QMessageBox.warning(self, "Erro", "Não foi possível salvar o PNG.")

    def _confirm_discard(self) -> bool:
        if not self._dirty:
            return True
        r = QMessageBox.question(
            self, "Alterações não salvas",
            "Há alterações não salvas. Descartar?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        return r == QMessageBox.StandardButton.Yes

    # ── Levels ────────────────────────────────────────────────────────────

    def _on_level_requested(self, idx: int):
        if idx == -1:
            # Add new level
            name, ok = QInputDialog.getText(
                self, "Novo nível", "Nome do nível (ex: Cidade, Dungeon):"
            )
            if ok and name.strip():
                new_lv = {"name": name.strip(), **_empty_level()}
                self._map_data["levels"].append(new_lv)
                idx = len(self._map_data["levels"]) - 1
            else:
                return
        self._sync_current_level()
        self._load_level(idx)

    def _load_level(self, idx: int):
        levels = self._map_data.get("levels", [])
        if not levels:
            self._map_data["levels"] = [{"name": "Mundo", **_empty_level()}]
            levels = self._map_data["levels"]
        idx = max(0, min(idx, len(levels) - 1))
        self._level_idx = idx
        self._map_data["level_idx"] = idx

        lv = levels[idx]
        self._scene.load_level(
            items_data     = lv.get("items", []),
            fog_state      = lv.get("fog",   []),
            bg_style       = lv.get("bg_style",  "dark"),
            bg_color       = lv.get("bg_color",  BG_STYLES["dark"]),
            grid_type      = lv.get("grid_type", "none"),
            grid_size      = lv.get("grid_size", 50),
            layers_visible = lv.get("layers_visible", {}),
        )
        self._level_bar.refresh(levels, idx)

        # Sync controls
        bg_idx = {"dark": 0, "parchment": 1, "ocean": 2}.get(lv.get("bg_style", "dark"), 0)
        self._bg_combo.blockSignals(True)
        self._bg_combo.setCurrentIndex(bg_idx)
        self._bg_combo.blockSignals(False)

        grid_idx = {"none": 0, "square": 1, "hex": 2}.get(lv.get("grid_type", "none"), 0)
        self._grid_combo.blockSignals(True)
        self._grid_combo.setCurrentIndex(grid_idx)
        self._grid_combo.blockSignals(False)

        self._grid_size_spin.blockSignals(True)
        self._grid_size_spin.setValue(lv.get("grid_size", 50))
        self._grid_size_spin.blockSignals(False)

        self._update_title()
        self._scene.set_tool(SelectTool(self._scene))

    def _sync_current_level(self):
        """Write scene state back into map_data before switching or saving."""
        levels = self._map_data.get("levels", [])
        if not levels:
            return
        idx = self._level_idx
        if idx >= len(levels):
            return
        lv = levels[idx]
        lv["items"] = self._scene._items_data
        if self._scene.fog_item:
            lv["fog"] = self._scene.fog_item.get_state()

    # ── Background / grid controls ────────────────────────────────────────

    def _on_bg_changed(self, _):
        key   = self._bg_combo.currentData()
        color = BG_STYLES.get(key, BG_STYLES["dark"])
        self._scene.set_background(key, color)
        lv = self._current_level()
        if lv is not None:
            lv["bg_style"] = key
            lv["bg_color"] = color
        self._mark_dirty()

    def _on_grid_changed(self, _):
        key = self._grid_combo.currentData()
        self._scene._grid_type = key
        self._scene.update()
        lv = self._current_level()
        if lv is not None:
            lv["grid_type"] = key
        self._mark_dirty()

    def _on_grid_size_changed(self, val: int):
        self._scene._grid_size = val
        self._scene.update()
        lv = self._current_level()
        if lv is not None:
            lv["grid_size"] = val
        self._mark_dirty()

    def _current_level(self) -> dict | None:
        levels = self._map_data.get("levels", [])
        if 0 <= self._level_idx < len(levels):
            return levels[self._level_idx]
        return None

    # ── Misc signals ──────────────────────────────────────────────────────

    def _on_item_selected(self, data):
        pass   # PropertiesPanel handles this via its own connection

    def _on_coords(self, wx: float, wy: float, zoom: float):
        self._coord_lbl.setText(f"  {wx:.0f}, {wy:.0f}  ×{zoom:.2f}  ")

    def _mark_dirty(self):
        if not self._dirty:
            self._dirty = True
            self._update_title()

    def _update_title(self):
        star = " *" if self._dirty else ""
        lv   = self._current_level()
        lv_name = lv.get("name", "") if lv else ""
        self.setWindowTitle(
            f"DM — Editor de Mapas — {self._map_name}{star}"
            + (f" [{lv_name}]" if lv_name else "")
        )

    def _undo(self):
        self._scene.undo_stack.undo()

    def _redo(self):
        self._scene.undo_stack.redo()

    # ── Close ─────────────────────────────────────────────────────────────

    def closeEvent(self, event: QCloseEvent):
        settings = QSettings("DM", "MapEditor")
        settings.setValue("geometry",    self.saveGeometry())
        settings.setValue("windowState", self.saveState())

        if self._dirty:
            r = QMessageBox.question(
                self, "Salvar?",
                "Salvar alterações antes de fechar?",
                QMessageBox.StandardButton.Save |
                QMessageBox.StandardButton.Discard |
                QMessageBox.StandardButton.Cancel
            )
            if r == QMessageBox.StandardButton.Cancel:
                event.ignore()
                return
            if r == QMessageBox.StandardButton.Save:
                self._save()

        self._autosave_timer.stop()
        event.accept()
