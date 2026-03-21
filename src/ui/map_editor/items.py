"""
DM - Dungeon Music
Map Editor — QGraphicsItem subclasses para todos os elementos do mapa.
Qt cuida de rotação, zoom e pan nativamente — paint() desenha em coordenadas locais.
"""

import math
import uuid
import copy
import io
import os

from PySide6.QtWidgets import QGraphicsItem, QGraphicsEllipseItem
from PySide6.QtCore    import Qt, QRectF, QPointF, QLineF
from PySide6.QtGui     import (
    QPainter, QPen, QBrush, QColor, QFont, QPolygonF,
    QPainterPath, QPixmap, QImage, QTransform,
)

from .constants import (
    LAYER_Z, FOG_Z, LAYER_DEFAULTS, SCENE_RECT,
    TERRAIN_SYMBOLS, SETTLEMENT_SYMBOLS, POI_SYMBOLS, ICONS_DIR,
)

# ─── Pixel cache for PNG icons ────────────────────────────────────────────────

_pixmap_cache: dict = {}   # (path, size) → QPixmap | None

def _get_pixmap(path: str, size: int) -> QPixmap | None:
    key = (path, size)
    if key not in _pixmap_cache:
        try:
            from PIL import Image
            img = Image.open(path).convert("RGBA")
            img = img.resize((size, size), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "PNG")
            buf.seek(0)
            qimg = QImage()
            qimg.loadFromData(buf.read())
            _pixmap_cache[key] = QPixmap.fromImage(qimg)
        except Exception:
            _pixmap_cache[key] = None
    return _pixmap_cache[key]

def clear_pixmap_cache():
    _pixmap_cache.clear()

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _star_polygon(r_outer: float, r_inner: float, n: int = 5) -> QPolygonF:
    pts = []
    for i in range(n * 2):
        r = r_outer if i % 2 == 0 else r_inner
        angle = math.pi * i / n - math.pi / 2
        pts.append(QPointF(r * math.cos(angle), r * math.sin(angle)))
    return QPolygonF(pts)


def _qcolor(s: str) -> QColor:
    c = QColor(s)
    return c if c.isValid() else QColor("#888888")


def _is_dark(hex_color: str) -> bool:
    try:
        c = QColor(hex_color)
        return (c.red() * 299 + c.green() * 587 + c.blue() * 114) / 1000 < 128
    except Exception:
        return True


def _draw_text_centered(painter: QPainter, text: str, font: QFont,
                         color: str, rect: QRectF):
    painter.save()
    painter.setFont(font)
    painter.setPen(_qcolor(color))
    painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, text)
    painter.restore()


# ─── Base point item ──────────────────────────────────────────────────────────

