"""
DM - Dungeon Music
Map Editor — MapScene + MapView + sistema de ferramentas.
"""

import copy
import uuid
import math
import io

from PySide6.QtWidgets import (
    QGraphicsScene, QGraphicsView, QGraphicsItem,
    QGraphicsEllipseItem, QGraphicsLineItem, QInputDialog,
    QApplication,
)
from PySide6.QtCore    import Qt, QRectF, QPointF, QLineF, Signal, QObject
from PySide6.QtGui     import (
    QPainter, QPen, QBrush, QColor, QPolygonF, QPainterPath,
    QKeyEvent, QUndoStack, QUndoCommand, QPixmap, QImage,
)

try:
    from PySide6.QtOpenGLWidgets import QOpenGLWidget
    _OPENGL_AVAILABLE = True
except ImportError:
    _OPENGL_AVAILABLE = False

from .constants import (
    LAYER_ORDER, LAYER_Z, LAYER_DEFAULTS, BG_STYLES, SCENE_RECT,
    COUNTRY_COLORS, TERRAIN_TYPES, SETTLEMENT_TYPES, POI_TYPES,
    ROAD_TYPES, ICONS_DIR,
)
from .items import (
    create_item, FogItem, RegionItem, WaterItem, RoadItem,
    BaseMapItem, clear_pixmap_cache,
)


# ─── Undo Commands ────────────────────────────────────────────────────────────

class AddItemCmd(QUndoCommand):
    def __init__(self, scene: "MapScene", data: dict):
        super().__init__(f"Adicionar {data.get('type', '?')}")
        self._scene = scene
        self._data  = data

    def redo(self):
        self._scene._do_add(self._data)

    def undo(self):
        self._scene._do_remove(self._data["id"])


class RemoveItemCmd(QUndoCommand):
    def __init__(self, scene: "MapScene", data: dict):
        super().__init__(f"Remover {data.get('type', '?')}")
        self._scene = scene
        self._data  = copy.deepcopy(data)

    def redo(self):
        self._scene._do_remove(self._data["id"])

    def undo(self):
        self._scene._do_add(self._data)


class EditItemCmd(QUndoCommand):
    def __init__(self, scene: "MapScene", old_data: dict, new_data: dict):
        super().__init__(f"Editar {new_data.get('type', '?')}")
        self._scene    = scene
        self._old_data = copy.deepcopy(old_data)
        self._new_data = copy.deepcopy(new_data)

    def redo(self):
        self._scene._do_update(self._new_data)

    def undo(self):
        self._scene._do_update(self._old_data)


# ─── Tools ────────────────────────────────────────────────────────────────────

class BaseTool:
    def __init__(self, scene: "MapScene"):
        self.scene = scene

    def activate(self):   pass
    def deactivate(self): pass

    def mouse_press(self, event) -> bool:   return False
    def mouse_move(self,  event) -> bool:   return False
    def mouse_release(self, event) -> bool: return False
    def key_press(self, event: QKeyEvent) -> bool: return False
    def double_click(self, event) -> bool:  return False


class SelectTool(BaseTool):
    """Seleciona, move e edita itens. Qt cuida do drag automaticamente."""

    def activate(self):
        if self.scene.views():
            self.scene.views()[0].setDragMode(QGraphicsView.DragMode.NoDrag)

    def key_press(self, event: QKeyEvent) -> bool:
        if event.key() == Qt.Key.Key_Delete:
            for item in self.scene.selectedItems():
                if isinstance(getattr(item, "data", None), dict):
                    self.scene.remove_item(item.data)
            return True
        # Rotate selected with Q/E
        if event.key() == Qt.Key.Key_Q:
            self._rotate_selected(-15)
            return True
        if event.key() == Qt.Key.Key_E:
            self._rotate_selected(15)
            return True
        return False

    def _rotate_selected(self, delta: int):
        for item in self.scene.selectedItems():
            if isinstance(getattr(item, "data", None), dict) and "rotation" in item.data:
                item.data["rotation"] = (item.data.get("rotation", 0) + delta) % 360
                item.setRotation(item.data["rotation"])
                self.scene.on_item_changed()


