"""
DM - Dungeon Music
Map Editor — ToolSidebar + PropertiesPanel (QDockWidgets).
"""

import os
import copy
import shutil

from PySide6.QtWidgets import (
    QDockWidget, QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
    QScrollArea, QPushButton, QLabel, QFrame, QSizePolicy,
    QSpinBox, QDoubleSpinBox, QLineEdit, QTextEdit, QComboBox,
    QCheckBox, QGroupBox, QFileDialog, QColorDialog,
    QToolButton, QApplication,
)
from PySide6.QtCore  import Qt, Signal, QSize
from PySide6.QtGui   import QColor, QIcon, QPixmap, QPainter

from .constants import (
    LAYER_ORDER, LAYER_LABELS, LAYER_DEFAULTS,
    TERRAIN_TYPES, SETTLEMENT_TYPES, POI_TYPES, ROAD_TYPES, WATER_TYPES,
    ICONS_DIR,
)
from .scene import (
    MapScene, SelectTool, DrawPolygonTool, DrawPolylineTool,
    PlacePointTool, FogPaintTool, MeasureTool,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _color_btn(color_str: str, parent=None) -> QPushButton:
    """Small square button filled with `color_str`."""
    btn = QPushButton(parent=parent)
    btn.setFixedSize(28, 28)
    _set_btn_color(btn, color_str)
    return btn


def _set_btn_color(btn: QPushButton, color_str: str):
    safe = color_str if color_str and color_str.startswith("#") else "#888888"
    btn.setStyleSheet(
        f"QPushButton {{ background: {safe}; border: 1px solid #3d3e5c; "
        f"border-radius: 3px; }}"
        f"QPushButton:hover {{ border: 2px solid #a78bfa; }}"
    )
    btn.setProperty("_color", safe)


def _pick_color(current: str, parent=None) -> str | None:
    """Open QColorDialog; return hex string or None if cancelled."""
    c = QColorDialog.getColor(QColor(current or "#ffffff"), parent, "Escolher Cor")
    if c.isValid():
        return c.name()
    return None


def _sep() -> QFrame:
    f = QFrame()
    f.setFrameShape(QFrame.Shape.HLine)
    f.setStyleSheet("color: #3d3e5c;")
    return f


def _make_icon_thumbnail(path: str, size: int = 22) -> QIcon | None:
    try:
        from PIL import Image
        img = Image.open(path).convert("RGBA").resize((size, size))
        import io
        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        from PySide6.QtGui import QImage
        qimg = QImage()
        qimg.loadFromData(buf.read())
        return QIcon(QPixmap.fromImage(qimg))
    except Exception:
        return None


# ─── ToolSidebar ──────────────────────────────────────────────────────────────

class ToolSidebar(QDockWidget):
    """Painel esquerdo com todas as ferramentas e botões de colocação."""

    icon_selected = Signal(str)   # emitted when user selects an icon fname

    def __init__(self, scene: MapScene, parent=None):
        super().__init__("Ferramentas", parent)
        self.scene = scene
        self._active_tool_btn: QPushButton | None = None
        self._active_icon: str = ""

        self.setFeatures(
            QDockWidget.DockWidgetFeature.DockWidgetMovable |
            QDockWidget.DockWidgetFeature.DockWidgetFloatable
        )
        self.setAllowedAreas(
            Qt.DockWidgetArea.LeftDockWidgetArea |
            Qt.DockWidgetArea.RightDockWidgetArea
        )
        self.setMinimumWidth(180)

        root = QWidget()
        self.setWidget(root)
        outer = QVBoxLayout(root)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        outer.addWidget(scroll)

        inner = QWidget()
        self._layout = QVBoxLayout(inner)
        self._layout.setContentsMargins(6, 6, 6, 6)
        self._layout.setSpacing(4)
        scroll.setWidget(inner)

        self._build()
        self._layout.addStretch()

    # ── Build ──────────────────────────────────────────────────────────────

    def _build(self):
        lay = self._layout

        # ── Main tools ────────────────────────────────────────────────────
        lay.addWidget(self._section_label("FERRAMENTAS"))
        g = QGridLayout()
        g.setSpacing(3)

        self._btn_select  = self._tool_btn("⬡ Selecionar", self._use_select)
        self._btn_measure = self._tool_btn("📐 Medir",     self._use_measure)
        g.addWidget(self._btn_select,  0, 0)
        g.addWidget(self._btn_measure, 0, 1)
        lay.addLayout(g)

        # ── Fog of War ────────────────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("NÉVOA DE GUERRA"))

        # Toggle button (not a tool button — just a regular checkable)
        self._btn_fog_on = QPushButton("☁  Névoa: OFF")
        self._btn_fog_on.setCheckable(True)
        self._btn_fog_on.setMinimumHeight(28)
        self._btn_fog_on.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._btn_fog_on.clicked.connect(self._toggle_fog_on)
        lay.addWidget(self._btn_fog_on)

        g2 = QGridLayout()
        g2.setSpacing(3)
        self._btn_fog_rev = self._tool_btn("☀  Pincel Revelar",  self._use_fog_reveal)
        self._btn_fog_con = self._tool_btn("🌑  Pincel Ocultar", self._use_fog_conceal)
        g2.addWidget(self._btn_fog_rev, 0, 0)
        g2.addWidget(self._btn_fog_con, 0, 1)
        lay.addLayout(g2)

        # Brush size slider
        brush_row = QHBoxLayout()
        brush_row.addWidget(QLabel("Pincel:"))
        self._fog_brush_spin = QSpinBox()
        self._fog_brush_spin.setRange(10, 500)
        self._fog_brush_spin.setValue(80)
        self._fog_brush_spin.setSuffix(" px")
        self._fog_brush_spin.setToolTip("Tamanho do pincel de névoa")
        brush_row.addWidget(self._fog_brush_spin)
        lay.addLayout(brush_row)

        # ── Regiões ───────────────────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("REGIÕES"))

        for text, layer, tip in [
            ("🌍 Continente", "continent", "Desenhar continente"),
            ("🏳 País",       "country",   "Desenhar país"),
            ("🌿 Região",     "region",    "Desenhar região"),
        ]:
            b = self._tool_btn(text, lambda l=layer: self._use_polygon(l))
            b.setToolTip(tip)
            lay.addWidget(b)

        # ── Água ──────────────────────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("ÁGUA"))

        for wtype, wlabel in WATER_TYPES:
            is_river = wtype == "river"
            if is_river:
                b = self._tool_btn(f"〰 {wlabel}", lambda wt=wtype: self._use_polyline("water", wt))
            else:
                b = self._tool_btn(f"💧 {wlabel}", lambda wt=wtype: self._use_polygon("water", wt))
            lay.addWidget(b)

        # ── Estradas ──────────────────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("ESTRADAS"))

        for rkey, rlabel, _rdata in ROAD_TYPES:
            b = self._tool_btn(f"🛤 {rlabel}", lambda rk=rkey: self._use_polyline("road", rk))
            lay.addWidget(b)

        # ── Terreno ───────────────────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("TERRENO"))

        g3 = QGridLayout()
        g3.setSpacing(3)
        for i, (tkey, tlabel, tsym) in enumerate(TERRAIN_TYPES):
            b = self._tool_btn(f"{tsym} {tlabel}", lambda tk=tkey: self._use_place("terrain", tk))
            g3.addWidget(b, i // 2, i % 2)
        lay.addLayout(g3)

        # ── Assentamentos ─────────────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("ASSENTAMENTOS"))

        g4 = QGridLayout()
        g4.setSpacing(3)
        for i, (skey, slabel, ssym) in enumerate(SETTLEMENT_TYPES):
            b = self._tool_btn(f"{ssym} {slabel}", lambda sk=skey: self._use_place("settlement", sk))
            g4.addWidget(b, i // 2, i % 2)
        lay.addLayout(g4)

        # ── PDI ───────────────────────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("PDI"))

        g5 = QGridLayout()
        g5.setSpacing(3)
        for i, (pkey, plabel, psym) in enumerate(POI_TYPES):
            b = self._tool_btn(f"{psym} {plabel}", lambda pk=pkey: self._use_place("poi", pk))
            g5.addWidget(b, i // 2, i % 2)
        lay.addLayout(g5)

        # ── Decoração / Tokens ─────────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("DECORAÇÃO & TOKENS"))

        for text, layer, subtype in [
            ("🔵 Token",       "token",      "token"),
            ("🧭 Bússola",     "decoration", "compass"),
            ("📜 Título",      "decoration", "map_title"),
            ("📝 Nota",        "note",       "note"),
        ]:
            b = self._tool_btn(text, lambda la=layer, st=subtype: self._use_place(la, st))
            lay.addWidget(b)

        # ── Ícones Personalizados ──────────────────────────────────────────
        lay.addWidget(_sep())
        lay.addWidget(self._section_label("ÍCONES PERSONALIZADOS"))

        btn_import = QPushButton("📁 Importar PNG...")
        btn_import.clicked.connect(self._import_icon)
        lay.addWidget(btn_import)

        self._icon_grid = QGridLayout()
        self._icon_grid.setSpacing(3)
        lay.addLayout(self._icon_grid)
        self._refresh_icon_grid()

    # ── Section label ─────────────────────────────────────────────────────

    def _section_label(self, text: str) -> QLabel:
        lbl = QLabel(text)
        lbl.setProperty("accent", True)
        lbl.setStyleSheet(
            "font-size: 8pt; font-weight: bold; color: #a78bfa; padding: 2px 0;"
        )
        return lbl

    # ── Tool button factory ───────────────────────────────────────────────

    def _tool_btn(self, text: str, callback) -> QPushButton:
        btn = QPushButton(text)
        btn.setCheckable(True)
        btn.setMinimumHeight(26)
        btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        btn.clicked.connect(lambda checked, b=btn, cb=callback: self._activate(b, cb))
        return btn

    def _activate(self, btn: QPushButton, callback):
        if self._active_tool_btn and self._active_tool_btn is not btn:
            self._active_tool_btn.setChecked(False)
        self._active_tool_btn = btn
        btn.setChecked(True)
        callback()

    # ── Tool setters ──────────────────────────────────────────────────────

    def _use_select(self):
        self.scene.set_tool(SelectTool(self.scene))

    def _use_measure(self):
        self.scene.set_tool(MeasureTool(self.scene))

    def _toggle_fog_on(self):
        fog = self.scene.fog_item
        if not fog:
            return
        enabled = not fog.enabled   # use the property, not isVisible()
        fog.set_enabled(enabled)
        self._btn_fog_on.setText("☁  Névoa: ON" if enabled else "☁  Névoa: OFF")
        self._btn_fog_on.setChecked(enabled)

    def _use_fog_reveal(self):
        fog = self.scene.fog_item
        if fog and not fog.enabled:
            fog.set_enabled(True)
            self._btn_fog_on.setText("☁  Névoa: ON")
            self._btn_fog_on.setChecked(True)
        r = float(self._fog_brush_spin.value())
        self.scene.set_tool(FogPaintTool(self.scene, "reveal", brush_r=r))

    def _use_fog_conceal(self):
        fog = self.scene.fog_item
        if fog and not fog.enabled:
            fog.set_enabled(True)
            self._btn_fog_on.setText("☁  Névoa: ON")
            self._btn_fog_on.setChecked(True)
        r = float(self._fog_brush_spin.value())
        self.scene.set_tool(FogPaintTool(self.scene, "conceal", brush_r=r))

    def _use_polygon(self, layer: str, subtype: str = ""):
        self.scene.set_tool(DrawPolygonTool(self.scene, layer, subtype))

    def _use_polyline(self, layer: str, subtype: str = ""):
        self.scene.set_tool(DrawPolylineTool(self.scene, layer, subtype))

    def _use_place(self, layer: str, subtype: str, extra: dict = None):
        self.scene.set_tool(PlacePointTool(self.scene, layer, subtype, extra or {}))

    # ── Icon import ───────────────────────────────────────────────────────

    def _import_icon(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Importar Ícone",
            os.path.expanduser("~"),
            "Imagens (*.png *.jpg *.gif *.ico *.webp);;Todos (*.*)"
        )
        if not path:
            return
        os.makedirs(ICONS_DIR, exist_ok=True)
        fname = os.path.basename(path)
        dest  = os.path.join(ICONS_DIR, fname)
        if not os.path.abspath(dest).startswith(os.path.abspath(ICONS_DIR)):
            return  # path traversal guard
        shutil.copy2(path, dest)
        self._refresh_icon_grid()

    def _refresh_icon_grid(self):
        # Clear old buttons
        while self._icon_grid.count():
            item = self._icon_grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        os.makedirs(ICONS_DIR, exist_ok=True)
        exts = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp')
        icons = [f for f in sorted(os.listdir(ICONS_DIR))
                 if f.lower().endswith(exts)][:32]

        for i, fname in enumerate(icons):
            path = os.path.join(ICONS_DIR, fname)
            icon = _make_icon_thumbnail(path, 26)
            btn  = QToolButton()
            btn.setFixedSize(36, 36)
            btn.setToolTip(fname)
            if icon:
                btn.setIcon(icon)
                btn.setIconSize(QSize(26, 26))
            else:
                btn.setText(fname[:3])
            btn.clicked.connect(lambda _, f=fname: self._select_icon(f))
            self._icon_grid.addWidget(btn, i // 4, i % 4)

    def _select_icon(self, fname: str):
        self._active_icon = fname
        self._use_place("poi", "image_icon", {"image_path": fname})
        self.icon_selected.emit(fname)


# ─── PropertiesPanel ──────────────────────────────────────────────────────────

class PropertiesPanel(QDockWidget):
    """Painel direito: exibe e edita propriedades do item selecionado."""

    def __init__(self, scene: MapScene, parent=None):
        super().__init__("Propriedades", parent)
        self.scene = scene
        self._current_data: dict | None = None

        self.setFeatures(
            QDockWidget.DockWidgetFeature.DockWidgetMovable |
            QDockWidget.DockWidgetFeature.DockWidgetFloatable
        )
        self.setAllowedAreas(
            Qt.DockWidgetArea.LeftDockWidgetArea |
            Qt.DockWidgetArea.RightDockWidgetArea
        )
        self.setMinimumWidth(220)

        self._root = QWidget()
        self.setWidget(self._root)
        self._outer = QVBoxLayout(self._root)
        self._outer.setContentsMargins(0, 0, 0, 0)

        self._empty_label = QLabel("Nenhum item\nselecionado")
        self._empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty_label.setStyleSheet("color: #94a3b8; font-size: 10pt;")
        self._outer.addWidget(self._empty_label)

        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll.hide()
        self._outer.addWidget(self._scroll)

        # Connect scene signal
        scene.item_selected.connect(self._on_item_selected)

    # ── Slot ──────────────────────────────────────────────────────────────

    def _on_item_selected(self, data):
        self._current_data = data
        if data is None:
            self._scroll.hide()
            self._empty_label.show()
        else:
            self._empty_label.hide()
            self._rebuild(data)
            self._scroll.show()

    # ── Build panel for data ───────────────────────────────────────────────

    def _rebuild(self, data: dict):
        # Replace scroll contents
        content = QWidget()
        lay = QVBoxLayout(content)
        lay.setContentsMargins(8, 8, 8, 8)
        lay.setSpacing(6)
        self._scroll.setWidget(content)

        t = data.get("type", "")

        # ── Title ─────────────────────────────────────────────────────────
        title_lbl = QLabel(LAYER_LABELS.get(t, t.title()))
        title_lbl.setStyleSheet("font-weight: bold; font-size: 11pt; color: #a78bfa;")
        lay.addWidget(title_lbl)
        lay.addWidget(_sep())

        # ── Widgets dict (field_key → widget) for _apply() ──────────────
        self._fields: dict = {}

        # ── Name / Text ───────────────────────────────────────────────────
        if t == "map_title":
            self._field_text(lay, "text", "Texto", data)
        elif t in ("note",):
            self._field_text(lay, "text", "Texto", data)
        elif "name" in data and t not in ("continent", "country", "region", "water", "road"):
            self._field_line(lay, "name", "Nome", data)

        # ── Polygon name ──────────────────────────────────────────────────
        if t in ("continent", "country", "region", "water"):
            self._field_line(lay, "name", "Nome", data)

        # ── Colors ────────────────────────────────────────────────────────
        if t in ("continent", "country", "region"):
            self._field_color(lay, "fill",         "Preenchimento", data)
            self._field_color(lay, "outline",       "Contorno",      data)
            self._field_color(lay, "text_color",    "Cor texto",     data)
            self._field_spin(lay,  "outline_width", "Esp. contorno", data, 0, 20)

        elif t == "water":
            self._field_color(lay, "fill",         "Preenchimento", data)
            self._field_color(lay, "outline",       "Contorno",      data)
            self._field_spin(lay,  "outline_width", "Esp. contorno", data, 0, 20)

        elif t == "road":
            self._field_color(lay, "color", "Cor",       data)
            self._field_spin(lay,  "width", "Espessura", data, 1, 30)
            self._field_combo(lay, "road_type", "Tipo",  data,
                              [(rk, rl) for rk, rl, _ in ROAD_TYPES])

        elif t == "terrain":
            self._field_color(lay, "color", "Cor",   data)
            self._field_spin(lay,  "size",  "Tamanho", data, 8, 200)

        elif t == "settlement":
            self._field_color(lay, "color",       "Cor símbolo",  data)
            self._field_color(lay, "label_color", "Cor rótulo",   data)
            self._field_spin(lay,  "size",        "Tamanho",      data, 6, 200)

        elif t == "poi":
            self._field_color(lay, "color", "Cor",     data)
            self._field_spin(lay,  "size",  "Tamanho", data, 6, 200)

        elif t == "note":
            self._field_color(lay, "color", "Cor",     data)
            self._field_spin(lay,  "size",  "Tamanho", data, 6, 80)

        elif t == "token":
            self._field_color(lay, "color", "Cor",     data)
            self._field_spin(lay,  "size",  "Tamanho", data, 8, 200)

        elif t == "image_icon":
            self._field_spin(lay, "size", "Tamanho", data, 8, 1000)
            self._field_icon_path(lay, data)

        elif t == "map_title":
            self._field_color(lay, "color",     "Cor texto", data)
            self._field_color(lay, "box_color", "Cor caixa", data)
            self._field_spin(lay,  "size",      "Tamanho",   data, 10, 200)

        # ── Rotation ──────────────────────────────────────────────────────
        if "rotation" in data:
            self._field_spin(lay, "rotation", "Rotação (°)", data, 0, 359)

        # ── Layer visibility ──────────────────────────────────────────────
        lay.addWidget(_sep())
        layer = data.get("layer", "")
        lbl = QLabel(f"Camada: {LAYER_LABELS.get(layer, layer)}")
        lbl.setStyleSheet("color: #94a3b8; font-size: 9pt;")
        lay.addWidget(lbl)

        # ── Buttons ───────────────────────────────────────────────────────
        lay.addWidget(_sep())
        btn_row = QHBoxLayout()

        btn_apply = QPushButton("✔ Aplicar")
        btn_apply.setProperty("accent", True)
        btn_apply.clicked.connect(self._apply)
        btn_row.addWidget(btn_apply)

        btn_del = QPushButton("✖ Deletar")
        btn_del.setProperty("danger", True)
        btn_del.clicked.connect(self._delete)
        btn_row.addWidget(btn_del)

        lay.addLayout(btn_row)
        lay.addStretch()

    # ── Field builders ─────────────────────────────────────────────────────

    def _field_line(self, lay, key: str, label: str, data: dict):
        lay.addWidget(QLabel(label + ":"))
        w = QLineEdit(str(data.get(key, "")))
        lay.addWidget(w)
        self._fields[key] = w

    def _field_text(self, lay, key: str, label: str, data: dict):
        lay.addWidget(QLabel(label + ":"))
        w = QTextEdit(str(data.get(key, "")))
        w.setMaximumHeight(70)
        lay.addWidget(w)
        self._fields[key] = w

    def _field_color(self, lay, key: str, label: str, data: dict):
        row = QHBoxLayout()
        row.addWidget(QLabel(label + ":"))
        val = data.get(key, "#888888") or "#888888"
        btn = _color_btn(val, self._root)
        btn.clicked.connect(lambda _, b=btn, k=key: self._on_pick_color(b, k))
        row.addWidget(btn)
        row.addStretch()
        lay.addLayout(row)
        self._fields[key] = btn

    def _field_spin(self, lay, key: str, label: str, data: dict,
                    min_v: int = 0, max_v: int = 200):
        row = QHBoxLayout()
        row.addWidget(QLabel(label + ":"))
        w = QSpinBox()
        w.setRange(min_v, max_v)
        w.setWrapping(key == "rotation")
        w.setValue(int(data.get(key, 0) or 0))
        row.addWidget(w)
        row.addStretch()
        lay.addLayout(row)
        self._fields[key] = w

    def _field_combo(self, lay, key: str, label: str, data: dict,
                     options: list[tuple[str, str]]):
        lay.addWidget(QLabel(label + ":"))
        w = QComboBox()
        for val, txt in options:
            w.addItem(txt, val)
        cur = data.get(key, "")
        idx = next((i for i, (v, _) in enumerate(options) if v == cur), 0)
        w.setCurrentIndex(idx)
        lay.addWidget(w)
        self._fields[key] = w

    def _field_icon_path(self, lay, data: dict):
        os.makedirs(ICONS_DIR, exist_ok=True)
        exts = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp')
        icons = [""] + [f for f in sorted(os.listdir(ICONS_DIR))
                        if f.lower().endswith(exts)]
        self._field_combo(lay, "image_path", "Ícone", data,
                          [(f, f or "— nenhum —") for f in icons])

    # ── Color pick callback ────────────────────────────────────────────────

    def _on_pick_color(self, btn: QPushButton, key: str):
        cur = btn.property("_color") or "#888888"
        new = _pick_color(cur, self._root)
        if new:
            _set_btn_color(btn, new)

    # ── Apply ─────────────────────────────────────────────────────────────

    def _apply(self):
        data = self._current_data
        if data is None:
            return
        old = copy.deepcopy(data)
        new = copy.deepcopy(data)

        for key, widget in self._fields.items():
            if isinstance(widget, QLineEdit):
                new[key] = widget.text()
            elif isinstance(widget, QTextEdit):
                new[key] = widget.toPlainText()
            elif isinstance(widget, QSpinBox):
                new[key] = widget.value()
            elif isinstance(widget, QComboBox):
                new[key] = widget.currentData()
            elif isinstance(widget, QPushButton):
                # Color button
                new[key] = widget.property("_color") or "#888888"

        self.scene.edit_item(old, new)
        self._current_data = new

    # ── Delete ─────────────────────────────────────────────────────────────

    def _delete(self):
        if self._current_data:
            self.scene.remove_item(self._current_data)
            self._current_data = None
            self._scroll.hide()
            self._empty_label.show()