class BaseMapItem(QGraphicsItem):
    """Base para itens colocados em um ponto (terrain, settlement, etc.)."""

    def __init__(self, data: dict):
        super().__init__()
        self.data = data
        self.setPos(data.get("x", 0.0), data.get("y", 0.0))
        self.setRotation(data.get("rotation", 0.0))
        self.setZValue(LAYER_Z.get(data.get("layer", "note"), 50))
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges)

    def _sz(self) -> float:
        return float(self.data.get("size", 36))

    def boundingRect(self) -> QRectF:
        sz = self._sz()
        m = sz * 1.5 + 20   # margin for labels
        return QRectF(-m, -m, m * 2, m * 2)

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            self.data["x"] = float(value.x())
            self.data["y"] = float(value.y())
            scene = self.scene()
            if scene and hasattr(scene, "on_item_changed"):
                scene.on_item_changed()
        return super().itemChange(change, value)

    def _draw_selection_ring(self, painter: QPainter):
        if self.isSelected():
            sz = self._sz()
            r = sz * 1.1 + 6
            pen = QPen(QColor("#00d4ff"), 2, Qt.PenStyle.DashLine)
            pen.setCosmetic(True)
            painter.setPen(pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawEllipse(QPointF(0, 0), r, r)

    def paint(self, painter: QPainter, option, widget):
        raise NotImplementedError

    def sync_from_data(self):
        """Re-apply data dict values to Qt item (call after external data edits)."""
        self.setPos(self.data.get("x", 0.0), self.data.get("y", 0.0))
        self.setRotation(self.data.get("rotation", 0.0))
        self.update()

    def to_dict(self) -> dict:
        return self.data


# ─── Terrain ──────────────────────────────────────────────────────────────────

class TerrainItem(BaseMapItem):

    def paint(self, painter: QPainter, option, widget):
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        sz  = self._sz()
        col = self.data.get("color", "#6b5030")
        ttype = self.data.get("terrain_type", "mountain")
        dispatch = {
            "mountain": self._paint_mountain,
            "forest":   self._paint_forest,
            "hill":     self._paint_hill,
            "volcano":  self._paint_volcano,
            "swamp":    self._paint_swamp,
            "desert":   self._paint_desert,
            "jungle":   self._paint_jungle,
            "snow":     self._paint_snow,
            "plains":   self._paint_plains,
            "cave":     self._paint_cave,
        }
        dispatch.get(ttype, self._paint_mountain)(painter, sz, col)
        painter.restore()
        self._draw_selection_ring(painter)

    def _paint_mountain(self, painter, sz, col):
        for ox, oy, scale in [(-sz*0.45, sz*0.18, 0.7), (sz*0.35, sz*0.18, 0.65), (0, 0, 1.0)]:
            hw = sz * 0.5 * scale
            hh = sz * 0.85 * scale
            painter.setBrush(QBrush(_qcolor(col)))
            painter.setPen(QPen(_qcolor(col), 1))
            painter.drawPolygon(QPolygonF([
                QPointF(ox,       oy - hh),
                QPointF(ox - hw,  oy + hh * 0.15),
                QPointF(ox + hw,  oy + hh * 0.15),
            ]))
            sh, sw = hh * 0.28, hw * 0.42
            painter.setBrush(QBrush(QColor("#e8e8f0")))
            painter.setPen(QPen(QColor("#ccccdd"), 1))
            painter.drawPolygon(QPolygonF([
                QPointF(ox,       oy - hh),
                QPointF(ox - sw,  oy - hh + sh),
                QPointF(ox + sw,  oy - hh + sh),
            ]))

    def _paint_forest(self, painter, sz, col):
        r = sz * 0.38
        positions = [(0, -sz*0.22), (-sz*0.38, sz*0.1), (sz*0.38, sz*0.1),
                     (-sz*0.18, sz*0.35), (sz*0.18, sz*0.35)]
        painter.setPen(QPen(QColor("#2a4a20"), 1))
        for ox, oy in positions:
            painter.setBrush(QBrush(_qcolor(col)))
            painter.drawEllipse(QPointF(ox, oy), r, r)

    def _paint_hill(self, painter, sz, col):
        for ox, scale in [(-sz*0.3, 0.7), (sz*0.3, 0.65), (0, 1.0)]:
            hw = sz * 0.55 * scale
            hh = sz * 0.4  * scale
            path = QPainterPath()
            path.moveTo(QPointF(ox - hw, hh * 0.5))
            path.arcTo(QRectF(ox - hw, -hh * 1.5, hw * 2, hh * 2), 0, 180)
            path.closeSubpath()
            painter.setBrush(QBrush(_qcolor(col)))
            painter.setPen(QPen(_qcolor(col), 1))
            painter.drawPath(path)

    def _paint_volcano(self, painter, sz, col):
        hw, hh = sz * 0.5, sz * 0.9
        painter.setBrush(QBrush(QColor("#6b4020")))
        painter.setPen(QPen(QColor("#3a1a00"), 1))
        painter.drawPolygon(QPolygonF([
            QPointF(0, -hh), QPointF(-hw, hh * 0.15), QPointF(hw, hh * 0.15),
        ]))
        painter.setBrush(QBrush(QColor("#e05010")))
        painter.setPen(QPen(QColor("#ff7020"), 1))
        painter.drawPolygon(QPolygonF([
            QPointF(0, -hh), QPointF(-hw*0.3, -hh + hh*0.2), QPointF(hw*0.3, -hh + hh*0.2),
        ]))
        painter.setBrush(QBrush(QColor("#888888")))
        painter.setPen(QPen(QColor("#666666"), 1))
        pr = sz * 0.12
        painter.drawEllipse(QPointF(0, -hh - pr), pr, pr)

    def _paint_swamp(self, painter, sz, col):
        pen = QPen(_qcolor(col), max(1.5, sz * 0.03))
        painter.setPen(pen)
        dot_offsets = [(-0.3,0.15),(0.28,-0.18),(-0.15,-0.3),(0.35,0.08),(-0.25,0.32),(0.1,-0.22)]
        for i in range(3):
            path = QPainterPath()
            for j in range(8):
                x = -sz*0.45 + j * sz*0.13
                y = -sz*0.2 + i*sz*0.2 + math.sin(j*0.9 + i) * sz*0.07
                if j == 0:
                    path.moveTo(QPointF(x, y))
                else:
                    path.lineTo(QPointF(x, y))
            painter.drawPath(path)
        r = max(2.0, sz * 0.05)
        painter.setBrush(QBrush(_qcolor(col)))
        painter.setPen(Qt.PenStyle.NoPen)
        for dx_f, dy_f in dot_offsets:
            painter.drawEllipse(QPointF(dx_f * sz, dy_f * sz), r, r)

    def _paint_desert(self, painter, sz, col):
        r = max(1.5, sz * 0.055)
        painter.setBrush(QBrush(_qcolor(col)))
        painter.setPen(Qt.PenStyle.NoPen)
        for i in range(5):
            for j in range(5):
                if (i + j) % 2 == 0:
                    painter.drawEllipse(QPointF((i-2)*sz*0.22, (j-2)*sz*0.22), r, r)

    def _paint_jungle(self, painter, sz, col):
        positions = [(0,-sz*0.1),(-sz*0.4,sz*0.15),(sz*0.4,sz*0.15),
                     (-sz*0.2,sz*0.4),(sz*0.2,sz*0.4),(-sz*0.05,-sz*0.38),(sz*0.3,-sz*0.25)]
        r = sz * 0.32
        painter.setPen(QPen(QColor("#0a2a08"), 1))
        for ox, oy in positions:
            painter.setBrush(QBrush(QColor("#1a4a10")))
            painter.drawEllipse(QPointF(ox, oy), r, r)
        for ox, oy in [(0, sz*0.05), (-sz*0.25, sz*0.25)]:
            tw, th = sz * 0.08, sz * 0.55
            painter.setBrush(QBrush(QColor("#5a3a10")))
            painter.setPen(Qt.PenStyle.NoPen)
            painter.drawPolygon(QPolygonF([
                QPointF(ox - tw, oy + th), QPointF(ox + tw, oy + th), QPointF(ox, oy),
            ]))

    def _paint_snow(self, painter, sz, col):
        snow_positions = [
            (-0.35,-0.3),(0,-0.4),(0.35,-0.3),(-0.45,0),(0,0),(0.45,0),
            (-0.35,0.3),(0,0.35),(0.35,0.3),(-0.15,-0.15),(0.15,-0.15),
            (-0.15,0.15),(0.15,0.15),
        ]
        r = max(1.5, sz * 0.06)
        painter.setPen(QPen(QColor("#aabbcc"), 1))
        for fx, fy in snow_positions:
            painter.setBrush(QBrush(QColor("#e8eeff")))
            painter.drawEllipse(QPointF(fx * sz, fy * sz), r, r)

    def _paint_plains(self, painter, sz, col):
        pen = QPen(_qcolor(col), max(1.5, sz * 0.03))
        painter.setPen(pen)
        for i in range(5):
            y = (i - 2) * sz * 0.22
            painter.drawLine(QPointF(-sz*0.42, y), QPointF(sz*0.42, y))

    def _paint_cave(self, painter, sz, col):
        hw = sz * 0.5
        arch = QPainterPath()
        arch.moveTo(QPointF(-hw, 0))
        arch.arcTo(QRectF(-hw, -hw, hw*2, hw*2), 180, -180)
        arch.closeSubpath()
        painter.setBrush(QBrush(QColor("#1a1a2a")))
        painter.setPen(QPen(_qcolor(col), max(1.5, sz * 0.04)))
        painter.drawPath(arch)
        ir = sz * 0.28
        painter.setBrush(QBrush(QColor("#0a0a18")))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(QPointF(0, -ir * 0.3), ir, ir)


# ─── Settlement ───────────────────────────────────────────────────────────────

class SettlementItem(BaseMapItem):

    def paint(self, painter: QPainter, option, widget):
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        sz    = self._sz()
        col   = self.data.get("color", "#ffffff")
        lcol  = self.data.get("label_color", "#1a0a00")
        name  = self.data.get("name", "")
        stype = self.data.get("settlement_type", "city")
        dispatch = {
            "capital":   self._paint_capital,
            "city":      self._paint_city,
            "town":      self._paint_town,
            "village":   self._paint_village,
            "castle":    self._paint_castle,
            "fortress":  self._paint_fortress,
            "port":      self._paint_port,
            "ruins":     self._paint_ruins,
            "lighthouse":self._paint_lighthouse,
            "mine":      self._paint_mine,
            "chapel":    self._paint_chapel,
        }
        dispatch.get(stype, self._paint_city)(painter, sz, col)
        if name and sz > 4:
            fsz = max(6, int(sz * 0.55))
            font = QFont("Palatino Linotype", fsz)
            painter.setFont(font)
            painter.setPen(_qcolor(lcol))
            painter.drawText(QRectF(-sz*3, sz*1.1, sz*6, sz), Qt.AlignmentFlag.AlignCenter, name)
        painter.restore()
        self._draw_selection_ring(painter)

    def _paint_capital(self, p, sz, col):
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#8b6020"), max(1, int(sz*0.06))))
        p.drawPolygon(_star_polygon(sz, sz * 0.42, 5))

    def _paint_city(self, p, sz, col):
        r = sz * 0.72
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#333333"), max(1, int(sz*0.08))))
        p.drawEllipse(QPointF(0, 0), r, r)
        ri = sz * 0.28
        p.setBrush(QBrush(QColor("#333333")))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawEllipse(QPointF(0, 0), ri, ri)

    def _paint_town(self, p, sz, col):
        r = sz * 0.6
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#555555"), max(1, int(sz*0.06))))
        p.drawEllipse(QPointF(0, 0), r, r)

    def _paint_village(self, p, sz, col):
        h = sz * 0.55
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#555555"), max(1, int(sz*0.06))))
        p.drawRect(QRectF(-h, -h, h*2, h*2))

    def _paint_castle(self, p, sz, col):
        h = sz * 0.55
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#333333"), max(1, int(sz*0.06))))
        p.drawRect(QRectF(-h, -h, h*2, h*2))
        tc = sz * 0.22
        for dx, dy in [(-h, -h), (h, -h), (-h, h), (h, h)]:
            p.drawRect(QRectF(dx - tc, dy - tc, tc*2, tc*2))

    def _paint_fortress(self, p, sz, col):
        h = sz * 0.6
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#222222"), max(2, int(sz*0.1))))
        p.drawRect(QRectF(-h, -h, h*2, h*2))
        tc = sz * 0.25
        for dx, dy in [(-h, -h), (h, -h), (-h, h), (h, h)]:
            p.drawRect(QRectF(dx - tc, dy - tc, tc*2, tc*2))
        bw = sz * 0.15
        p.setPen(QPen(QColor("#222222"), max(1, int(sz*0.05))))
        for i in range(4):
            bx = -h + bw + i * bw * 2.2
            p.drawRect(QRectF(bx, -h - bw, bw, bw))

    def _paint_port(self, p, sz, col):
        lw = max(2, int(sz * 0.1))
        pen = QPen(_qcolor(col), lw)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)
        r = sz * 0.28
        # Ring at top
        p.drawEllipse(QPointF(0, -sz*0.7 + r), r, r)
        # Vertical staff
        p.drawLine(QPointF(0, -sz*0.7 + r*2), QPointF(0, sz*0.6))
        # Crossbar
        p.drawLine(QPointF(-sz*0.45, -sz*0.1), QPointF(sz*0.45, -sz*0.1))
        # Bottom arcs
        for dx in [-sz*0.45, sz*0.45]:
            path = QPainterPath()
            path.moveTo(QPointF(dx, sz*0.4 - sz*0.2))
            path.arcTo(QRectF(dx - sz*0.18, sz*0.2, sz*0.36, sz*0.4), 270, -180)
            p.drawPath(path)

    def _paint_ruins(self, p, sz, col):
        h = sz * 0.55
        lw = max(2, int(sz * 0.08))
        pen = QPen(_qcolor(col), lw)
        p.setPen(pen)
        segments = [
            ((-h, -h), (h,  -h)),
            ((h,  -h), (h,   h)),
            ((-h,  h), (h,   h)),
            ((-h, -h), (-h, -h*0.3)),
            ((-h,  h), (-h,  h*0.4)),
        ]
        for (x1,y1),(x2,y2) in segments:
            p.drawLine(QPointF(x1,y1), QPointF(x2,y2))

    def _paint_lighthouse(self, p, sz, col):
        lw = max(1, int(sz * 0.08))
        tw, th = sz * 0.18, sz * 0.85
        # Tower
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#555555"), lw))
        p.drawPolygon(QPolygonF([
            QPointF(-tw,       th*0.1),
            QPointF(tw,        th*0.1),
            QPointF(tw*0.6,   -th*0.6),
            QPointF(-tw*0.6,  -th*0.6),
        ]))
        # Light
        lr = sz * 0.18
        p.setBrush(QBrush(QColor("#ffff80")))
        p.setPen(QPen(QColor("#cccc40"), lw))
        p.drawEllipse(QPointF(0, -th*0.6 - lr), lr, lr)
        # Base
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#555555"), lw))
        p.drawRect(QRectF(-tw*1.3, th*0.1, tw*2.6, th*0.15))

    def _paint_mine(self, p, sz, col):
        lw = max(2, int(sz * 0.1))
        pen = QPen(_qcolor(col), lw)
        p.setPen(pen)
        p.drawLine(QPointF(-sz*0.5, -sz*0.5), QPointF(sz*0.5,  sz*0.5))
        p.drawLine(QPointF(sz*0.5,  -sz*0.5), QPointF(-sz*0.5, sz*0.5))
        r = sz * 0.18
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(QPen(QColor("#555555"), max(1, lw//2)))
        p.drawEllipse(QPointF(0, 0), r, r)

    def _paint_chapel(self, p, sz, col):
        lw = max(2, int(sz * 0.1))
        pen = QPen(_qcolor(col), lw)
        p.setPen(pen)
        p.drawLine(QPointF(0, -sz*0.7), QPointF(0, sz*0.5))
        p.drawLine(QPointF(-sz*0.38, -sz*0.28), QPointF(sz*0.38, -sz*0.28))
        r = sz * 0.1
        p.setBrush(QBrush(_qcolor(col)))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawEllipse(QPointF(0, sz*0.5), r, r)


# ─── POI ──────────────────────────────────────────────────────────────────────

class PoiItem(BaseMapItem):

    def paint(self, painter: QPainter, option, widget):
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        sz    = self._sz()
        col   = self.data.get("color", "#8030c0")
        name  = self.data.get("name", "")
        ptype = self.data.get("poi_type", "custom")
        sym   = POI_SYMBOLS.get(ptype, self.data.get("symbol", "?"))

        r = sz * 0.85
        painter.setBrush(QBrush(_qcolor(col)))
        painter.setPen(QPen(QColor("#ffffff"), max(1, int(sz*0.07))))
        painter.drawEllipse(QPointF(0, 0), r, r)

        fsz = max(6, int(sz * 0.85))
        font = QFont("Consolas", fsz)
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(QColor("#ffffff"))
        painter.drawText(QRectF(-r, -r, r*2, r*2), Qt.AlignmentFlag.AlignCenter, sym)

        if name:
            nfsz = max(5, int(sz * 0.55))
            nfont = QFont("Segoe UI", nfsz)
            painter.setFont(nfont)
            painter.setPen(_qcolor(col))
            painter.drawText(QRectF(-sz*2, r + 2, sz*4, nfsz + 4),
                             Qt.AlignmentFlag.AlignCenter, name)
        painter.restore()
        self._draw_selection_ring(painter)


# ─── Note ─────────────────────────────────────────────────────────────────────

class NoteItem(BaseMapItem):

    def paint(self, painter: QPainter, option, widget):
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        text   = self.data.get("text", self.data.get("label", ""))
        col    = self.data.get("color", "#ffffff")
        sz     = max(6, int(self.data.get("size", 13)))
        bold   = self.data.get("bold", False)
        italic = self.data.get("italic", False)

        font = QFont("Palatino Linotype", sz)
        font.setBold(bold)
        font.setItalic(italic)
        painter.setFont(font)
        painter.setPen(_qcolor(col))

        fm = painter.fontMetrics()
        bw = fm.horizontalAdvance(text) + 8
        bh = fm.height() + 4
        painter.drawText(QRectF(-bw/2, -bh/2, bw, bh),
                         Qt.AlignmentFlag.AlignCenter, text)
        painter.restore()
        if self.isSelected():
            painter.save()
            pen = QPen(QColor("#00d4ff"), 1, Qt.PenStyle.DashLine)
            pen.setCosmetic(True)
            painter.setPen(pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            fm2 = painter.fontMetrics()
            bw2 = fm2.horizontalAdvance(text) + 12
            bh2 = fm2.height() + 8
            painter.drawRect(QRectF(-bw2/2, -bh2/2, bw2, bh2))
            painter.restore()

    def boundingRect(self) -> QRectF:
        sz = max(6, int(self.data.get("size", 13)))
        text = self.data.get("text", self.data.get("label", ""))
        w = max(60, len(text) * sz * 0.65 + 12)
        h = sz + 8
        return QRectF(-w/2, -h/2, w, h)


# ─── Token ────────────────────────────────────────────────────────────────────

class TokenItem(BaseMapItem):

    def paint(self, painter: QPainter, option, widget):
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        r   = self._sz()
        col = self.data.get("color", "#c0392b")
        lbl = self.data.get("label", "?")

        painter.setBrush(QBrush(_qcolor(col)))
        painter.setPen(QPen(QColor("#ffffff"), max(2, int(r * 0.1))))
        painter.drawEllipse(QPointF(0, 0), r, r)

        fsz = max(5, int(r * 0.85))
        font = QFont("Segoe UI", fsz)
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(QColor("#ffffff"))
        painter.drawText(QRectF(-r, -r, r*2, r*2), Qt.AlignmentFlag.AlignCenter, lbl[:3])
        painter.restore()
        self._draw_selection_ring(painter)


# ─── Compass Rose ─────────────────────────────────────────────────────────────

class CompassItem(BaseMapItem):

    def paint(self, painter: QPainter, option, widget):
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        sz = self._sz()

        dark = True   # always render in gold on dark
        c_main = "#f0d060"
        c_alt  = "#ffffff"
        c_out  = "#8b6010"

        for i in range(8):
            angle = math.pi * i / 4
            outer = QPointF(sz * math.cos(angle), sz * math.sin(angle))
            left  = QPointF(sz*0.28 * math.cos(angle - math.pi/8),
                            sz*0.28 * math.sin(angle - math.pi/8))
            right = QPointF(sz*0.28 * math.cos(angle + math.pi/8),
                            sz*0.28 * math.sin(angle + math.pi/8))
            col = _qcolor(c_main if i % 2 == 0 else c_alt)
            painter.setBrush(QBrush(col))
            painter.setPen(QPen(_qcolor(c_out), 1))
            painter.drawPolygon(QPolygonF([QPointF(0, 0), left, outer, right]))

        r2 = sz * 0.18
        painter.setBrush(QBrush(_qcolor(c_main)))
        painter.setPen(QPen(_qcolor(c_out), 2))
        painter.drawEllipse(QPointF(0, 0), r2, r2)
        r3 = sz * 0.08
        painter.setBrush(QBrush(_qcolor(c_alt)))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(QPointF(0, 0), r3, r3)

        fsz = max(7, int(sz * 0.22))
        font = QFont("Palatino Linotype", fsz)
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(_qcolor(c_main))
        ld = sz + fsz + 5
        for lbl, ang in [("N", -math.pi/2), ("S", math.pi/2), ("L", 0.0), ("O", math.pi)]:
            lx = ld * math.cos(ang)
            ly = ld * math.sin(ang)
            painter.drawText(QRectF(lx - 16, ly - 12, 32, 24),
                             Qt.AlignmentFlag.AlignCenter, lbl)
        painter.restore()
        self._draw_selection_ring(painter)

    def boundingRect(self) -> QRectF:
        sz = self._sz()
        m = sz + 30
        return QRectF(-m, -m, m*2, m*2)


# ─── Image Icon ───────────────────────────────────────────────────────────────

class ImageIconItem(BaseMapItem):

    def __init__(self, data: dict):
        super().__init__(data)
        self._pixmap: QPixmap | None = None
        self._loaded_size = -1

    def _ensure_pixmap(self, sz: int):
        if self._loaded_size == sz and self._pixmap is not None:
            return
        path = os.path.join(ICONS_DIR, self.data.get("image_path", ""))
        self._pixmap = _get_pixmap(path, sz)
        self._loaded_size = sz

    def sync_from_data(self):
        self._loaded_size = -1   # force reload on size change
        super().sync_from_data()

    def paint(self, painter: QPainter, option, widget):
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        sz = int(self._sz())
        self._ensure_pixmap(sz)

        if self._pixmap and not self._pixmap.isNull():
            painter.drawPixmap(QRectF(-sz/2, -sz/2, sz, sz), self._pixmap, self._pixmap.rect())
        else:
            r = sz / 2
            painter.setBrush(QBrush(QColor("#556677")))
            painter.setPen(QPen(QColor("#aaaaaa"), 1))
            painter.drawEllipse(QPointF(0, 0), r, r)
            painter.setPen(QColor("#ffffff"))
            painter.drawText(QRectF(-r, -r, r*2, r*2), Qt.AlignmentFlag.AlignCenter, "?")

        name = self.data.get("name", "")
        if name:
            fsz = max(6, int(sz * 0.3))
            painter.setFont(QFont("Segoe UI", fsz))
            painter.setPen(QColor("#ffffff"))
            painter.drawText(QRectF(-sz, sz/2 + 2, sz*2, fsz + 4),
                             Qt.AlignmentFlag.AlignCenter, name)
        painter.restore()
        self._draw_selection_ring(painter)


# ─── Map Title ────────────────────────────────────────────────────────────────

class MapTitleItem(BaseMapItem):

    def paint(self, painter: QPainter, option, widget):
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        text   = self.data.get("text", "Título do Mapa")
        col    = self.data.get("color", "#2a1a0a")
        boxcol = self.data.get("box_color", "#c8a870")
        fsz    = max(10, int(self.data.get("size", 28)))

        font = QFont("Palatino Linotype", fsz)
        font.setBold(True)
        painter.setFont(font)
        fm = painter.fontMetrics()

        bw = fm.horizontalAdvance(text) + fsz * 2.2
        bh = fm.height() + fsz * 1.1
        rect = QRectF(-bw/2, -bh/2, bw, bh)

        # Box fill
        painter.setBrush(QBrush(_qcolor(boxcol)))
        painter.setPen(QPen(_qcolor(col), max(2, int(fsz * 0.09))))
        painter.drawRect(rect)
        # Inner border
        ib = max(3, int(fsz * 0.15))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.setPen(QPen(_qcolor(col), max(1, int(fsz * 0.05))))
        painter.drawRect(rect.adjusted(ib, ib, -ib, -ib))

        # Text
        painter.setPen(_qcolor(col))
        painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, text)
        painter.restore()
        self._draw_selection_ring(painter)

    def boundingRect(self) -> QRectF:
        fsz = max(10, int(self.data.get("size", 28)))
        text = self.data.get("text", "Título do Mapa")
        bw = len(text) * fsz * 0.7 + fsz * 2.5
        bh = fsz * 2.5
        return QRectF(-bw/2, -bh/2, bw, bh)


# ─── Polygon region (continent / country / region) ────────────────────────────

class RegionItem(QGraphicsItem):

    def __init__(self, data: dict):
        super().__init__()
        self.data = data
        self._rebuild_polygon()
        self.setZValue(LAYER_Z.get(data.get("layer", "region"), 30))
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges)

    def _rebuild_polygon(self):
        pts = self.data.get("points", [])
        if len(pts) >= 3:
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            self._centroid = QPointF(cx, cy)
            self._local_pts = [QPointF(p[0] - cx, p[1] - cy) for p in pts]
            self._polygon = QPolygonF(self._local_pts)
            self.setPos(cx, cy)
        else:
            self._centroid = QPointF(0, 0)
            self._local_pts = []
            self._polygon = QPolygonF()
            self.setPos(0, 0)

    def boundingRect(self) -> QRectF:
        if self._polygon.isEmpty():
            return QRectF(-1, -1, 2, 2)
        return self._polygon.boundingRect().adjusted(-8, -24, 8, 8)

    def shape(self) -> QPainterPath:
        path = QPainterPath()
        path.addPolygon(self._polygon)
        return path

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            pos = value
            new_pts = [[p.x() + pos.x(), p.y() + pos.y()] for p in self._local_pts]
            self.data["points"] = new_pts
            scene = self.scene()
            if scene and hasattr(scene, "on_item_changed"):
                scene.on_item_changed()
        return super().itemChange(change, value)

    def paint(self, painter: QPainter, option, widget):
        if self._polygon.isEmpty():
            return
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        t    = self.data.get("type", "region")
        fill = self.data.get("fill", "#3a6b35")
        outl = self.data.get("outline", "#111111")
        ow   = max(1, self.data.get("outline_width", 2))
        name = self.data.get("name", "")

        brush = QBrush(_qcolor(fill))
        if t == "continent":
            brush.setStyle(Qt.BrushStyle.Dense4Pattern)

        dash_pattern = []
        if t == "country":
            bs = self.data.get("border_style", "dashed")
            if bs == "dashed":
                dash_pattern = [10, 5]
            elif bs == "dotted":
                dash_pattern = [3, 5]

        pen = QPen(_qcolor(outl), ow)
        if dash_pattern:
            pen.setDashPattern(dash_pattern)
        pen.setCosmetic(False)

        painter.setBrush(brush)
        painter.setPen(pen)
        painter.drawPolygon(self._polygon)

        if name:
            cx, cy = 0.0, 0.0   # centroid is at (0,0) in item coords
            tc = self.data.get("text_color", "#ffffff")
            if t == "continent":
                fsz = 16
                font = QFont("Palatino Linotype", fsz)
                font.setBold(True)
                font.setItalic(True)
            elif t == "country":
                fsz = 12
                font = QFont("Palatino Linotype", fsz)
                font.setBold(True)
            else:
                fsz = 10
                font = QFont("Segoe UI", fsz)
                font.setBold(True)
            painter.setFont(font)
            painter.setPen(_qcolor(tc))
            painter.drawText(QRectF(cx - 200, cy - 15, 400, 30),
                             Qt.AlignmentFlag.AlignCenter, name)

        # Selection outline
        if self.isSelected():
            sel_pen = QPen(QColor("#00d4ff"), 3, Qt.PenStyle.DashLine)
            sel_pen.setCosmetic(True)
            painter.setPen(sel_pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawPolygon(self._polygon)
            # Vertex handles
            painter.setBrush(QBrush(QColor("#00d4ff")))
            painter.setPen(QPen(QColor("#ffffff"), 1))
            for pt in self._local_pts:
                painter.drawRect(QRectF(pt.x() - 5, pt.y() - 5, 10, 10))

        painter.restore()

    def update_points(self, pts: list):
        """Update polygon after external edit."""
        self.data["points"] = pts
        self._rebuild_polygon()
        self.update()

    def to_dict(self) -> dict:
        return self.data


# ─── Water ────────────────────────────────────────────────────────────────────

class WaterItem(QGraphicsItem):

    def __init__(self, data: dict):
        super().__init__()
        self.data = data
        self._is_river = data.get("water_type", "sea") == "river"
        self._rebuild()
        self.setZValue(LAYER_Z.get("water", 50))
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges)

    def _rebuild(self):
        pts = self.data.get("points", [])
        if pts:
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            self._centroid = QPointF(cx, cy)
            self._local_pts = [QPointF(p[0]-cx, p[1]-cy) for p in pts]
            self.setPos(cx, cy)
        else:
            self._centroid = QPointF(0, 0)
            self._local_pts = []
            self.setPos(0, 0)
        self._is_river = self.data.get("water_type", "sea") == "river"

    def boundingRect(self) -> QRectF:
        if not self._local_pts:
            return QRectF(-1, -1, 2, 2)
        xs = [p.x() for p in self._local_pts]
        ys = [p.y() for p in self._local_pts]
        return QRectF(min(xs)-8, min(ys)-24, max(xs)-min(xs)+16, max(ys)-min(ys)+32)

    def shape(self) -> QPainterPath:
        path = QPainterPath()
        if self._local_pts:
            if self._is_river:
                path.moveTo(self._local_pts[0])
                for pt in self._local_pts[1:]:
                    path.lineTo(pt)
            else:
                path.addPolygon(QPolygonF(self._local_pts))
        return path

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            pos = value
            self.data["points"] = [[p.x() + pos.x(), p.y() + pos.y()] for p in self._local_pts]
            scene = self.scene()
            if scene and hasattr(scene, "on_item_changed"):
                scene.on_item_changed()
        return super().itemChange(change, value)

    def paint(self, painter: QPainter, option, widget):
        if not self._local_pts:
            return
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        fill = self.data.get("fill", "#4a7ab0")
        outl = self.data.get("outline", "#2050a0")
        tc   = self.data.get("text_color", "#c8e0ff")
        name = self.data.get("name", "")

        if self._is_river:
            pen = QPen(_qcolor(fill), max(2, self.data.get("outline_width", 2)))
            painter.setPen(pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            path = QPainterPath()
            path.moveTo(self._local_pts[0])
            for pt in self._local_pts[1:]:
                path.lineTo(pt)
            painter.drawPath(path)
        else:
            painter.setBrush(QBrush(_qcolor(fill)))
            painter.setPen(QPen(_qcolor(outl), max(1, self.data.get("outline_width", 1))))
            painter.drawPolygon(QPolygonF(self._local_pts))

        if name and self._local_pts:
            font = QFont("Palatino Linotype", 11)
            font.setItalic(True)
            painter.setFont(font)
            painter.setPen(_qcolor(tc))
            painter.drawText(QRectF(-200, -15, 400, 30),
                             Qt.AlignmentFlag.AlignCenter, name)

        if self.isSelected():
            pen = QPen(QColor("#00d4ff"), 3, Qt.PenStyle.DashLine)
            pen.setCosmetic(True)
            painter.setPen(pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            if self._is_river:
                path = QPainterPath()
                path.moveTo(self._local_pts[0])
                for pt in self._local_pts[1:]:
                    path.lineTo(pt)
                painter.drawPath(path)
            else:
                painter.drawPolygon(QPolygonF(self._local_pts))
            painter.setBrush(QBrush(QColor("#00d4ff")))
            painter.setPen(QPen(QColor("#ffffff"), 1))
            for pt in self._local_pts:
                painter.drawRect(QRectF(pt.x()-5, pt.y()-5, 10, 10))
        painter.restore()

    def to_dict(self) -> dict:
        return self.data


# ─── Road ─────────────────────────────────────────────────────────────────────

class RoadItem(QGraphicsItem):

    def __init__(self, data: dict):
        super().__init__()
        self.data = data
        self._rebuild()
        self.setZValue(LAYER_Z.get("road", 60))
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges)

    def _rebuild(self):
        pts = self.data.get("points", [])
        if pts:
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            self._local_pts = [QPointF(p[0]-cx, p[1]-cy) for p in pts]
            self.setPos(cx, cy)
        else:
            self._local_pts = []
            self.setPos(0, 0)

    def boundingRect(self) -> QRectF:
        if not self._local_pts:
            return QRectF(-1, -1, 2, 2)
        xs = [p.x() for p in self._local_pts]
        ys = [p.y() for p in self._local_pts]
        m = 10
        return QRectF(min(xs)-m, min(ys)-m, max(xs)-min(xs)+m*2, max(ys)-min(ys)+m*2)

    def shape(self) -> QPainterPath:
        path = QPainterPath()
        if self._local_pts:
            path.moveTo(self._local_pts[0])
            for pt in self._local_pts[1:]:
                path.lineTo(pt)
        stroker = path  # simplified
        return path

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            pos = value
            self.data["points"] = [[p.x() + pos.x(), p.y() + pos.y()] for p in self._local_pts]
            scene = self.scene()
            if scene and hasattr(scene, "on_item_changed"):
                scene.on_item_changed()
        return super().itemChange(change, value)

    def paint(self, painter: QPainter, option, widget):
        if not self._local_pts:
            return
        painter.save()
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        col    = self.data.get("color", "#8b6030")
        width  = max(1, self.data.get("width", 3))
        rtype  = self.data.get("road_type", "road")

        pen = QPen(_qcolor(col), width)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        if rtype == "path":
            pen.setDashPattern([8.0, 4.0])
        elif rtype == "trade_route":
            pen.setDashPattern([12.0, 4.0, 4.0, 4.0])
            pen.setWidth(width + 1)

        painter.setPen(pen)
        painter.setBrush(Qt.BrushStyle.NoBrush)

        path = QPainterPath()
        path.moveTo(self._local_pts[0])
        # Smooth curve
        for i in range(1, len(self._local_pts) - 1):
            mp = QPointF((self._local_pts[i].x() + self._local_pts[i+1].x()) / 2,
                         (self._local_pts[i].y() + self._local_pts[i+1].y()) / 2)
            path.quadTo(self._local_pts[i], mp)
        if len(self._local_pts) > 1:
            path.lineTo(self._local_pts[-1])
        painter.drawPath(path)

        if self.isSelected():
            sel_pen = QPen(QColor("#00d4ff"), width + 3, Qt.PenStyle.DashLine)
            sel_pen.setCosmetic(True)
            painter.setPen(sel_pen)
            painter.drawPath(path)
            painter.setBrush(QBrush(QColor("#00d4ff")))
            painter.setPen(QPen(QColor("#ffffff"), 1))
            for pt in self._local_pts:
                painter.drawRect(QRectF(pt.x()-5, pt.y()-5, 10, 10))
        painter.restore()

    def to_dict(self) -> dict:
        return self.data


# ─── Fog of War ───────────────────────────────────────────────────────────────

class FogItem(QGraphicsItem):
    """Fog of war overlay. Covers entire scene; paint() reveals holes.

    Model:
        fog_path = scene_rect - (revealed_union - concealed_union)
    Reveal brush adds to _revealed; conceal brush adds to _concealed.
    Concealed areas always win over revealed ones.
    """

    def __init__(self):
        super().__init__()
        self.setZValue(FOG_Z)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, False)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable,    False)
        self.setAcceptedMouseButtons(Qt.MouseButton.NoButton)
        self._enabled   = False
        self._revealed:  list = []   # circles that are transparent (holes)
        self._concealed: list = []   # circles that re-cover revealed holes
        self._fog_path: QPainterPath | None = None
        self._dirty    = True

    @property
    def enabled(self) -> bool:
        return self._enabled

    def set_enabled(self, v: bool):
        self._enabled = v
        self.update()

    def set_revealed(self, state: dict | list):
        """Restore fog state from saved data."""
        if isinstance(state, dict):
            self._revealed  = list(state.get("revealed",  []))
            self._concealed = list(state.get("concealed", []))
        else:
            # legacy: plain list was only revealed circles
            self._revealed  = list(state)
            self._concealed = []
        self._dirty = True
        self.update()

    def reveal(self, cx: float, cy: float, r: float):
        self._revealed.append({"type": "circle", "cx": cx, "cy": cy, "r": r})
        # Remove concealed circles whose center falls inside this reveal stroke
        self._concealed = [
            c for c in self._concealed
            if math.hypot(c["cx"] - cx, c["cy"] - cy) > r
        ]
        self._dirty = True
        self.update()

    def conceal(self, cx: float, cy: float, r: float):
        self._concealed.append({"type": "circle", "cx": cx, "cy": cy, "r": r})
        # Remove revealed circles whose center falls inside this conceal stroke
        self._revealed = [
            c for c in self._revealed
            if math.hypot(c["cx"] - cx, c["cy"] - cy) > r
        ]
        self._dirty = True
        self.update()

    def _make_union(self, circles: list) -> QPainterPath:
        union = QPainterPath()
        for c in circles:
            if c.get("type") == "circle":
                p = QPainterPath()
                p.addEllipse(QPointF(c["cx"], c["cy"]), c["r"], c["r"])
                union = union.united(p)
        return union

    def _rebuild(self):
        fog = QPainterPath()
        fog.addRect(QRectF(*SCENE_RECT))

        if self._revealed:
            revealed_union  = self._make_union(self._revealed)
            if self._concealed:
                concealed_union = self._make_union(self._concealed)
                # Holes = revealed areas minus re-concealed areas
                holes = revealed_union.subtracted(concealed_union)
            else:
                holes = revealed_union
            fog = fog.subtracted(holes)

        self._fog_path = fog
        self._dirty    = False

    def boundingRect(self) -> QRectF:
        return QRectF(*SCENE_RECT)

    def paint(self, painter: QPainter, option, widget):
        if not self._enabled:
            return
        if self._dirty:
            self._rebuild()
        painter.save()
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(QColor(8, 8, 20, 248)))
        painter.drawPath(self._fog_path)
        painter.restore()

    def get_state(self) -> dict:
        return {"revealed": list(self._revealed), "concealed": list(self._concealed)}


# ─── Factory ──────────────────────────────────────────────────────────────────

def create_item(data: dict) -> QGraphicsItem | None:
    """Cria o QGraphicsItem correto para o dict de dados fornecido."""
    t = data.get("type", "")
    if t in ("continent", "country", "region"):
        return RegionItem(data)
    elif t == "water":
        return WaterItem(data)
    elif t == "road":
        return RoadItem(data)
    elif t == "terrain":
        return TerrainItem(data)
    elif t == "settlement":
        return SettlementItem(data)
    elif t == "poi":
        return PoiItem(data)
    elif t == "note":
        return NoteItem(data)
    elif t == "token":
        return TokenItem(data)
    elif t == "compass":
        return CompassItem(data)
    elif t == "image_icon":
        return ImageIconItem(data)
    elif t == "map_title":
        return MapTitleItem(data)
    # legacy
    elif t == "label":
        data["type"] = "note"
        return NoteItem(data)
    elif t == "icon":
        data["type"] = "poi"
        return PoiItem(data)
    return None