class DrawPolygonTool(BaseTool):
    """Desenha polígonos (país, continente, região, água)."""

    def __init__(self, scene: "MapScene", layer: str, subtype: str = ""):
        super().__init__(scene)
        self.layer   = layer
        self.subtype = subtype
        self._pts: list[QPointF] = []
        self._preview_items: list = []
        self._last_mouse: QPointF = QPointF(0, 0)

    def activate(self):
        self._pts.clear()
        self._clear_preview()

    def deactivate(self):
        self._pts.clear()
        self._clear_preview()

    def mouse_press(self, event) -> bool:
        if event.button() == Qt.MouseButton.LeftButton:
            self._pts.append(event.scenePos())
            self._update_preview(event.scenePos())
            return True
        if event.button() == Qt.MouseButton.RightButton:
            if len(self._pts) >= 3:
                self._finish()
            else:
                self._cancel()
            return True
        return False

    def mouse_move(self, event) -> bool:
        self._last_mouse = event.scenePos()
        if self._pts:
            self._update_preview(event.scenePos())
            return True
        return False

    def key_press(self, event: QKeyEvent) -> bool:
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            if len(self._pts) >= 3:
                self._finish()
            return True
        if event.key() == Qt.Key.Key_Escape:
            self._cancel()
            return True
        return False

    def _clear_preview(self):
        for item in self._preview_items:
            if item.scene():
                self.scene.removeItem(item)
        self._preview_items.clear()

    def _update_preview(self, current: QPointF):
        self._clear_preview()
        pts = list(self._pts) + [current]
        if len(pts) >= 2:
            poly = QPolygonF(pts)
            pen  = QPen(QColor("#00ff88"), 2, Qt.PenStyle.DashLine)
            pen.setCosmetic(True)
            item = self.scene.addPolygon(poly, pen)
            item.setZValue(999)
            self._preview_items.append(item)
        # Vertex dots
        for pt in self._pts:
            dot = self.scene.addEllipse(
                QRectF(pt.x()-5, pt.y()-5, 10, 10),
                QPen(QColor("#ffffff"), 1),
                QBrush(QColor("#00ff88"))
            )
            dot.setZValue(999)
            self._preview_items.append(dot)

    def _finish(self):
        pts = [(p.x(), p.y()) for p in self._pts]
        self._cancel()
        self.scene.finish_polygon(pts, self.layer, self.subtype)

    def _cancel(self):
        self._pts.clear()
        self._clear_preview()
        self.scene.notify_status("Desenho cancelado.")


class DrawPolylineTool(BaseTool):
    """Desenha polilinhas (estradas, rios)."""

    def __init__(self, scene: "MapScene", layer: str, subtype: str = ""):
        super().__init__(scene)
        self.layer   = layer
        self.subtype = subtype
        self._pts: list[QPointF] = []
        self._preview_items: list = []

    def activate(self):
        self._pts.clear()
        self._clear_preview()

    def deactivate(self):
        self._pts.clear()
        self._clear_preview()

    def mouse_press(self, event) -> bool:
        if event.button() == Qt.MouseButton.LeftButton:
            self._pts.append(event.scenePos())
            self._update_preview(event.scenePos())
            return True
        if event.button() == Qt.MouseButton.RightButton:
            if len(self._pts) >= 2:
                self._finish()
            else:
                self._cancel()
            return True
        return False

    def mouse_move(self, event) -> bool:
        if self._pts:
            self._update_preview(event.scenePos())
            return True
        return False

    def key_press(self, event: QKeyEvent) -> bool:
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            if len(self._pts) >= 2:
                self._finish()
            return True
        if event.key() == Qt.Key.Key_Escape:
            self._cancel()
            return True
        return False

    def _clear_preview(self):
        for item in self._preview_items:
            if item.scene():
                self.scene.removeItem(item)
        self._preview_items.clear()

    def _update_preview(self, current: QPointF):
        self._clear_preview()
        pts = list(self._pts) + [current]
        if len(pts) >= 2:
            for i in range(len(pts) - 1):
                line = self.scene.addLine(
                    QLineF(pts[i], pts[i+1]),
                    QPen(QColor("#00aaff"), 2, Qt.PenStyle.DashLine)
                )
                line.setZValue(999)
                self._preview_items.append(line)
        for pt in self._pts:
            dot = self.scene.addEllipse(
                QRectF(pt.x()-5, pt.y()-5, 10, 10),
                QPen(QColor("#ffffff"), 1),
                QBrush(QColor("#00aaff"))
            )
            dot.setZValue(999)
            self._preview_items.append(dot)

    def _finish(self):
        pts = [(p.x(), p.y()) for p in self._pts]
        self._cancel()
        self.scene.finish_polyline(pts, self.layer, self.subtype)

    def _cancel(self):
        self._pts.clear()
        self._clear_preview()
        self.scene.notify_status("Desenho cancelado.")


class PlacePointTool(BaseTool):
    """Coloca um item de ponto com um clique."""

    def __init__(self, scene: "MapScene", layer: str, subtype: str, extra: dict = None):
        super().__init__(scene)
        self.layer   = layer
        self.subtype = subtype
        self.extra   = extra or {}

    def mouse_press(self, event) -> bool:
        if event.button() == Qt.MouseButton.LeftButton:
            pos = event.scenePos()
            self.scene.place_point(pos.x(), pos.y(), self.layer, self.subtype, self.extra)
            return True
        return False


class FogPaintTool(BaseTool):
    """Pinta (revela) a névoa de guerra."""

    def __init__(self, scene: "MapScene", mode: str = "reveal", brush_r: float = 80.0):
        super().__init__(scene)
        self.mode      = mode   # "reveal" ou "conceal"
        self._painting = False
        self._brush_r  = brush_r
        self._cursor_item = None  # ghost circle following the mouse

    def activate(self):
        # Create ghost cursor circle
        color = "#ffdd44" if self.mode == "reveal" else "#4488ff"
        pen  = QPen(QColor(color), 2, Qt.PenStyle.DashLine)
        pen.setCosmetic(True)
        r = self._brush_r
        self._cursor_item = self.scene.addEllipse(
            QRectF(-r, -r, r * 2, r * 2), pen, QBrush(Qt.BrushStyle.NoBrush)
        )
        self._cursor_item.setZValue(999)
        if self.scene.views():
            self.scene.views()[0].setCursor(Qt.CursorShape.CrossCursor)

    def deactivate(self):
        if self._cursor_item and self._cursor_item.scene():
            self.scene.removeItem(self._cursor_item)
        self._cursor_item = None
        if self.scene.views():
            self.scene.views()[0].unsetCursor()

    def mouse_press(self, event) -> bool:
        if event.button() == Qt.MouseButton.LeftButton:
            self._painting = True
            self._paint(event.scenePos())
            return True
        return False

    def mouse_move(self, event) -> bool:
        pos = event.scenePos()
        if self._cursor_item:
            self._cursor_item.setPos(pos)
        if self._painting:
            self._paint(pos)
        return True   # always consume so cursor updates

    def mouse_release(self, event) -> bool:
        if event.button() == Qt.MouseButton.LeftButton:
            self._painting = False
            self.scene.on_item_changed()
            return True
        return False

    def _paint(self, pos: QPointF):
        fog = self.scene.fog_item
        if fog:
            if self.mode == "reveal":
                fog.reveal(pos.x(), pos.y(), self._brush_r)
            else:
                fog.conceal(pos.x(), pos.y(), self._brush_r)


class MeasureTool(BaseTool):
    """Mede distâncias no mapa."""

    def __init__(self, scene: "MapScene"):
        super().__init__(scene)
        self._start: QPointF | None = None
        self._line_item = None

    def mouse_press(self, event) -> bool:
        if event.button() == Qt.MouseButton.LeftButton:
            self._start = event.scenePos()
            return True
        return False

    def mouse_move(self, event) -> bool:
        if self._start:
            if self._line_item and self._line_item.scene():
                self.scene.removeItem(self._line_item)
            pen = QPen(QColor("#ffff00"), 2, Qt.PenStyle.DashLine)
            pen.setCosmetic(True)
            self._line_item = self.scene.addLine(
                QLineF(self._start, event.scenePos()), pen
            )
            self._line_item.setZValue(998)
            dist = math.hypot(event.scenePos().x() - self._start.x(),
                              event.scenePos().y() - self._start.y())
            days = dist / 100  # 100 units = 1 day travel (approximate)
            self.scene.notify_status(
                f"Distância: {dist:.0f} unidades ≈ {days:.1f} dias a pé"
            )
            return True
        return False

    def mouse_release(self, event) -> bool:
        if event.button() == Qt.MouseButton.LeftButton:
            self._start = None
            return True
        return False

    def deactivate(self):
        if self._line_item and self._line_item.scene():
            self.scene.removeItem(self._line_item)
        self._line_item = None
        self._start     = None


# ─── MapScene ─────────────────────────────────────────────────────────────────

class MapScene(QGraphicsScene):
    """Cena principal do mapa. Gerencia itens, ferramentas e undo/redo."""

    item_selected = Signal(object)    # data dict | None
    status_msg    = Signal(str)
    map_changed   = Signal()          # autosave trigger
    level_changed = Signal(str)       # level name

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setSceneRect(QRectF(*SCENE_RECT))

        # State
        self._tool: BaseTool = SelectTool(self)
        self._bg_style  = "dark"
        self._bg_color  = BG_STYLES["dark"]
        self._grid_type = "none"
        self._grid_size = 50
        self._layers_visible: dict = {l: True for l in LAYER_ORDER}

        # Current level data (items list is shared with window's map_data)
        self._items_data: list = []

        # Fog of war
        self.fog_item = FogItem()
        self.addItem(self.fog_item)

        # Undo stack
        self.undo_stack = QUndoStack(self)

        # Parchment texture
        self._bg_pixmap: QPixmap | None = None

        self.selectionChanged.connect(self._on_selection_changed)

    # ── Background ────────────────────────────────────────────────────────────

    def set_background(self, style: str, color: str):
        self._bg_style = style
        self._bg_color = color
        if style == "parchment":
            self._bg_pixmap = self._make_parchment(800, 600)
        else:
            self._bg_pixmap = None
        self.update()

    def _make_parchment(self, w: int, h: int) -> QPixmap | None:
        try:
            from PIL import Image, ImageFilter, ImageDraw
            import random as _rng
            rng = _rng.Random(42)
            base = (200, 170, 118)
            img = Image.new("RGB", (w, h), base)
            px  = img.load()
            for y in range(h):
                for x in range(w):
                    n = rng.randint(-18, 18)
                    px[x, y] = (
                        max(0, min(255, base[0] + n)),
                        max(0, min(255, base[1] + n - 4)),
                        max(0, min(255, base[2] + n - 10)),
                    )
            img = img.filter(ImageFilter.GaussianBlur(1.2))
            overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)
            steps = 30
            for i in range(steps):
                alpha = int(55 * (i / steps) ** 2)
                m = i * max(w, h) // (steps * 2)
                draw.rectangle([m, m, w - m, h - m], outline=(80, 50, 20, alpha))
            img = img.convert("RGBA")
            from PIL import Image as _Img
            img = _Img.alpha_composite(img, overlay).convert("RGB")
            buf = io.BytesIO()
            img.save(buf, "PNG")
            buf.seek(0)
            qimg = QImage()
            qimg.loadFromData(buf.read())
            return QPixmap.fromImage(qimg)
        except Exception:
            return None

    def drawBackground(self, painter: QPainter, rect: QRectF):
        if self._bg_style == "parchment" and self._bg_pixmap:
            painter.drawTiledPixmap(rect, self._bg_pixmap)
        else:
            painter.fillRect(rect, QColor(self._bg_color))

        if self._grid_type != "none":
            self._draw_grid(painter, rect)

    def _draw_grid(self, painter: QPainter, rect: QRectF):
        gs = float(self._grid_size)
        dark = QColor(self._bg_color).lightness() < 128
        col  = QColor("#4a4a5a" if dark else "#888878")
        pen  = QPen(col, 0)   # 0 = cosmetic 1px
        pen.setCosmetic(True)
        painter.setPen(pen)

        if self._grid_type == "square":
            x = math.floor(rect.left()  / gs) * gs
            while x <= rect.right():
                painter.drawLine(QPointF(x, rect.top()), QPointF(x, rect.bottom()))
                x += gs
            y = math.floor(rect.top() / gs) * gs
            while y <= rect.bottom():
                painter.drawLine(QPointF(rect.left(), y), QPointF(rect.right(), y))
                y += gs

        elif self._grid_type == "hex":
            r    = gs / 2
            hw   = r * 2
            hh   = math.sqrt(3) * r
            cols = int((rect.width()  / (hw * 0.75)) + 3)
            rows = int((rect.height() / hh) + 3)
            ox   = math.floor(rect.left() / (hw * 1.5)) * hw * 1.5
            oy   = math.floor(rect.top()  / hh) * hh
            for ci in range(cols + 2):
                for ri in range(rows + 2):
                    cx = ci * hw * 0.75 + ox
                    cy = ri * hh + oy
                    if ci % 2 == 1:
                        cy += hh / 2
                    pts = QPolygonF([
                        QPointF(cx + r * math.cos(math.pi / 3 * a - math.pi / 6),
                                cy + r * math.sin(math.pi / 3 * a - math.pi / 6))
                        for a in range(6)
                    ])
                    painter.drawPolygon(pts)

    # ── Tool management ───────────────────────────────────────────────────────

    def set_tool(self, tool: BaseTool):
        self._tool.deactivate()
        self._tool = tool
        self._tool.activate()
        for item in self.items():
            if isinstance(item, QGraphicsItem):
                movable = isinstance(tool, SelectTool)
                if isinstance(getattr(item, "data", None), dict):
                    item.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, movable)

    # ── Layer visibility ──────────────────────────────────────────────────────

    def set_layer_visible(self, layer: str, visible: bool):
        self._layers_visible[layer] = visible
        for item in self.items():
            if isinstance(getattr(item, "data", None), dict) and item.data.get("layer") == layer:
                item.setVisible(visible)

    # ── Load level ────────────────────────────────────────────────────────────

    def load_level(self, items_data: list, fog_state: list | dict | None,
                   bg_style: str, bg_color: str,
                   grid_type: str, grid_size: int,
                   layers_visible: dict):
        # Remove all items except fog
        for item in list(self.items()):
            if item is not self.fog_item:
                self.removeItem(item)

        self._items_data = items_data
        self._bg_style   = bg_style
        self._bg_color   = bg_color
        self._grid_type  = grid_type
        self._grid_size  = grid_size
        self._layers_visible = {**{l: True for l in LAYER_ORDER}, **layers_visible}

        self.set_background(bg_style, bg_color)

        for data in items_data:
            gi = create_item(data)
            if gi:
                self.addItem(gi)
                layer = data.get("layer", "note")
                gi.setVisible(self._layers_visible.get(layer, True))

        # Fog
        if fog_state:
            self.fog_item.set_revealed(fog_state)
        else:
            self.fog_item.set_revealed([])
        self.fog_item.set_enabled(False)

        self.undo_stack.clear()
        clear_pixmap_cache()

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def add_item(self, data: dict):
        self.undo_stack.push(AddItemCmd(self, data))

    def remove_item(self, data: dict):
        self.undo_stack.push(RemoveItemCmd(self, data))

    def edit_item(self, old_data: dict, new_data: dict):
        self.undo_stack.push(EditItemCmd(self, old_data, new_data))

    def _do_add(self, data: dict):
        self._items_data.append(data)
        gi = create_item(data)
        if gi:
            self.addItem(gi)
            gi.setVisible(self._layers_visible.get(data.get("layer", "note"), True))
            self.clearSelection()
            gi.setSelected(True)
        self.map_changed.emit()

    def _do_remove(self, iid: str):
        self._items_data = [d for d in self._items_data if d["id"] != iid]
        for item in self.items():
            if isinstance(getattr(item, "data", None), dict) and item.data.get("id") == iid:
                self.removeItem(item)
                break
        self.map_changed.emit()

    def _do_update(self, new_data: dict):
        iid = new_data["id"]
        for i, d in enumerate(self._items_data):
            if d["id"] == iid:
                self._items_data[i] = new_data
                break
        for item in self.items():
            if isinstance(getattr(item, "data", None), dict) and item.data.get("id") == iid:
                item.data.update(new_data)
                if hasattr(item, "sync_from_data"):
                    item.sync_from_data()
                elif hasattr(item, "_rebuild"):
                    item._rebuild()
                    item.update()
                break
        clear_pixmap_cache()
        self.map_changed.emit()

    def on_item_changed(self):
        self.map_changed.emit()

    # ── Tool actions ──────────────────────────────────────────────────────────

    def finish_polygon(self, pts: list, layer: str, subtype: str):
        defs = dict(LAYER_DEFAULTS.get(layer, {}))
        name, ok = QInputDialog.getText(
            self.views()[0] if self.views() else None, "Nome", "Nome (opcional):"
        )
        if not ok:
            name = ""

        if layer in ("continent", "country", "region"):
            fill = self._next_country_color() if layer == "country" else defs.get("fill", "#c8b87a")
            data = {
                "id": str(uuid.uuid4()), "type": layer, "layer": layer,
                "points": [list(p) for p in pts],
                "name": name,
                "fill": fill,
                "outline": defs.get("outline", "#555555"),
                "outline_width": defs.get("outline_width", 2),
                "text_color": defs.get("text_color", "#ffffff"),
            }
            if layer == "country":
                data["border_style"] = "dashed"

        elif layer == "water":
            data = {
                "id": str(uuid.uuid4()), "type": "water", "layer": "water",
                "points": [list(p) for p in pts],
                "name": name,
                "water_type": subtype or "sea",
                "fill": defs.get("fill", "#4a7ab0"),
                "outline": defs.get("outline", "#2050a0"),
                "outline_width": defs.get("outline_width", 1),
                "text_color": defs.get("text_color", "#c8e0ff"),
            }
        else:
            data = {
                "id": str(uuid.uuid4()), "type": "region", "layer": "region",
                "points": [list(p) for p in pts],
                "name": name,
                "fill": defs.get("fill", "#3a6b35"),
                "outline": defs.get("outline", "#111111"),
                "outline_width": 2,
                "text_color": "#ffffff",
            }
        self.add_item(data)

    def finish_polyline(self, pts: list, layer: str, subtype: str):
        defs = dict(LAYER_DEFAULTS.get(layer, {}))
        if layer == "water":
            data = {
                "id": str(uuid.uuid4()), "type": "water", "layer": "water",
                "points": [list(p) for p in pts],
                "name": "",
                "water_type": "river",
                "fill": defs.get("fill", "#4a7ab0"),
                "outline": defs.get("outline", "#2050a0"),
                "outline_width": 2,
            }
        else:  # road
            data = {
                "id": str(uuid.uuid4()), "type": "road", "layer": "road",
                "points": [list(p) for p in pts],
                "road_type": subtype or "road",
                "color": defs.get("color", "#8b6030"),
                "width": 3,
            }
        self.add_item(data)

    def place_point(self, wx: float, wy: float, layer: str, subtype: str, extra: dict):
        defs = dict(LAYER_DEFAULTS.get(layer, {}))
        data: dict = {"id": str(uuid.uuid4()), "x": wx, "y": wy, "layer": layer, "rotation": 0}

        if layer == "terrain":
            data.update({
                "type": "terrain",
                "terrain_type": subtype or "mountain",
                "size": defs.get("size", 36),
                "color": defs.get("color", "#6b5030"),
            })
        elif layer == "settlement":
            data.update({
                "type": "settlement",
                "settlement_type": subtype or "city",
                "name": "",
                "size": defs.get("size", 18),
                "color": defs.get("color", "#ffffff"),
                "label_color": defs.get("label_color", "#1a0a00"),
            })
        elif layer == "poi":
            if subtype == "image_icon":
                data.update({
                    "type": "image_icon",
                    "image_path": extra.get("image_path", ""),
                    "size": 32, "name": "",
                })
            else:
                from .constants import POI_SYMBOLS
                data.update({
                    "type": "poi",
                    "poi_type": subtype or "dungeon",
                    "symbol": POI_SYMBOLS.get(subtype, "?"),
                    "name": "",
                    "size": defs.get("size", 14),
                    "color": defs.get("color", "#8030c0"),
                })
        elif layer == "note":
            text, ok = QInputDialog.getText(
                self.views()[0] if self.views() else None, "Nota", "Texto:"
            )
            if not ok or not text:
                return
            data.update({
                "type": "note",
                "text": text,
                "size": 13,
                "color": "#ffffff",
                "bold": False, "italic": False,
            })
        elif layer == "token":
            lbl, ok = QInputDialog.getText(
                self.views()[0] if self.views() else None, "Token", "Símbolo (1-3 chars):"
            )
            if not ok or not lbl:
                return
            data.update({
                "type": "token",
                "label": lbl[:3],
                "color": "#c0392b",
                "size": 16,
            })
        elif layer == "decoration":
            if subtype == "map_title":
                data.update({
                    "type": "map_title",
                    "text": "Título do Mapa",
                    "size": 28,
                    "color": "#2a1a0a",
                    "box_color": "#c8a870",
                })
            else:  # compass
                data.update({
                    "type": "compass",
                    "size": 70,
                })
        else:
            return

        self.add_item(data)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _next_country_color(self) -> str:
        used = {d.get("fill", "") for d in self._items_data if d.get("type") == "country"}
        for c in COUNTRY_COLORS:
            if c not in used:
                return c
        n = sum(1 for d in self._items_data if d.get("type") == "country")
        return COUNTRY_COLORS[n % len(COUNTRY_COLORS)]

    def notify_status(self, msg: str):
        self.status_msg.emit(msg)

    def get_items_data(self) -> list:
        return list(self._items_data)

    def get_fog_state(self) -> list:
        return self.fog_item.get_state() if self.fog_item else []

    # ── Selection ─────────────────────────────────────────────────────────────

    def _on_selection_changed(self):
        sel = self.selectedItems()
        if sel and hasattr(sel[0], "data"):
            self.item_selected.emit(sel[0].data)
        else:
            self.item_selected.emit(None)

    # ── Event routing to tool ─────────────────────────────────────────────────

    def mousePressEvent(self, event):
        if self._tool.mouse_press(event):
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._tool.mouse_move(event):
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self._tool.mouse_release(event):
            return
        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event):
        if self._tool.double_click(event):
            return
        super().mouseDoubleClickEvent(event)

    def keyPressEvent(self, event: QKeyEvent):
        if self._tool.key_press(event):
            return
        super().keyPressEvent(event)


# ─── MapView ──────────────────────────────────────────────────────────────────

class MapView(QGraphicsView):
    """View com zoom/pan fluido e viewport OpenGL."""

    coords_changed = Signal(float, float, float)   # wx, wy, zoom

    def __init__(self, scene: MapScene, parent=None):
        super().__init__(scene, parent)

        # OpenGL acceleration
        if _OPENGL_AVAILABLE:
            gl_widget = QOpenGLWidget()
            self.setViewport(gl_widget)

        self.setRenderHints(
            QPainter.RenderHint.Antialiasing |
            QPainter.RenderHint.TextAntialiasing |
            QPainter.RenderHint.SmoothPixmapTransform
        )
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorViewCenter)
        self.setDragMode(QGraphicsView.DragMode.NoDrag)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setFrameStyle(0)
        self.setBackgroundBrush(QBrush(QColor("#1a2d0e")))

        self._panning   = False
        self._pan_start = QPointF()
        self._zoom_lvl  = 1.0

    def wheelEvent(self, event):
        factor = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
        self._zoom_lvl = max(0.05, min(20.0, self._zoom_lvl * factor))
        self.scale(factor, factor)
        self._emit_coords(event.position())

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.MiddleButton or \
           (event.button() == Qt.MouseButton.LeftButton and
            event.modifiers() & Qt.KeyboardModifier.AltModifier):
            self._panning   = True
            self._pan_start = event.position()
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._panning:
            delta = event.position() - self._pan_start
            self._pan_start = event.position()
            self.horizontalScrollBar().setValue(
                int(self.horizontalScrollBar().value() - delta.x()))
            self.verticalScrollBar().setValue(
                int(self.verticalScrollBar().value() - delta.y()))
            event.accept()
            return
        self._emit_coords(event.position())
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self._panning and event.button() in (
            Qt.MouseButton.MiddleButton, Qt.MouseButton.LeftButton
        ):
            self._panning = False
            self.setCursor(Qt.CursorShape.ArrowCursor)
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def _emit_coords(self, screen_pos):
        scene_pos = self.mapToScene(screen_pos.toPoint())
        self.coords_changed.emit(scene_pos.x(), scene_pos.y(), self._zoom_lvl)

    def zoom_in(self):
        self.scale(1.25, 1.25)
        self._zoom_lvl *= 1.25

    def zoom_out(self):
        self.scale(0.8, 0.8)
        self._zoom_lvl *= 0.8

    def zoom_reset(self):
        self.resetTransform()
        self._zoom_lvl = 1.0
        self.centerOn(0, 0)

    def keyPressEvent(self, event: QKeyEvent):
        # Forward to scene's tool
        self.scene().keyPressEvent(event)
