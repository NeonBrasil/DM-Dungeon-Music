"""
DM - Dungeon Music
Criador de Mapas RPG — Grand Edition
Canvas com zoom/pan, camadas, tipos de terreno customizados, estilos de mapa.
"""

import tkinter as tk
from tkinter import ttk, simpledialog, messagebox, colorchooser, filedialog
import json
import math
import uuid
import copy
import random

from src.map_manager import MapSessionManager
from src.ui.theme import COLORS

# ─── Camadas ──────────────────────────────────────────────────────────────────

LAYER_ORDER = [
    "decoration", "continent", "country", "region",
    "water", "terrain", "road", "settlement", "poi", "note", "token"
]

LAYER_LABELS = {
    "decoration": "Decoração", "continent": "Continente", "country": "País",
    "region": "Região",        "water": "Água",           "terrain": "Terreno",
    "road": "Estrada",         "settlement": "Assentamento", "poi": "PDI",
    "note": "Nota",            "token": "Token",
}

# ─── Defaults de cor por camada ───────────────────────────────────────────────

LAYER_DEFAULTS = {
    "continent":  {"fill": "#c8b87a", "outline": "#5a3d1e", "outline_width": 4, "text_color": "#2a1a0a"},
    "country":    {"fill": "#d4c090", "outline": "#7a5030", "outline_width": 2, "text_color": "#3a2010", "border_style": "dashed"},
    "region":     {"fill": "#3a6b35", "outline": "#111111", "outline_width": 2, "text_color": "#ffffff"},
    "water":      {"fill": "#4a7ab0", "outline": "#2050a0", "outline_width": 1, "text_color": "#c8e0ff", "water_type": "sea"},
    "terrain":    {"color": "#6b5030", "size": 36, "terrain_type": "mountain"},
    "road":       {"color": "#8b6030", "width": 3, "road_type": "road"},
    "settlement": {"color": "#ffffff", "size": 18, "label_color": "#1a0a00", "settlement_type": "city"},
    "poi":        {"color": "#8030c0", "size": 14, "poi_type": "dungeon"},
    "note":       {"color": "#ffffff", "size": 13, "bold": False, "italic": False},
    "token":      {"color": "#c0392b", "size": 16},
}

# ─── Sub-tipos ────────────────────────────────────────────────────────────────

SETTLEMENT_TYPES = [
    ("capital",     "Capital",    "★"),
    ("city",        "Cidade",     "⊙"),
    ("town",        "Vila",       "○"),
    ("village",     "Aldeia",     "•"),
    ("castle",      "Castelo",    "⌂"),
    ("fortress",    "Fortaleza",  "▣"),
    ("port",        "Porto",      "⚓"),
    ("ruins",       "Ruínas",     "⌖"),
    ("lighthouse",  "Farol",      "⚡"),
    ("mine",        "Mina",       "⛏"),
    ("chapel",      "Capela",     "✝"),
]

TERRAIN_TYPES = [
    ("mountain", "Montanha", "▲"),
    ("forest",   "Floresta", "♣"),
    ("hill",     "Colina",   "∩"),
    ("volcano",  "Vulcão",   "🔺"),
    ("swamp",    "Pântano",  "≈"),
    ("desert",   "Deserto",  "∴"),
    ("jungle",   "Selva",    "🌴"),
    ("snow",     "Neve",     "❄"),
    ("plains",   "Planície", "≡"),
    ("cave",     "Caverna",  "◐"),
]

POI_TYPES = [
    ("dungeon", "Dungeon",  "D"),
    ("temple",  "Templo",   "+"),
    ("magical", "Mágico",   "✦"),
    ("danger",  "Perigo",   "☠"),
    ("tavern",  "Taverna",  "T"),
    ("market",  "Mercado",  "◆"),
    ("custom",  "Custom",   "?"),
]

ROAD_TYPES = [
    ("road",        "Estrada",        {"dash": None,         "width": 3}),
    ("path",        "Caminho",        {"dash": (6, 4),       "width": 2}),
    ("trade_route", "Rota Comercial", {"dash": (10, 3, 3, 3), "width": 4}),
]

BG_STYLES = {
    "dark":      "#1a2d0e",
    "parchment": "#c8a870",
    "ocean":     "#1a3a5e",
}

# ─── Paleta de cores automáticas para Países ──────────────────────────────────

COUNTRY_COLORS = [
    "#e8c57a", "#a8d5a2", "#f4a460", "#b0c4de", "#dda0dd",
    "#f0e68c", "#98d8c8", "#ffb6c1", "#c8a2c8", "#b8d4e8",
    "#d4b896", "#aec6cf", "#77dd77", "#fdfd96", "#cb99c9",
    "#b5ead7", "#ffdac1", "#e2cbb8", "#c9b1d0", "#d4e6c3",
]

# ─── Diretório de ícones importados ──────────────────────────────────────────

import os as _os
_ICONS_DIR = _os.path.join(_os.path.expanduser("~"), ".dm_dungeon_music", "map_icons")

# ─── Utilidades de desenho ────────────────────────────────────────────────────

def _star_pts(cx, cy, r_outer, r_inner, n=5):
    pts = []
    for i in range(n * 2):
        r = r_outer if i % 2 == 0 else r_inner
        angle = math.pi * i / n - math.pi / 2
        pts += [cx + r * math.cos(angle), cy + r * math.sin(angle)]
    return pts


def _rotate_pts(cx, cy, pts, angle_deg):
    """Rotaciona lista plana [x0,y0,x1,y1,...] em torno de (cx,cy)."""
    if not angle_deg:
        return pts
    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad), math.sin(rad)
    out = []
    for i in range(0, len(pts), 2):
        x, y = pts[i] - cx, pts[i+1] - cy
        out += [cx + x*ca - y*sa, cy + x*sa + y*ca]
    return out


def _is_dark(hex_color: str) -> bool:
    try:
        r, g, b = int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16)
        return (r * 299 + g * 587 + b * 114) / 1000 < 128
    except Exception:
        return True


def _gen_parchment_tk(w: int, h: int):
    """Gera textura de pergaminho via PIL e converte para ImageTk.PhotoImage."""
    try:
        from PIL import Image, ImageFilter, ImageDraw, ImageTk
        # Limit texture size for performance (tile if canvas is large)
        tw, th = min(w, 800), min(h, 600)
        base = (200, 170, 118)
        rng = random.Random(42)  # Fixed seed for deterministic texture
        img = Image.new("RGB", (tw, th), base)
        px = img.load()
        for y in range(th):
            for x in range(tw):
                n = rng.randint(-18, 18)
                px[x, y] = (
                    max(0, min(255, base[0] + n)),
                    max(0, min(255, base[1] + n - 4)),
                    max(0, min(255, base[2] + n - 10)),
                )
        img = img.filter(ImageFilter.GaussianBlur(1.2))
        # Vignette overlay
        overlay = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        steps = 30
        for i in range(steps):
            alpha = int(55 * (i / steps) ** 2)
            m = i * max(tw, th) // (steps * 2)
            draw.rectangle([m, m, tw - m, th - m], outline=(80, 50, 20, alpha))
        img = img.convert("RGBA")
        img = Image.alpha_composite(img, overlay).convert("RGB")
        # Scale to canvas size if texture is smaller
        if tw < w or th < h:
            img = img.resize((w, h), Image.BILINEAR)
        return ImageTk.PhotoImage(img)
    except Exception:
        return None


# ─── Canvas do Mapa RPG ───────────────────────────────────────────────────────

class RPGMapCanvas(tk.Canvas):
    """Canvas interativo com zoom, pan, camadas e renderização RPG customizada."""

    def __init__(self, parent, **kwargs):
        super().__init__(
            parent,
            bg=BG_STYLES["dark"],
            highlightthickness=0,
            cursor="crosshair",
            **kwargs,
        )
        # View
        self.zoom = 1.0
        self.offset_x = 0.0
        self.offset_y = 0.0
        self._view_ready = False

        # Map data
        self.items_data: list = []
        self.bg_style = "dark"
        self.map_bg = BG_STYLES["dark"]
        self.grid_type = "none"
        self.grid_size = 50
        self.layers_visible: dict = {l: True for l in LAYER_ORDER}

        # Tool state
        self.tool = "select"
        self.active_layer = "settlement"
        self.active_subtype = "city"
        self.selected_id = None
        self._draw_pts: list = []
        self._preview_cids: list = []
        self._drag_start = None
        self._drag_item_origin = None
        self._drag_pts_origin = None
        self._pan_start = None
        self._pan_offset_start = None
        self._space_pan = False
        self._dirty = False
        self._redraw_scheduled = False

        # Active defaults
        self.fill_color  = LAYER_DEFAULTS["region"]["fill"]
        self.line_color  = LAYER_DEFAULTS["region"]["outline"]
        self.text_color  = "#ffffff"
        self.token_color = LAYER_DEFAULTS["token"]["color"]
        self.active_image = ""   # filename in _ICONS_DIR for image_icon tool

        # Parchment texture cache
        self._parchment_photo = None
        self._parchment_size  = (0, 0)

        # Image icon cache: (path, size_px, rot) → ImageTk.PhotoImage
        self._img_cache: dict = {}

        # canvas_id → item_id
        self._cid_to_iid: dict = {}

        # Callbacks
        self.on_change = None
        self.on_select = None

        self._bind_events()

    # ── Coordinate helpers ────────────────────────────────────────────────────

    def w2s(self, wx, wy):
        return wx * self.zoom + self.offset_x, wy * self.zoom + self.offset_y

    def s2w(self, sx, sy):
        return (sx - self.offset_x) / self.zoom, (sy - self.offset_y) / self.zoom

    # ── Events ────────────────────────────────────────────────────────────────

    def _bind_events(self):
        self.bind("<Configure>",        self._on_configure)
        self.bind("<MouseWheel>",       self._on_wheel)
        self.bind("<Button-1>",         self._on_lclick)
        self.bind("<Double-Button-1>",  self._on_dclick)
        self.bind("<B1-Motion>",        self._on_drag)
        self.bind("<ButtonRelease-1>",  self._on_release)
        self.bind("<Button-2>",         self._on_pan_start)
        self.bind("<B2-Motion>",        self._on_pan_move)
        self.bind("<Button-3>",         self._on_rclick)
        self.bind("<Motion>",           self._on_motion)
        self.bind("<KeyPress-space>",   lambda e: self._set_space_pan(True))
        self.bind("<KeyRelease-space>", lambda e: self._set_space_pan(False))
        self.bind("<KeyPress-Delete>",  self._on_delete_key)
        self.bind("<KeyPress-Escape>",  lambda e: self._cancel_draw())
        self.bind("<KeyPress-Return>",  lambda e: self._finish_draw())
        self.bind("<KeyPress-q>",       lambda e: self._rotate_selected(-15))
        self.bind("<KeyPress-e>",       lambda e: self._rotate_selected(+15))

    def _on_configure(self, e):
        if not self._view_ready and e.width > 10 and e.height > 10:
            self.offset_x = e.width / 2
            self.offset_y = e.height / 2
            self._view_ready = True
        # Invalidate parchment if size changed
        if (e.width, e.height) != self._parchment_size:
            self._parchment_photo = None
        self._schedule_redraw()

    # ── Zoom & Pan ────────────────────────────────────────────────────────────

    def _on_wheel(self, e):
        factor = 1.12 if e.delta > 0 else 1 / 1.12
        self._zoom_at(factor, e.x, e.y)

    def _zoom_at(self, factor, sx, sy):
        wx, wy = self.s2w(sx, sy)
        self.zoom = max(0.05, min(10.0, self.zoom * factor))
        self.offset_x = sx - wx * self.zoom
        self.offset_y = sy - wy * self.zoom
        self._schedule_redraw()

    def zoom_in(self):   self._zoom_at(1.25, self.winfo_width()/2, self.winfo_height()/2)
    def zoom_out(self):  self._zoom_at(0.80, self.winfo_width()/2, self.winfo_height()/2)

    def zoom_reset(self):
        self.zoom = 1.0
        self.offset_x = self.winfo_width() / 2
        self.offset_y = self.winfo_height() / 2
        self._schedule_redraw()

    def _on_pan_start(self, e):
        self._pan_start = (e.x, e.y)
        self._pan_offset_start = (self.offset_x, self.offset_y)
        self.config(cursor="fleur")

    def _on_pan_move(self, e):
        if self._pan_start:
            dx = e.x - self._pan_start[0]
            dy = e.y - self._pan_start[1]
            self.offset_x = self._pan_offset_start[0] + dx
            self.offset_y = self._pan_offset_start[1] + dy
            self._schedule_redraw()

    def _set_space_pan(self, active: bool):
        self._space_pan = active
        self.config(cursor="fleur" if active else "crosshair")
        if not active:
            self._pan_start = None

    # ── Redraw ────────────────────────────────────────────────────────────────

    def _schedule_redraw(self):
        if not self._redraw_scheduled:
            self._redraw_scheduled = True
            self.after(16, self._redraw)

    def _redraw(self):
        self._redraw_scheduled = False
        self.delete("all")
        self._cid_to_iid.clear()

        w, h = self.winfo_width(), self.winfo_height()
        if w < 2 or h < 2:
            return

        self._draw_background(w, h)
        self._draw_grid(w, h)

        layer_idx = {layer: i for i, layer in enumerate(LAYER_ORDER)}
        visible_items = [
            it for it in self.items_data
            if self.layers_visible.get(it.get("layer", "note"), True)
        ]
        for item in sorted(visible_items, key=lambda i: layer_idx.get(i.get("layer", "note"), 9)):
            self._draw_item(item, w, h)

        if self.selected_id:
            self._draw_selection()

    def _draw_background(self, w, h):
        if self.bg_style == "parchment":
            if self._parchment_photo is None:
                self._parchment_photo = _gen_parchment_tk(w, h)
                self._parchment_size = (w, h)
            if self._parchment_photo:
                self.create_image(0, 0, anchor="nw", image=self._parchment_photo)
                return
        self.create_rectangle(0, 0, w, h, fill=self.map_bg, outline="")

    def _draw_grid(self, w, h):
        if self.grid_type == "none":
            return
        gs = self.grid_size * self.zoom
        if gs < 8:
            return
        dark_bg = _is_dark(self.map_bg)
        col = "#4a4a5a" if dark_bg else "#888878"
        lbl_col = "#8888aa" if dark_bg else "#555545"

        if self.grid_type == "square":
            sx0 = math.floor(-self.offset_x / gs) * gs + self.offset_x
            x = sx0
            col_letter = 0
            while x <= w:
                self.create_line(x, 0, x, h, fill=col)
                if gs > 25:
                    letter = chr(ord('A') + int(col_letter) % 26)
                    self.create_text(x + gs/2, 6, text=letter,
                                     fill=lbl_col, font=("Segoe UI", 7))
                x += gs
                col_letter += 1
            sy0 = math.floor(-self.offset_y / gs) * gs + self.offset_y
            y = sy0
            row_num = 1
            while y <= h:
                self.create_line(0, y, w, y, fill=col)
                if gs > 25:
                    self.create_text(6, y + gs/2, text=str(row_num),
                                     fill=lbl_col, font=("Segoe UI", 7))
                y += gs
                row_num += 1

        elif self.grid_type == "hex":
            r = gs / 2
            hex_w = r * 2
            hex_h = math.sqrt(3) * r
            cols = int(w / (hex_w * 0.75)) + 3
            rows = int(h / hex_h) + 3
            ox = self.offset_x % (hex_w * 1.5) - hex_w * 1.5
            oy = self.offset_y % (hex_h * 2) - hex_h
            for ci in range(cols):
                for ri in range(rows):
                    cx = ci * hex_w * 0.75 + ox
                    cy = ri * hex_h + oy
                    if ci % 2 == 1:
                        cy += hex_h / 2
                    pts = []
                    for a in range(6):
                        ang = math.pi / 3 * a - math.pi / 6
                        pts += [cx + r * math.cos(ang), cy + r * math.sin(ang)]
                    self.create_polygon(pts, fill="", outline=col)

    # ── Item dispatch ─────────────────────────────────────────────────────────

    def _draw_item(self, item: dict, w: int, h: int):
        t = item.get("type", "")
        if t in ("continent", "country", "region"):
            self._draw_polygon_region(item, w, h)
        elif t == "water":
            self._draw_water(item, w, h)
        elif t == "terrain":
            self._draw_terrain(item, w, h)
        elif t == "road":
            self._draw_road(item, w, h)
        elif t == "settlement":
            self._draw_settlement(item, w, h)
        elif t == "poi":
            self._draw_poi(item, w, h)
        elif t == "note":
            self._draw_note(item, w, h)
        elif t == "token":
            self._draw_token(item, w, h)
        elif t == "compass":
            self._draw_compass(item, w, h)
        elif t == "image_icon":
            self._draw_image_icon(item, w, h)
        elif t == "map_title":
            self._draw_map_title(item, w, h)
        # legacy
        elif t == "region":
            self._draw_polygon_region(item, w, h)
        elif t == "border":
            self._draw_road(item, w, h)
        elif t == "label":
            self._draw_note(item, w, h)
        elif t == "icon":
            self._draw_legacy_icon(item, w, h)

    def _in_viewport(self, sx, sy, w, h, margin=60):
        return -margin <= sx <= w + margin and -margin <= sy <= h + margin

    def _poly_in_viewport(self, pts, w, h):
        """True if any screen point is within viewport."""
        for wx, wy in pts:
            sx, sy = self.w2s(wx, wy)
            if self._in_viewport(sx, sy, w, h, 100):
                return True
        return False

    # ── Polygon regions (continent / country / region) ────────────────────────

    def _draw_polygon_region(self, item: dict, w: int, h: int):
        pts = item.get("points", [])
        if len(pts) < 3:
            return
        if not self._poly_in_viewport(pts, w, h):
            return

        iid = item["id"]
        tag = f"item:{iid}"
        t = item["type"]
        flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]

        fill    = item.get("fill", LAYER_DEFAULTS.get(t, {}).get("fill", "#3a6b35"))
        outline = item.get("outline", LAYER_DEFAULTS.get(t, {}).get("outline", "#111"))
        ow      = max(1, item.get("outline_width", 2))

        # Continent: stipple for semi-transparent feel
        stipple = "gray25" if t == "continent" else ""

        dash = None
        if t == "country" and item.get("border_style", "dashed") == "dashed":
            dash = (10, 5)
        elif t == "country" and item.get("border_style") == "dotted":
            dash = (3, 5)

        cid = self.create_polygon(
            flat,
            fill=fill, outline=outline, width=ow,
            stipple=stipple, dash=dash,
            smooth=(t == "continent"),
            tags=("mi", tag),
        )
        self._cid_to_iid[cid] = iid

        # Label
        name = item.get("name", "")
        if name:
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            sx, sy = self.w2s(cx, cy)
            text_color = item.get("text_color", "#ffffff")
            if t == "continent":
                fsz = max(9, int(16 * self.zoom))
                font = ("Palatino Linotype", fsz, "bold italic") if self.bg_style == "parchment" else ("Segoe UI", fsz, "bold")
            elif t == "country":
                fsz = max(7, int(12 * self.zoom))
                font = ("Palatino Linotype", fsz, "bold") if self.bg_style == "parchment" else ("Segoe UI", fsz, "bold")
            else:
                fsz = max(6, int(10 * self.zoom))
                font = ("Segoe UI", fsz, "bold")
            self.create_text(sx, sy, text=name, fill=text_color, font=font, tags=("mi", tag))

    # ── Water ─────────────────────────────────────────────────────────────────

    def _draw_water(self, item: dict, w: int, h: int):
        pts = item.get("points", [])
        if len(pts) < 2:
            return
        iid = item["id"]
        tag = f"item:{iid}"
        wtype = item.get("water_type", "sea")
        fill    = item.get("fill", "#4a7ab0")
        outline = item.get("outline", "#2050a0")
        tc      = item.get("text_color", "#c8e0ff")
        name    = item.get("name", "")

        if wtype == "river":
            if not self._poly_in_viewport(pts, w, h):
                return
            flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
            cid = self.create_line(flat, fill=fill, width=max(2, int(3 * self.zoom)),
                                   smooth=True, tags=("mi", tag))
            self._cid_to_iid[cid] = iid
            if name and len(pts) >= 2:
                mx = sum(p[0] for p in pts) / len(pts)
                my = sum(p[1] for p in pts) / len(pts)
                sx, sy = self.w2s(mx, my)
                fsz = max(6, int(9 * self.zoom))
                self.create_text(sx, sy, text=name, fill=tc,
                                 font=("Palatino Linotype", fsz, "italic") if self.bg_style == "parchment" else ("Segoe UI", fsz, "italic"),
                                 tags=("mi", tag))
        else:
            if len(pts) < 3 or not self._poly_in_viewport(pts, w, h):
                return
            flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
            cid = self.create_polygon(flat, fill=fill, outline=outline,
                                      width=max(1, item.get("outline_width", 1)),
                                      smooth=True, tags=("mi", tag))
            self._cid_to_iid[cid] = iid
            if name:
                cx = sum(p[0] for p in pts) / len(pts)
                cy = sum(p[1] for p in pts) / len(pts)
                sx, sy = self.w2s(cx, cy)
                fsz = max(7, int(11 * self.zoom))
                self.create_text(sx, sy, text=name, fill=tc,
                                 font=("Palatino Linotype", fsz, "bold italic") if self.bg_style == "parchment" else ("Segoe UI", fsz, "italic"),
                                 tags=("mi", tag))

    # ── Terrain ───────────────────────────────────────────────────────────────

    def _draw_terrain(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h):
            return
        iid  = item["id"]
        tag  = f"item:{iid}"
        sz   = max(8, int(item.get("size", 36) * self.zoom))
        col  = item.get("color", "#6b5030")
        ttype = item.get("terrain_type", "mountain")

        dispatch = {
            "mountain": self._terrain_mountain,
            "forest":   self._terrain_forest,
            "hill":     self._terrain_hill,
            "volcano":  self._terrain_volcano,
            "swamp":    self._terrain_swamp,
            "desert":   self._terrain_desert,
            "jungle":   self._terrain_jungle,
            "snow":     self._terrain_snow,
            "plains":   self._terrain_plains,
            "cave":     self._terrain_cave,
        }
        fn = dispatch.get(ttype, self._terrain_mountain)
        rot = item.get("rotation", 0)
        cids = fn(sx, sy, sz, col, tag, rot)
        if cids:
            self._cid_to_iid[cids[0]] = iid

    def _terrain_mountain(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        offsets = [(-sz*0.45, sz*0.18, 0.7), (sz*0.35, sz*0.18, 0.65), (0, 0, 1.0)]
        for ox, oy, scale in offsets:
            cx, cy = sx + ox, sy + oy
            hw = sz * 0.5 * scale
            hh = sz * 0.85 * scale
            pts = _rotate_pts(sx, sy, [cx, cy-hh, cx-hw, cy+hh*0.15, cx+hw, cy+hh*0.15], rot)
            cids.append(self.create_polygon(pts, fill=col, outline=col, width=1, tags=("mi", tag)))
            snow_h, snow_w = hh * 0.28, hw * 0.42
            spts = _rotate_pts(sx, sy, [cx, cy-hh, cx-snow_w, cy-hh+snow_h, cx+snow_w, cy-hh+snow_h], rot)
            self.create_polygon(spts, fill="#e8e8f0", outline="#ccccdd", width=1, tags=("mi", tag))
        return cids

    def _terrain_forest(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        r = sz * 0.38
        raw_positions = [
            (0, -sz*0.22), (-sz*0.38, sz*0.1), (sz*0.38, sz*0.1),
            (-sz*0.18, sz*0.35), (sz*0.18, sz*0.35),
        ]
        for ox, oy in raw_positions:
            flat = _rotate_pts(sx, sy, [sx+ox, sy+oy], rot)
            cx, cy = flat[0], flat[1]
            cid = self.create_oval(cx-r, cy-r, cx+r, cy+r,
                                   fill=col, outline="#2a4a20", width=1, tags=("mi", tag))
            cids.append(cid)
        return cids

    def _terrain_hill(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        for ox, scale in [(-sz*0.3, 0.7), (sz*0.3, 0.65), (0, 1.0)]:
            flat = _rotate_pts(sx, sy, [sx+ox, sy], rot)
            cx, cy = flat[0], flat[1]
            hw = sz * 0.55 * scale
            hh = sz * 0.4 * scale
            cid = self.create_arc(cx-hw, cy-hh*1.5, cx+hw, cy+hh*0.5,
                                  start=0, extent=180, fill=col, outline=col,
                                  width=1, style="chord", tags=("mi", tag))
            cids.append(cid)
        return cids

    def _terrain_volcano(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        hw, hh = sz * 0.5, sz * 0.9
        pts = _rotate_pts(sx, sy, [sx, sy-hh, sx-hw, sy+hh*0.15, sx+hw, sy+hh*0.15], rot)
        cids.append(self.create_polygon(pts, fill="#6b4020", outline="#3a1a00", width=1, tags=("mi", tag)))
        lava = _rotate_pts(sx, sy, [sx, sy-hh, sx-hw*0.3, sy-hh+hh*0.2, sx+hw*0.3, sy-hh+hh*0.2], rot)
        self.create_polygon(lava, fill="#e05010", outline="#ff7020", width=1, tags=("mi", tag))
        pr = sz * 0.12
        sc = _rotate_pts(sx, sy, [sx, sy-hh-pr], rot)
        self.create_oval(sc[0]-pr, sc[1]-pr, sc[0]+pr, sc[1]+pr,
                         fill="#888888", outline="#666666", tags=("mi", tag))
        return cids

    def _terrain_swamp(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        for i in range(3):
            raw = []
            for j in range(8):
                x = sx - sz*0.45 + j * sz*0.13
                y = sy - sz*0.2 + i*sz*0.2 + math.sin(j*0.9+i)*sz*0.07
                raw += [x, y]
            pts = _rotate_pts(sx, sy, raw, rot)
            cid = self.create_line(pts, fill=col, width=max(1, int(1.5*self.zoom)), smooth=True, tags=("mi", tag))
            cids.append(cid)
        dot_offsets = [(-0.3,0.15),(0.28,-0.18),(-0.15,-0.3),(0.35,0.08),(-0.25,0.32),(0.1,-0.22)]
        r = max(2, sz * 0.05)
        for dx_f, dy_f in dot_offsets:
            flat = _rotate_pts(sx, sy, [sx+dx_f*sz, sy+dy_f*sz], rot)
            self.create_oval(flat[0]-r, flat[1]-r, flat[0]+r, flat[1]+r,
                             fill=col, outline="", tags=("mi", tag))
        return cids

    def _terrain_desert(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        r = max(1, int(sz * 0.055))
        for i in range(5):
            for j in range(5):
                if (i + j) % 2 == 0:
                    flat = _rotate_pts(sx, sy, [sx+(i-2)*sz*0.22, sy+(j-2)*sz*0.22], rot)
                    cid = self.create_oval(flat[0]-r, flat[1]-r, flat[0]+r, flat[1]+r,
                                          fill=col, outline="", tags=("mi", tag))
                    cids.append(cid)
        return cids

    def _terrain_jungle(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        # Dense dark-green circles + palm-like triangles
        positions = [(0,-sz*0.1),(-sz*0.4,sz*0.15),(sz*0.4,sz*0.15),(-sz*0.2,sz*0.4),(sz*0.2,sz*0.4),
                     (-sz*0.05,-sz*0.38),(sz*0.3,-sz*0.25)]
        r = sz * 0.32
        dark = "#1a4a10"
        for ox, oy in positions:
            flat = _rotate_pts(sx, sy, [sx+ox, sy+oy], rot)
            cx, cy = flat[0], flat[1]
            cid = self.create_oval(cx-r, cy-r, cx+r, cy+r,
                                   fill=dark, outline="#0a2a08", width=1, tags=("mi", tag))
            cids.append(cid)
        # 2 palm-trunk triangles
        for ox, oy in [(0, sz*0.05), (-sz*0.25, sz*0.25)]:
            flat = _rotate_pts(sx, sy, [sx+ox, sy+oy], rot)
            cx, cy = flat[0], flat[1]
            th = sz * 0.55
            tw = sz * 0.08
            trunk = _rotate_pts(cx, cy, [cx-tw, cy+th, cx+tw, cy+th, cx, cy], rot)
            self.create_polygon(trunk, fill="#5a3a10", outline="", tags=("mi", tag))
        return cids

    def _terrain_snow(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        r = max(1, int(sz * 0.06))
        snow_positions = [
            (-0.35,-0.3),(0,-0.4),(0.35,-0.3),(-0.45,0),(0,0),(0.45,0),
            (-0.35,0.3),(0,0.35),(0.35,0.3),(-0.15,-0.15),(0.15,-0.15),
            (-0.15,0.15),(0.15,0.15),
        ]
        for fx, fy in snow_positions:
            flat = _rotate_pts(sx, sy, [sx+fx*sz, sy+fy*sz], rot)
            cid = self.create_oval(flat[0]-r, flat[1]-r, flat[0]+r, flat[1]+r,
                                   fill="#e8eeff", outline="#aabbcc", width=1, tags=("mi", tag))
            cids.append(cid)
        return cids

    def _terrain_plains(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        for i in range(5):
            y_off = (i - 2) * sz * 0.22
            x_start, x_end = -sz*0.42, sz*0.42
            pts = _rotate_pts(sx, sy, [sx+x_start, sy+y_off, sx+x_end, sy+y_off], rot)
            cid = self.create_line(pts[0], pts[1], pts[2], pts[3],
                                   fill=col, width=max(1, int(1.5*self.zoom)), tags=("mi", tag))
            cids.append(cid)
        return cids

    def _terrain_cave(self, sx, sy, sz, col, tag, rot=0):
        cids = []
        # Semicircle arch opening at bottom
        hw = sz * 0.5
        pts_raw = []
        for a in range(0, 181, 15):
            rad = math.radians(a)
            pts_raw += [sx + hw*math.cos(math.radians(180-a)), sy - hw*math.sin(math.radians(180-a))]
        pts_raw += [sx + hw, sy, sx - hw, sy]  # close bottom
        pts = _rotate_pts(sx, sy, pts_raw, rot)
        cid = self.create_polygon(pts, fill="#1a1a2a", outline=col, width=max(1, int(1.5*self.zoom)), tags=("mi", tag))
        cids.append(cid)
        # dark interior oval
        ir = sz * 0.28
        cid2 = self.create_oval(sx-ir, sy-ir*1.2, sx+ir, sy+ir*0.6,
                                fill="#0a0a18", outline="", tags=("mi", tag))
        cids.append(cid2)
        return cids

    # ── Road ──────────────────────────────────────────────────────────────────

    def _draw_road(self, item: dict, w: int, h: int):
        pts = item.get("points", [])
        if len(pts) < 2:
            return
        if not self._poly_in_viewport(pts, w, h):
            return
        iid = item["id"]
        tag = f"item:{iid}"
        rtype = item.get("road_type", item.get("type", "road"))  # fallback for legacy "border"
        col   = item.get("color", item.get("color", "#8b6030"))
        width = max(1, int(item.get("width", 3) * self.zoom))

        road_styles = {
            "road":        {"dash": None,           "width": width},
            "path":        {"dash": (6, 4),          "width": max(1, width - 1)},
            "trade_route": {"dash": (10, 3, 3, 3),   "width": width + 1},
        }
        style = road_styles.get(rtype, {"dash": item.get("dash", None) if item.get("dashed") else None, "width": width})

        flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
        cid = self.create_line(
            flat,
            fill=col,
            width=style["width"],
            dash=style.get("dash"),
            smooth=True,
            tags=("mi", tag),
        )
        self._cid_to_iid[cid] = iid

    # ── Settlement ────────────────────────────────────────────────────────────

    def _draw_settlement(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h):
            return
        iid   = item["id"]
        tag   = f"item:{iid}"
        sz    = max(6, int(item.get("size", 18) * self.zoom))
        col   = item.get("color", "#ffffff")
        lcol  = item.get("label_color", "#1a0a00")
        name  = item.get("name", "")
        stype = item.get("settlement_type", "city")

        dispatch = {
            "capital":    self._sett_capital,
            "city":       self._sett_city,
            "town":       self._sett_town,
            "village":    self._sett_village,
            "castle":     self._sett_castle,
            "fortress":   self._sett_fortress,
            "port":       self._sett_port,
            "ruins":      self._sett_ruins,
            "lighthouse": self._sett_lighthouse,
            "mine":       self._sett_mine,
            "chapel":     self._sett_chapel,
        }
        rot = item.get("rotation", 0)
        fn = dispatch.get(stype, self._sett_city)
        cids = fn(sx, sy, sz, col, tag, rot)
        if cids:
            self._cid_to_iid[cids[0]] = iid

        if name and sz > 4:
            fsz = max(6, int(9 * self.zoom))
            use_parchment = self.bg_style == "parchment"
            font = ("Palatino Linotype", fsz) if use_parchment else ("Segoe UI", fsz)
            # Rotate label position too
            lflat = _rotate_pts(sx, sy, [sx, sy + sz*1.2], rot)
            self.create_text(lflat[0], lflat[1], text=name, fill=lcol, font=font, tags=("mi", tag))

    def _sett_capital(self, sx, sy, sz, col, tag, rot=0):
        raw = _star_pts(sx, sy, sz, sz*0.42, 5)
        pts = _rotate_pts(sx, sy, raw, rot)
        cid = self.create_polygon(pts, fill=col, outline="#8b6020", width=max(1, int(self.zoom)),
                                  tags=("mi", tag))
        return [cid]

    def _sett_city(self, sx, sy, sz, col, tag, rot=0):
        r = sz * 0.72
        cid = self.create_oval(sx-r, sy-r, sx+r, sy+r, fill=col,
                               outline="#333", width=max(1, int(self.zoom*1.5)), tags=("mi", tag))
        ri = sz * 0.28
        self.create_oval(sx-ri, sy-ri, sx+ri, sy+ri, fill="#333", outline="", tags=("mi", tag))
        return [cid]

    def _sett_town(self, sx, sy, sz, col, tag, rot=0):
        r = sz * 0.6
        cid = self.create_oval(sx-r, sy-r, sx+r, sy+r, fill=col,
                               outline="#555", width=max(1, int(self.zoom)), tags=("mi", tag))
        return [cid]

    def _sett_village(self, sx, sy, sz, col, tag, rot=0):
        h = sz * 0.55
        pts = _rotate_pts(sx, sy, [sx-h, sy-h, sx+h, sy-h, sx+h, sy+h, sx-h, sy+h], rot)
        cid = self.create_polygon(pts, fill=col, outline="#555", width=max(1, int(self.zoom)), tags=("mi", tag))
        return [cid]

    def _sett_castle(self, sx, sy, sz, col, tag, rot=0):
        h = sz * 0.55
        pts = _rotate_pts(sx, sy, [sx-h, sy-h, sx+h, sy-h, sx+h, sy+h, sx-h, sy+h], rot)
        cid = self.create_polygon(pts, fill=col, outline="#333", width=max(1, int(self.zoom)), tags=("mi", tag))
        tc = sz * 0.22
        for dx, dy in [(-h, -h), (h, -h), (-h, h), (h, h)]:
            tpts = _rotate_pts(sx, sy, [sx+dx-tc, sy+dy-tc, sx+dx+tc, sy+dy-tc,
                                        sx+dx+tc, sy+dy+tc, sx+dx-tc, sy+dy+tc], rot)
            self.create_polygon(tpts, fill=col, outline="#333", width=max(1, int(self.zoom)), tags=("mi", tag))
        return [cid]

    def _sett_fortress(self, sx, sy, sz, col, tag, rot=0):
        h = sz * 0.6
        pts = _rotate_pts(sx, sy, [sx-h, sy-h, sx+h, sy-h, sx+h, sy+h, sx-h, sy+h], rot)
        cid = self.create_polygon(pts, fill=col, outline="#222", width=max(2, int(self.zoom*2)), tags=("mi", tag))
        tc = sz * 0.25
        for dx, dy in [(-h, -h), (h, -h), (-h, h), (h, h)]:
            tpts = _rotate_pts(sx, sy, [sx+dx-tc, sy+dy-tc, sx+dx+tc, sy+dy-tc,
                                        sx+dx+tc, sy+dy+tc, sx+dx-tc, sy+dy+tc], rot)
            self.create_polygon(tpts, fill=col, outline="#222", width=max(1, int(self.zoom)), tags=("mi", tag))
        bw = sz * 0.15
        for i in range(4):
            bx_raw = sx - h + bw + i * bw * 2.2
            bpts = _rotate_pts(sx, sy, [bx_raw, sy-h-bw, bx_raw+bw, sy-h-bw,
                                        bx_raw+bw, sy-h, bx_raw, sy-h], rot)
            self.create_polygon(bpts, fill=col, outline="#222", tags=("mi", tag))
        return [cid]

    def _sett_port(self, sx, sy, sz, col, tag, rot=0):
        r = sz * 0.28
        lw = max(2, int(self.zoom*1.5))
        # Anchor as polygon points
        ring_pts = []
        for a in range(0, 361, 20):
            ang = math.radians(a)
            ring_pts += [sx + r*math.cos(ang), sy - sz*0.7 + r + r*math.sin(ang)]
        ring_r = _rotate_pts(sx, sy, ring_pts, rot)
        cid = self.create_polygon(ring_r, fill="", outline=col, width=lw, tags=("mi", tag))
        # vertical staff
        staff = _rotate_pts(sx, sy, [sx, sy-sz*0.7+r*2, sx, sy+sz*0.6], rot)
        self.create_line(staff, fill=col, width=lw, tags=("mi", tag))
        # crossbar
        bar = _rotate_pts(sx, sy, [sx-sz*0.45, sy-sz*0.1, sx+sz*0.45, sy-sz*0.1], rot)
        self.create_line(bar, fill=col, width=lw, tags=("mi", tag))
        # bottom hooks
        for dx in [-sz*0.45, sz*0.45]:
            hook_pts = []
            for a in range(180, 361, 20):
                ang = math.radians(a)
                hook_pts += [sx+dx + sz*0.18*math.cos(ang), sy+sz*0.4 + sz*0.2*math.sin(ang)]
            hook_r = _rotate_pts(sx, sy, hook_pts, rot)
            self.create_line(hook_r, fill=col, width=lw, smooth=True, tags=("mi", tag))
        return [cid]

    def _sett_ruins(self, sx, sy, sz, col, tag, rot=0):
        h = sz * 0.55
        lw = max(2, int(self.zoom*1.5))
        cid = None
        segments = [
            [sx-h, sy-h, sx+h, sy-h],
            [sx+h, sy-h, sx+h, sy+h],
            [sx-h, sy+h, sx+h, sy+h],
            [sx-h, sy-h, sx-h, sy-h*0.3],
            [sx-h, sy+h, sx-h, sy+h*0.4],
        ]
        for seg in segments:
            rpts = _rotate_pts(sx, sy, seg, rot)
            c = self.create_line(rpts, fill=col, width=lw, tags=("mi", tag))
            if cid is None: cid = c
        return [cid]

    def _sett_lighthouse(self, sx, sy, sz, col, tag, rot=0):
        lw = max(1, int(self.zoom*1.5))
        tw = sz * 0.18  # tower width
        th = sz * 0.85  # tower height
        # Tower body (trapezoid)
        tpts = _rotate_pts(sx, sy, [sx-tw, sy+th*0.1, sx+tw, sy+th*0.1,
                                     sx+tw*0.6, sy-th*0.6, sx-tw*0.6, sy-th*0.6], rot)
        cid = self.create_polygon(tpts, fill=col, outline="#555", width=lw, tags=("mi", tag))
        # Light top
        lflat = _rotate_pts(sx, sy, [sx, sy-th*0.6-sz*0.18], rot)
        lr = sz * 0.18
        self.create_oval(lflat[0]-lr, lflat[1]-lr, lflat[0]+lr, lflat[1]+lr,
                         fill="#ffff80", outline="#cccc40", width=lw, tags=("mi", tag))
        # Base
        bpts = _rotate_pts(sx, sy, [sx-tw*1.3, sy+th*0.1, sx+tw*1.3, sy+th*0.1,
                                     sx+tw*1.3, sy+th*0.25, sx-tw*1.3, sy+th*0.25], rot)
        self.create_polygon(bpts, fill=col, outline="#555", width=lw, tags=("mi", tag))
        return [cid]

    def _sett_mine(self, sx, sy, sz, col, tag, rot=0):
        lw = max(2, int(self.zoom*1.5))
        # Pickaxe: two crossed lines forming an X, with a curved head
        a1 = _rotate_pts(sx, sy, [sx-sz*0.5, sy-sz*0.5, sx+sz*0.5, sy+sz*0.5], rot)
        a2 = _rotate_pts(sx, sy, [sx+sz*0.5, sy-sz*0.5, sx-sz*0.5, sy+sz*0.5], rot)
        cid = self.create_line(a1, fill=col, width=lw, tags=("mi", tag))
        self.create_line(a2, fill=col, width=lw, tags=("mi", tag))
        # Circle in center
        r = sz * 0.18
        self.create_oval(sx-r, sy-r, sx+r, sy+r, fill=col, outline="#555", tags=("mi", tag))
        return [cid]

    def _sett_chapel(self, sx, sy, sz, col, tag, rot=0):
        lw = max(2, int(self.zoom*1.5))
        # Latin cross
        vpts = _rotate_pts(sx, sy, [sx, sy-sz*0.7, sx, sy+sz*0.5], rot)
        hpts = _rotate_pts(sx, sy, [sx-sz*0.38, sy-sz*0.28, sx+sz*0.38, sy-sz*0.28], rot)
        cid = self.create_line(vpts, fill=col, width=lw, tags=("mi", tag))
        self.create_line(hpts, fill=col, width=lw, tags=("mi", tag))
        # Small circle at base
        bflat = _rotate_pts(sx, sy, [sx, sy+sz*0.5], rot)
        r = sz * 0.1
        self.create_oval(bflat[0]-r, bflat[1]-r, bflat[0]+r, bflat[1]+r,
                         fill=col, outline="", tags=("mi", tag))
        return [cid]

    # ── POI ───────────────────────────────────────────────────────────────────

    def _draw_poi(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h):
            return
        iid   = item["id"]
        tag   = f"item:{iid}"
        sz    = max(5, int(item.get("size", 14) * self.zoom))
        col   = item.get("color", "#8030c0")
        name  = item.get("name", "")
        ptype = item.get("poi_type", "custom")
        sym   = item.get("symbol", "?")

        # Symbol lookup
        sym_map = {t: s for t, _, s in POI_TYPES}
        symbol = sym_map.get(ptype, sym)

        # Circle background
        r = sz * 0.85
        cid = self.create_oval(sx-r, sy-r, sx+r, sy+r,
                               fill=col, outline="#ffffff", width=max(1, int(self.zoom)),
                               tags=("mi", tag))
        self._cid_to_iid[cid] = iid
        self.create_text(sx, sy, text=symbol, fill="#ffffff",
                         font=("Consolas", max(5, int(sz*0.9)), "bold"), tags=("mi", tag))
        if name:
            fsz = max(5, int(8 * self.zoom))
            self.create_text(sx, sy + r + fsz, text=name,
                             fill=col, font=("Segoe UI", fsz), tags=("mi", tag))

    # ── Note (label) ──────────────────────────────────────────────────────────

    def _draw_note(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h):
            return
        iid  = item["id"]
        tag  = f"item:{iid}"
        text = item.get("text", item.get("label", ""))
        col  = item.get("color", "#ffffff")
        sz   = max(5, int(item.get("size", 13) * self.zoom))
        bold = "bold" if item.get("bold") else ""
        italic = "italic" if item.get("italic") else ""
        weight = " ".join(filter(None, [bold, italic])) or "normal"
        use_parchment = self.bg_style == "parchment"
        family = "Palatino Linotype" if use_parchment else "Segoe UI"
        cid = self.create_text(sx, sy, text=text, fill=col,
                               font=(family, sz, weight), tags=("mi", tag))
        self._cid_to_iid[cid] = iid

    # ── Token ─────────────────────────────────────────────────────────────────

    def _draw_token(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h):
            return
        iid = item["id"]
        tag = f"item:{iid}"
        r   = max(6, int(item.get("size", 16) * self.zoom))
        col = item.get("color", "#c0392b")
        cid = self.create_oval(sx-r, sy-r, sx+r, sy+r,
                               fill=col, outline="#ffffff", width=2, tags=("mi", tag))
        self._cid_to_iid[cid] = iid
        self.create_text(sx, sy, text=item.get("label", "?"),
                         fill="#ffffff",
                         font=("Segoe UI", max(5, int(r*0.85)), "bold"), tags=("mi", tag))

    # ── Compass Rose ──────────────────────────────────────────────────────────

    def _draw_compass(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h, 150):
            return
        iid = item["id"]
        tag = f"item:{iid}"
        sz  = max(20, int(item.get("size", 70) * self.zoom))

        dark = _is_dark(self.map_bg)
        c_main = "#f0d060" if dark else "#5a3010"
        c_alt  = "#ffffff" if dark else "#c8a060"
        c_out  = "#8b6010" if dark else "#3a1a00"

        # 8 triangular points
        for i in range(8):
            angle = math.pi * i / 4
            outer_x = sx + sz * math.cos(angle)
            outer_y = sy + sz * math.sin(angle)
            left_x  = sx + sz*0.28 * math.cos(angle - math.pi/8)
            left_y  = sy + sz*0.28 * math.sin(angle - math.pi/8)
            right_x = sx + sz*0.28 * math.cos(angle + math.pi/8)
            right_y = sy + sz*0.28 * math.sin(angle + math.pi/8)
            col = c_main if i % 2 == 0 else c_alt
            cid = self.create_polygon(
                [sx, sy, left_x, left_y, outer_x, outer_y, right_x, right_y],
                fill=col, outline=c_out, width=1, tags=("mi", tag),
            )
            if i == 0:
                self._cid_to_iid[cid] = iid

        # Inner circle
        r2 = sz * 0.18
        self.create_oval(sx-r2, sy-r2, sx+r2, sy+r2,
                         fill=c_main, outline=c_out, width=2, tags=("mi", tag))
        r3 = sz * 0.08
        self.create_oval(sx-r3, sy-r3, sx+r3, sy+r3,
                         fill=c_alt, outline="", tags=("mi", tag))

        # Cardinal labels N S L O
        fsz = max(7, int(sz * 0.24))
        label_dist = sz + fsz + 3
        for lbl, angle in [("N", -math.pi/2), ("S", math.pi/2), ("L", 0), ("O", math.pi)]:
            lx = sx + label_dist * math.cos(angle)
            ly = sy + label_dist * math.sin(angle)
            self.create_text(lx, ly, text=lbl, fill=c_main,
                             font=("Palatino Linotype", fsz, "bold"), tags=("mi", tag))

    # ── Legacy icon ───────────────────────────────────────────────────────────

    def _draw_legacy_icon(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h):
            return
        iid = item["id"]
        tag = f"item:{iid}"
        sz  = max(7, int(item.get("size", 18) * self.zoom))
        cid = self.create_text(sx, sy, text=item.get("symbol", "?"),
                               fill=item.get("color", "#ffffff"),
                               font=("Consolas", sz, "bold"), tags=("mi", tag))
        self._cid_to_iid[cid] = iid

    # ── Image Icon ────────────────────────────────────────────────────────────

    def _get_cached_img(self, path, size_px, rot):
        key = (path, size_px, rot)
        if key not in self._img_cache:
            try:
                from PIL import Image, ImageTk
                img = Image.open(path).convert("RGBA")
                img = img.resize((size_px, size_px), Image.LANCZOS)
                if rot:
                    img = img.rotate(-rot, expand=False, resample=Image.BICUBIC)
                self._img_cache[key] = ImageTk.PhotoImage(img)
            except Exception:
                self._img_cache[key] = None
        return self._img_cache.get(key)

    def _draw_image_icon(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h):
            return
        iid  = item["id"]
        tag  = f"item:{iid}"
        sz   = max(8, int(item.get("size", 32) * self.zoom))
        path = _os.path.join(_ICONS_DIR, item.get("image_path", ""))
        rot  = item.get("rotation", 0)
        photo = self._get_cached_img(path, sz, rot)
        if photo:
            cid = self.create_image(sx, sy, image=photo, anchor="center", tags=("mi", tag))
        else:
            r = sz // 2
            cid = self.create_oval(sx-r, sy-r, sx+r, sy+r,
                                   fill="#888", outline="#aaa", tags=("mi", tag))
            self.create_text(sx, sy, text="?", fill="#fff",
                             font=("Consolas", max(5, r)), tags=("mi", tag))
        self._cid_to_iid[cid] = iid
        name = item.get("name", "")
        if name:
            fsz = max(5, int(8 * self.zoom))
            self.create_text(sx, sy + sz//2 + fsz + 2, text=name,
                             fill="#ffffff", font=("Segoe UI", fsz), tags=("mi", tag))

    # ── Map Title ─────────────────────────────────────────────────────────────

    def _draw_map_title(self, item: dict, w: int, h: int):
        sx, sy = self.w2s(item["x"], item["y"])
        if not self._in_viewport(sx, sy, w, h, 200):
            return
        iid   = item["id"]
        tag   = f"item:{iid}"
        text  = item.get("text", "Título do Mapa")
        fsz   = max(8, int(item.get("size", 28) * self.zoom))
        col   = item.get("color", "#2a1a0a")
        boxcol = item.get("box_color", "#c8a870")
        rot   = item.get("rotation", 0)

        # Measure text size approximately
        char_w = fsz * 0.62
        pad_x  = fsz * 1.1
        pad_y  = fsz * 0.55
        bw     = max(60, int(len(text) * char_w + pad_x * 2))
        bh     = int(fsz + pad_y * 2)

        # Box corners pre-rotation
        x0, y0 = sx - bw//2, sy - bh//2
        x1, y1 = sx + bw//2, sy + bh//2
        box_pts = _rotate_pts(sx, sy, [x0,y0, x1,y0, x1,y1, x0,y1], rot)
        cid = self.create_polygon(box_pts, fill=boxcol, outline=col, width=max(2, int(2*self.zoom)),
                                  tags=("mi", tag))
        self._cid_to_iid[cid] = iid
        # Inner border (slightly inset)
        ib = max(3, int(4 * self.zoom))
        inner_pts = _rotate_pts(sx, sy,
            [x0+ib, y0+ib, x1-ib, y0+ib, x1-ib, y1-ib, x0+ib, y1-ib], rot)
        self.create_polygon(inner_pts, fill="", outline=col,
                            width=max(1, int(self.zoom)), tags=("mi", tag))
        # Text (Tkinter create_text doesn't support rotation, so place at center)
        use_parchment = self.bg_style == "parchment"
        family = "Palatino Linotype" if use_parchment else "Segoe UI"
        self.create_text(sx, sy, text=text, fill=col,
                         font=(family, fsz, "bold"), tags=("mi", tag))

    # ── Selection overlay ─────────────────────────────────────────────────────

    def _draw_selection(self):
        item = self._get(self.selected_id)
        if not item:
            return
        sel = "#00d4ff"
        t   = item.get("type", "")

        poly_types = ("continent", "country", "region", "water")
        line_types = ("road",)

        if t in poly_types:
            pts = item.get("points", [])
            if len(pts) < 2:
                return
            flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
            if len(pts) >= 3:
                self.create_polygon(flat, fill="", outline=sel, width=3, dash=(6, 3))
            for wx, wy in pts:
                sx, sy = self.w2s(wx, wy)
                self.create_rectangle(sx-5, sy-5, sx+5, sy+5, fill=sel, outline="white")

        elif t in line_types or t == "border":
            pts = item.get("points", [])
            if len(pts) < 2:
                return
            flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
            self.create_line(flat, fill=sel, width=4, dash=(6, 3), smooth=True)
            for wx, wy in pts:
                sx, sy = self.w2s(wx, wy)
                self.create_rectangle(sx-5, sy-5, sx+5, sy+5, fill=sel, outline="white")

        else:
            sx, sy = self.w2s(item.get("x", 0), item.get("y", 0))
            r = 26
            self.create_oval(sx-r, sy-r, sx+r, sy+r, fill="", outline=sel, width=2, dash=(4,3))

    # ── Mouse events ──────────────────────────────────────────────────────────

    def _on_lclick(self, e):
        self.focus_set()
        if self._space_pan:
            self._pan_start = (e.x, e.y)
            self._pan_offset_start = (self.offset_x, self.offset_y)
            return

        wx, wy = self.s2w(e.x, e.y)

        if self.tool == "select":
            self._try_select(e.x, e.y)
            item = self._get(self.selected_id)
            if item:
                self._drag_start = (e.x, e.y)
                t = item.get("type", "")
                if t in ("continent","country","region","water","road") or t in ("border",):
                    self._drag_pts_origin = [tuple(p) for p in item.get("points", [])]
                else:
                    self._drag_item_origin = (item.get("x", 0), item.get("y", 0))

        elif self.tool == "polygon":
            self._draw_pts.append((wx, wy))
            self._update_preview(e.x, e.y)

        elif self.tool == "polyline":
            self._draw_pts.append((wx, wy))
            self._update_preview(e.x, e.y)

        elif self.tool == "point":
            self._place_point_item(wx, wy)

        elif self.tool == "label":
            text = simpledialog.askstring("Nota", "Texto:", parent=self)
            if text:
                self._add({
                    "id": str(uuid.uuid4()), "type": "note", "layer": "note",
                    "x": wx, "y": wy, "text": text,
                    "size": 13, "color": self.text_color, "bold": False, "italic": False,
                })

        elif self.tool == "token":
            lbl = simpledialog.askstring("Token", "Letra/símbolo:", parent=self)
            if lbl:
                self._add({
                    "id": str(uuid.uuid4()), "type": "token", "layer": "token",
                    "x": wx, "y": wy, "label": lbl[:3],
                    "color": self.token_color, "size": 16,
                })

    def _place_point_item(self, wx, wy):
        layer = self.active_layer
        subtype = self.active_subtype

        if layer == "terrain":
            defs = copy.copy(LAYER_DEFAULTS["terrain"])
            self._add({
                "id": str(uuid.uuid4()), "type": "terrain", "layer": "terrain",
                "x": wx, "y": wy,
                "terrain_type": subtype or "mountain",
                "size": defs["size"],
                "color": defs["color"],
                "rotation": 0,
            })
        elif layer == "settlement":
            defs = copy.copy(LAYER_DEFAULTS["settlement"])
            self._add({
                "id": str(uuid.uuid4()), "type": "settlement", "layer": "settlement",
                "x": wx, "y": wy,
                "settlement_type": subtype or "city",
                "name": "",
                "size": defs["size"],
                "color": defs["color"],
                "label_color": defs["label_color"],
                "rotation": 0,
            })
        elif layer == "poi":
            if subtype == "image_icon":
                self._add({
                    "id": str(uuid.uuid4()), "type": "image_icon", "layer": "poi",
                    "x": wx, "y": wy,
                    "image_path": self.active_image,
                    "size": 32, "rotation": 0, "name": "",
                })
            else:
                sym_map = {t: s for t, _, s in POI_TYPES}
                defs = copy.copy(LAYER_DEFAULTS["poi"])
                self._add({
                    "id": str(uuid.uuid4()), "type": "poi", "layer": "poi",
                    "x": wx, "y": wy,
                    "poi_type": subtype or "dungeon",
                    "symbol": sym_map.get(subtype, "?"),
                    "name": "",
                    "size": defs["size"],
                    "color": defs["color"],
                    "rotation": 0,
                })
        elif layer == "decoration":
            if subtype == "map_title":
                self._add({
                    "id": str(uuid.uuid4()), "type": "map_title", "layer": "decoration",
                    "x": wx, "y": wy,
                    "text": "Título do Mapa",
                    "size": 28, "color": "#2a1a0a", "box_color": "#c8a870",
                    "rotation": 0,
                })
            else:
                self._add({
                    "id": str(uuid.uuid4()), "type": "compass", "layer": "decoration",
                    "x": wx, "y": wy, "size": 70,
                })

    def _on_dclick(self, e):
        if self.tool == "polygon" and len(self._draw_pts) >= 3:
            self._finish_draw()
        elif self.tool == "polyline" and len(self._draw_pts) >= 2:
            self._finish_draw()
        elif self.tool == "select":
            self._try_select(e.x, e.y)
            if self.selected_id:
                self._quick_edit(self.selected_id)

    def _on_motion(self, e):
        if self._space_pan and self._pan_start:
            dx = e.x - self._pan_start[0]
            dy = e.y - self._pan_start[1]
            self.offset_x = self._pan_offset_start[0] + dx
            self.offset_y = self._pan_offset_start[1] + dy
            self._schedule_redraw()
            return
        if self.tool in ("polygon", "polyline") and self._draw_pts:
            self._update_preview(e.x, e.y)

    def _on_drag(self, e):
        if self._space_pan or self.tool != "select" or not self._drag_start or not self.selected_id:
            return
        dx_w = (e.x - self._drag_start[0]) / self.zoom
        dy_w = (e.y - self._drag_start[1]) / self.zoom
        item = self._get(self.selected_id)
        if not item:
            return
        if self._drag_item_origin:
            item["x"] = self._drag_item_origin[0] + dx_w
            item["y"] = self._drag_item_origin[1] + dy_w
        elif self._drag_pts_origin:
            for i, (ox, oy) in enumerate(self._drag_pts_origin):
                item["points"][i] = [ox + dx_w, oy + dy_w]
        self._schedule_redraw()

    def _on_release(self, e):
        if self._drag_start and self.on_change:
            self.on_change()
        self._drag_start = None
        self._drag_item_origin = None
        self._drag_pts_origin = None
        if self._space_pan:
            self._pan_start = None

    def _on_rclick(self, e):
        # Se estiver desenhando, botão direito conclui o polígono/linha
        if self.tool == "polygon" and len(self._draw_pts) >= 3:
            self._finish_draw()
            return
        if self.tool == "polyline" and len(self._draw_pts) >= 2:
            self._finish_draw()
            return

        self._try_select(e.x, e.y)
        if not self.selected_id:
            return
        menu = tk.Menu(self, tearoff=0,
                       bg=COLORS.get("surface", "#252641"),
                       fg=COLORS.get("text", "#e2e8f0"),
                       activebackground=COLORS.get("primary", "#7c3aed"),
                       activeforeground="#ffffff")
        menu.add_command(label="Editar nome/propriedades",
                         command=lambda: self._quick_edit(self.selected_id))
        menu.add_separator()
        menu.add_command(label="Deletar", command=lambda: self._remove(self.selected_id))
        try:
            menu.tk_popup(e.x_root, e.y_root)
        finally:
            menu.grab_release()

    def _on_delete_key(self, e):
        if self.selected_id:
            self._remove(self.selected_id)

    def _rotate_selected(self, delta: int):
        """Rotaciona item selecionado por delta graus (teclas Q/E)."""
        item = self._get(self.selected_id)
        if item and "rotation" in item:
            item["rotation"] = (item.get("rotation", 0) + delta) % 360
            self._img_cache.clear()   # invalida cache de imagem
            self._schedule_redraw()
            if self.on_change:
                self.on_change()
            if self.on_select:
                self.on_select(item)

    def _next_country_color(self) -> str:
        """Retorna a próxima cor da paleta não usada por países existentes."""
        used = {i.get("fill", "") for i in self.items_data if i.get("type") == "country"}
        for c in COUNTRY_COLORS:
            if c not in used:
                return c
        count = sum(1 for i in self.items_data if i.get("type") == "country")
        return COUNTRY_COLORS[count % len(COUNTRY_COLORS)]

    # ── Selection ─────────────────────────────────────────────────────────────

    def _try_select(self, sx, sy):
        nearest = self.find_overlapping(sx-10, sy-10, sx+10, sy+10)
        for cid in reversed(nearest):
            if cid in self._cid_to_iid:
                iid = self._cid_to_iid[cid]
                self.selected_id = iid
                item = self._get(iid)
                if item and item.get("type") in ("continent","country","region","water","road","border"):
                    self._drag_pts_origin = [tuple(p) for p in item.get("points", [])]
                if self.on_select:
                    self.on_select(item)
                self._schedule_redraw()
                return
        self.selected_id = None
        if self.on_select:
            self.on_select(None)
        self._schedule_redraw()

    # ── Drawing helpers ───────────────────────────────────────────────────────

    def _update_preview(self, sx, sy):
        for cid in self._preview_cids:
            self.delete(cid)
        self._preview_cids.clear()
        if not self._draw_pts:
            return
        screen_pts = [self.w2s(wx, wy) for wx, wy in self._draw_pts]
        screen_pts.append((sx, sy))
        flat = [c for pt in screen_pts for c in pt]

        if self.tool == "polygon" and len(screen_pts) >= 2:
            cid = self.create_polygon(flat, fill="", outline=self.line_color, width=2, dash=(5,3))
            self._preview_cids.append(cid)
        elif self.tool == "polyline" and len(screen_pts) >= 2:
            cid = self.create_line(flat, fill=self.line_color, width=2, dash=(5,3))
            self._preview_cids.append(cid)

        for px, py in screen_pts[:-1]:
            cid = self.create_oval(px-4, py-4, px+4, py+4, fill=self.line_color, outline="white")
            self._preview_cids.append(cid)

    def _finish_draw(self):
        pts = list(self._draw_pts)
        tool = self.tool
        layer = self.active_layer
        subtype = self.active_subtype
        self._cancel_draw()

        if tool == "polygon" and len(pts) >= 3:
            self._finish_polygon(pts, layer, subtype)
        elif tool == "polyline" and len(pts) >= 2:
            self._finish_polyline(pts, layer, subtype)

    def _finish_polygon(self, pts, layer, subtype):
        name = simpledialog.askstring("Nome", "Nome (opcional):", parent=self)
        defs = copy.copy(LAYER_DEFAULTS.get(layer, LAYER_DEFAULTS["region"]))

        if layer in ("continent", "country", "region"):
            fill = self._next_country_color() if layer == "country" else self.fill_color
            item = {
                "id": str(uuid.uuid4()), "type": layer, "layer": layer,
                "points": [list(p) for p in pts],
                "name": name or "",
                "fill": fill,
                "outline": self.line_color,
                "outline_width": defs.get("outline_width", 2),
                "text_color": self.text_color,
            }
            if layer == "country":
                item["border_style"] = "dashed"
        elif layer == "water":
            item = {
                "id": str(uuid.uuid4()), "type": "water", "layer": "water",
                "points": [list(p) for p in pts],
                "name": name or "",
                "water_type": subtype or "sea",
                "fill": defs["fill"],
                "outline": defs["outline"],
                "outline_width": defs.get("outline_width", 1),
                "text_color": defs["text_color"],
            }
        else:
            item = {
                "id": str(uuid.uuid4()), "type": "region", "layer": "region",
                "points": [list(p) for p in pts],
                "name": name or "",
                "fill": self.fill_color,
                "outline": self.line_color,
                "outline_width": 2, "text_color": self.text_color,
            }
        self._add(item)

    def _finish_polyline(self, pts, layer, subtype):
        defs = LAYER_DEFAULTS.get(layer, {})
        if layer == "water":
            item = {
                "id": str(uuid.uuid4()), "type": "water", "layer": "water",
                "points": [list(p) for p in pts],
                "name": "",
                "water_type": "river",
                "fill": defs.get("fill", "#4a7ab0"),
                "outline": defs.get("outline", "#2050a0"),
            }
        elif layer == "road":
            item = {
                "id": str(uuid.uuid4()), "type": "road", "layer": "road",
                "points": [list(p) for p in pts],
                "road_type": subtype or "road",
                "color": self.line_color,
                "width": 3,
            }
        else:
            item = {
                "id": str(uuid.uuid4()), "type": "road", "layer": "road",
                "points": [list(p) for p in pts],
                "road_type": "road",
                "color": self.line_color,
                "width": 2,
            }
        self._add(item)

    def _cancel_draw(self):
        self._draw_pts.clear()
        for cid in self._preview_cids:
            self.delete(cid)
        self._preview_cids.clear()

    # ── Item CRUD ─────────────────────────────────────────────────────────────

    def _add(self, item: dict):
        self.items_data.append(item)
        self.selected_id = item["id"]
        self._schedule_redraw()
        if self.on_change:
            self.on_change()
        if self.on_select:
            self.on_select(item)

    def _remove(self, iid: str):
        self.items_data = [i for i in self.items_data if i["id"] != iid]
        if self.selected_id == iid:
            self.selected_id = None
        self._schedule_redraw()
        if self.on_change:
            self.on_change()
        if self.on_select:
            self.on_select(None)

    def _get(self, iid: str):
        for item in self.items_data:
            if item["id"] == iid:
                return item
        return None

    def _quick_edit(self, iid: str):
        item = self._get(iid)
        if not item:
            return
        # Just edit name for now (right panel handles full edit)
        t = item.get("type", "")
        if t in ("continent", "country", "region", "water", "settlement", "poi", "note"):
            field = "text" if t == "note" else "name"
            val = simpledialog.askstring("Editar Nome",
                                         "Nome:" if field == "name" else "Texto:",
                                         initialvalue=item.get(field, ""),
                                         parent=self)
            if val is not None:
                item[field] = val
                self._schedule_redraw()
                if self.on_change:
                    self.on_change()
                if self.on_select:
                    self.on_select(item)

    # ── Load/get ──────────────────────────────────────────────────────────────

    def load(self, items: list, bg_style: str, bg_color: str,
             grid_type: str, grid_size: int, layers_visible: dict):
        self.items_data = copy.deepcopy(items)
        self.bg_style   = bg_style
        self.map_bg     = bg_color or BG_STYLES.get(bg_style, BG_STYLES["dark"])
        self.grid_type  = grid_type
        self.grid_size  = grid_size
        self.layers_visible = {**{l: True for l in LAYER_ORDER}, **layers_visible}
        self.selected_id = None
        self._parchment_photo = None
        self._cancel_draw()
        self._schedule_redraw()

    def get_snapshot(self) -> list:
        return copy.deepcopy(self.items_data)


# ─── Painel Principal ─────────────────────────────────────────────────────────

class MapPanel(ttk.Frame):
    """Painel completo do criador de mapas RPG com camadas, sessoes e ferramentas."""

    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        self._mgr = MapSessionManager()
        self._map_data: dict = None
        self._map_name: str = ""
        self._save_pending = False
        self._layer_vars: dict = {}   # layer → BooleanVar
        self._build()
        self._refresh_maps()

    # ── Build ─────────────────────────────────────────────────────────────────

    def _build(self):
        self._build_top_bar()
        self._build_layer_bar()

        main = ttk.Frame(self)
        main.pack(fill="both", expand=True, padx=4, pady=2)

        # Left sidebar
        sidebar = ttk.Frame(main, width=162)
        sidebar.pack(side="left", fill="y", padx=(0, 3))
        sidebar.pack_propagate(False)
        self._build_sidebar(sidebar)

        # Canvas area
        cv_frame = ttk.Frame(main)
        cv_frame.pack(side="left", fill="both", expand=True)

        self._cv = RPGMapCanvas(cv_frame)
        self._cv.pack(fill="both", expand=True)
        self._cv.on_change = self._on_canvas_change
        self._cv.on_select = self._on_item_select

        self._status_var = tk.StringVar(value="Crie ou selecione um mapa para começar.")
        ttk.Label(cv_frame, textvariable=self._status_var,
                  foreground=COLORS.get("text_muted", "#94a3b8"),
                  font=("Segoe UI", 8)).pack(anchor="w", padx=4, pady=(1,0))

        self._cv.bind("<Motion>", self._on_cv_motion, add=True)

        # Right panel
        rp = ttk.Frame(main, width=196)
        rp.pack(side="left", fill="y", padx=(3, 0))
        rp.pack_propagate(False)
        self._right_frame = rp
        self._build_right_placeholder()

        # Placeholder on canvas
        self._placeholder = ttk.Label(
            cv_frame,
            text="Crie ou selecione um mapa para começar.",
            foreground=COLORS.get("text_muted", "#94a3b8"),
            font=("Segoe UI", 13))
        self._update_canvas_state()

    # ── Top bar ───────────────────────────────────────────────────────────────

    def _build_top_bar(self):
        top = ttk.Frame(self)
        top.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Label(top, text="Mapa:").pack(side="left", padx=(0,2))
        self._map_var = tk.StringVar()
        self._map_combo = ttk.Combobox(top, textvariable=self._map_var,
                                       state="readonly", width=18)
        self._map_combo.pack(side="left", padx=2)
        self._map_combo.bind("<<ComboboxSelected>>", self._on_map_selected)

        ttk.Button(top, text="+Novo",   command=self._new_map).pack(side="left", padx=2)
        ttk.Button(top, text="Excluir", command=self._del_map,
                   style="Danger.TButton").pack(side="left", padx=2)

        ttk.Separator(top, orient="vertical").pack(side="left", fill="y", padx=6, pady=2)

        ttk.Label(top, text="Snap:").pack(side="left", padx=(0,2))
        self._snap_var = tk.StringVar()
        self._snap_combo = ttk.Combobox(top, textvariable=self._snap_var,
                                        state="readonly", width=14)
        self._snap_combo.pack(side="left", padx=2)
        ttk.Button(top, text="Salvar",    command=self._save_snap).pack(side="left", padx=1)
        ttk.Button(top, text="Restaurar", command=self._restore_snap).pack(side="left", padx=1)
        ttk.Button(top, text="Del.",      command=self._del_snap).pack(side="left", padx=1)

        ttk.Separator(top, orient="vertical").pack(side="left", fill="y", padx=6, pady=2)

        ttk.Label(top, text="Estilo:").pack(side="left", padx=(0,2))
        self._style_var = tk.StringVar(value="dark")
        for val, lbl in [("dark","Dark"),("parchment","Pergaminho"),("ocean","Oceano"),("custom","Custom")]:
            ttk.Radiobutton(top, text=lbl, value=val, variable=self._style_var,
                            command=self._on_style_change).pack(side="left", padx=1)

        ttk.Button(top, text="Exportar PNG", command=self._export_png,
                   style="Accent.TButton").pack(side="right", padx=6)

        ttk.Button(top, text="🗺 Editor Avançado (Qt)",
                   command=self._open_qt_editor,
                   style="Accent.TButton").pack(side="right", padx=2)

    # ── Layer bar ─────────────────────────────────────────────────────────────

    def _build_layer_bar(self):
        lb = ttk.Frame(self)
        lb.pack(fill="x", padx=4, pady=(2, 0))
        ttk.Label(lb, text="Camadas:", font=("Segoe UI", 8, "bold")).pack(side="left", padx=(0, 4))
        self._layer_vars = {}
        for layer in LAYER_ORDER:
            var = tk.BooleanVar(value=True)
            self._layer_vars[layer] = var
            cb = ttk.Checkbutton(
                lb, text=LAYER_LABELS[layer], variable=var,
                command=lambda l=layer, v=var: self._toggle_layer(l, v),
            )
            cb.pack(side="left", padx=1)

    def _toggle_layer(self, layer: str, var: tk.BooleanVar):
        self._cv.layers_visible[layer] = var.get()
        if self._map_data:
            self._map_data.setdefault("layers_visible", {})[layer] = var.get()
        self._cv._schedule_redraw()

    # ── Left sidebar ──────────────────────────────────────────────────────────

    def _build_sidebar(self, parent):
        canvas = tk.Canvas(parent, bg=COLORS.get("bg","#1a1b2e"),
                           highlightthickness=0)
        sb = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        inner = ttk.Frame(canvas)
        win_id = canvas.create_window((0,0), window=inner, anchor="nw")

        def _on_frame_conf(e):
            canvas.configure(scrollregion=canvas.bbox("all"))
            canvas.itemconfig(win_id, width=canvas.winfo_width())
        inner.bind("<Configure>", _on_frame_conf)
        canvas.bind("<MouseWheel>", lambda e: canvas.yview_scroll(-1 if e.delta > 0 else 1, "units"))

        def _sec(text):
            f = ttk.Frame(inner)
            f.pack(fill="x", pady=(4,1))
            ttk.Label(f, text=text, font=("Segoe UI", 8, "bold"),
                      foreground=COLORS.get("accent","#06b6d4")).pack(anchor="w", padx=4)
            ttk.Separator(inner, orient="horizontal").pack(fill="x", padx=4)
            return inner

        def _tool_btn(parent_frame, text, cmd, width=None):
            kw = {"width": width} if width else {}
            b = ttk.Button(parent_frame, text=text, command=cmd, **kw)
            return b

        # Select
        _sec("SELECIONAR")
        ttk.Button(inner, text="↖ Selecionar",
                   command=lambda: self._set_tool("select", None, None)).pack(fill="x", padx=4, pady=2)

        # Regions
        _sec("REGIÕES (polígono)")
        for layer, label in [("continent","🌍 Continente"),("country","🏳 País"),("region","📍 Região")]:
            ttk.Button(inner, text=label,
                       command=lambda l=layer: self._set_tool("polygon", l, None)
                       ).pack(fill="x", padx=4, pady=1)

        # Water
        _sec("ÁGUA")
        wf = ttk.Frame(inner); wf.pack(fill="x", padx=4, pady=1)
        ttk.Button(wf, text="🌊 Mar/Lago",
                   command=lambda: self._set_tool("polygon","water","sea")).pack(side="left", expand=True, fill="x", padx=1)
        ttk.Button(wf, text="〜 Rio",
                   command=lambda: self._set_tool("polyline","water","river")).pack(side="left", expand=True, fill="x", padx=1)

        # Terrain
        _sec("TERRENO (clique para colocar)")
        tg = ttk.Frame(inner); tg.pack(fill="x", padx=4)
        for i, (ttype, tlabel, tsym) in enumerate(TERRAIN_TYPES):
            ttk.Button(tg, text=f"{tsym} {tlabel}",
                       command=lambda t=ttype: self._set_tool("point","terrain",t)
                       ).grid(row=i//2, column=i%2, sticky="ew", padx=1, pady=1)
        tg.columnconfigure(0, weight=1); tg.columnconfigure(1, weight=1)

        # Roads
        _sec("ESTRADAS (linha)")
        for rtype, rlabel, _ in ROAD_TYPES:
            ttk.Button(inner, text=f"— {rlabel}",
                       command=lambda r=rtype: self._set_tool("polyline","road",r)
                       ).pack(fill="x", padx=4, pady=1)

        # Settlements
        _sec("ASSENTAMENTOS (clique)")
        sg = ttk.Frame(inner); sg.pack(fill="x", padx=4)
        for i, (stype, slabel, ssym) in enumerate(SETTLEMENT_TYPES):
            ttk.Button(sg, text=f"{ssym} {slabel}",
                       command=lambda s=stype: self._set_tool("point","settlement",s)
                       ).grid(row=i//2, column=i%2, sticky="ew", padx=1, pady=1)
        sg.columnconfigure(0, weight=1); sg.columnconfigure(1, weight=1)

        # POI
        _sec("PDI — Pontos de Interesse")
        pg = ttk.Frame(inner); pg.pack(fill="x", padx=4)
        for i, (ptype, plabel, psym) in enumerate(POI_TYPES):
            ttk.Button(pg, text=f"{psym} {plabel}",
                       command=lambda p=ptype: self._set_tool("point","poi",p)
                       ).grid(row=i//2, column=i%2, sticky="ew", padx=1, pady=1)
        pg.columnconfigure(0, weight=1); pg.columnconfigure(1, weight=1)

        # Text / Token
        _sec("TEXTO / TOKEN")
        tf = ttk.Frame(inner); tf.pack(fill="x", padx=4, pady=1)
        ttk.Button(tf, text="T Texto",
                   command=lambda: self._set_tool("label","note",None)).pack(side="left", expand=True, fill="x", padx=1)
        ttk.Button(tf, text="● Token",
                   command=lambda: self._set_tool("token","token",None)).pack(side="left", expand=True, fill="x", padx=1)

        # Decoration
        _sec("DECORAÇÃO")
        ttk.Button(inner, text="✦ Rosa dos Ventos",
                   command=lambda: self._set_tool("point","decoration","compass")
                   ).pack(fill="x", padx=4, pady=2)
        ttk.Button(inner, text="📜 Título do Mapa",
                   command=lambda: self._set_tool("point","decoration","map_title")
                   ).pack(fill="x", padx=4, pady=2)

        # Custom icons
        _sec("ÍCONES PERSONALIZADOS")
        ttk.Button(inner, text="📁 Importar PNG...",
                   command=self._import_icon).pack(fill="x", padx=4, pady=2)
        self._icon_grid_frame = ttk.Frame(inner)
        self._icon_grid_frame.pack(fill="x", padx=4)
        self._refresh_icon_grid()

        # Cancel / finish draw
        _sec("DESENHO")
        df = ttk.Frame(inner); df.pack(fill="x", padx=4, pady=1)
        ttk.Button(df, text="✓ Concluir",
                   command=lambda: self._cv._finish_draw()).pack(side="left", expand=True, fill="x", padx=1)
        ttk.Button(df, text="✗ Cancelar",
                   command=lambda: self._cv._cancel_draw()).pack(side="left", expand=True, fill="x", padx=1)

        # Zoom controls
        _sec("ZOOM")
        zf = ttk.Frame(inner); zf.pack(fill="x", padx=4, pady=1)
        ttk.Button(zf, text="+",     command=lambda: self._cv.zoom_in()).pack(side="left", expand=True, fill="x", padx=1)
        ttk.Button(zf, text="−",     command=lambda: self._cv.zoom_out()).pack(side="left", expand=True, fill="x", padx=1)
        ttk.Button(zf, text="Reset", command=lambda: self._cv.zoom_reset()).pack(side="left", expand=True, fill="x", padx=1)

        # Colors
        _sec("CORES PADRÃO")
        for attr, label, default in [
            ("fill_color",  "Preenchimento", LAYER_DEFAULTS["region"]["fill"]),
            ("line_color",  "Linha/Borda",   LAYER_DEFAULTS["region"]["outline"]),
            ("text_color",  "Texto/Ícone",   "#ffffff"),
            ("token_color", "Token",         LAYER_DEFAULTS["token"]["color"]),
        ]:
            row = ttk.Frame(inner); row.pack(fill="x", padx=4, pady=1)
            ttk.Label(row, text=label, font=("Segoe UI", 8), width=13).pack(side="left")
            btn = tk.Button(row, bg=default, width=3, relief="flat", cursor="hand2",
                            command=lambda a=attr: self._pick_color(a))
            btn.pack(side="left")
            setattr(self, f"_cbtn_{attr}", btn)

        # Background color
        row = ttk.Frame(inner); row.pack(fill="x", padx=4, pady=1)
        ttk.Label(row, text="Fundo", font=("Segoe UI", 8), width=13).pack(side="left")
        self._bg_btn = tk.Button(row, bg=BG_STYLES["dark"], width=3, relief="flat",
                                 cursor="hand2", command=self._pick_bg)
        self._bg_btn.pack(side="left")

        # Grid
        _sec("GRADE")
        self._grid_var = tk.StringVar(value="none")
        for val, lbl in [("none","Nenhuma"),("square","Quadrada"),("hex","Hexagonal")]:
            ttk.Radiobutton(inner, text=lbl, value=val, variable=self._grid_var,
                            command=self._on_grid_change).pack(anchor="w", padx=6)
        gs_row = ttk.Frame(inner); gs_row.pack(fill="x", padx=4, pady=(2,4))
        ttk.Label(gs_row, text="Tamanho:", font=("Segoe UI",8)).pack(side="left")
        self._grid_size_var = tk.IntVar(value=50)
        ttk.Spinbox(gs_row, textvariable=self._grid_size_var, from_=10, to=300,
                    width=6, command=self._on_grid_change).pack(side="left", padx=2)

    # ── Right panel ───────────────────────────────────────────────────────────

    def _build_right_placeholder(self):
        for w in self._right_frame.winfo_children():
            w.destroy()
        ttk.Label(self._right_frame,
                  text="Selecione um\nitem para editar",
                  foreground=COLORS.get("text_muted","#94a3b8"),
                  font=("Segoe UI", 10),
                  justify="center").place(relx=0.5, rely=0.4, anchor="center")

    def _build_right_panel(self, item: dict):
        for w in self._right_frame.winfo_children():
            w.destroy()

        container = ttk.Frame(self._right_frame)
        container.pack(fill="both", expand=True, padx=6, pady=6)

        t = item.get("type", "")
        pad = {"padx": 2, "pady": 2}

        # Title
        ttk.Label(container, text=LAYER_LABELS.get(item.get("layer","note"), t.capitalize()),
                  font=("Segoe UI", 9, "bold"),
                  foreground=COLORS.get("accent","#06b6d4")).pack(anchor="w", **pad)

        # Name / text field
        name_field = "text" if t == "note" else "name"
        if t not in ("map_title",) and (name_field in item or t in ("note","continent","country","region","water","settlement","poi","image_icon")):
            ttk.Label(container, text="Nome:", font=("Segoe UI", 8)).pack(anchor="w")
            name_var = tk.StringVar(value=item.get(name_field, ""))
            name_entry = ttk.Entry(container, textvariable=name_var)
            name_entry.pack(fill="x", **pad)
        else:
            name_var = None

        # Subtype
        subtype_var = None
        if t == "terrain":
            ttk.Label(container, text="Tipo:", font=("Segoe UI",8)).pack(anchor="w")
            subtype_var = tk.StringVar(value=item.get("terrain_type","mountain"))
            ttk.Combobox(container, textvariable=subtype_var,
                         values=[tt for tt,_,_ in TERRAIN_TYPES],
                         state="readonly").pack(fill="x", **pad)
        elif t == "settlement":
            ttk.Label(container, text="Tipo:", font=("Segoe UI",8)).pack(anchor="w")
            subtype_var = tk.StringVar(value=item.get("settlement_type","city"))
            ttk.Combobox(container, textvariable=subtype_var,
                         values=[st for st,_,_ in SETTLEMENT_TYPES],
                         state="readonly").pack(fill="x", **pad)
        elif t == "poi":
            ttk.Label(container, text="Tipo:", font=("Segoe UI",8)).pack(anchor="w")
            subtype_var = tk.StringVar(value=item.get("poi_type","dungeon"))
            ttk.Combobox(container, textvariable=subtype_var,
                         values=[pt for pt,_,_ in POI_TYPES],
                         state="readonly").pack(fill="x", **pad)
        elif t == "water":
            ttk.Label(container, text="Tipo:", font=("Segoe UI",8)).pack(anchor="w")
            subtype_var = tk.StringVar(value=item.get("water_type","sea"))
            ttk.Combobox(container, textvariable=subtype_var,
                         values=["sea","lake","river"],
                         state="readonly").pack(fill="x", **pad)
        elif t == "road":
            ttk.Label(container, text="Tipo:", font=("Segoe UI",8)).pack(anchor="w")
            subtype_var = tk.StringVar(value=item.get("road_type","road"))
            ttk.Combobox(container, textvariable=subtype_var,
                         values=[rt for rt,_,_ in ROAD_TYPES],
                         state="readonly").pack(fill="x", **pad)
        elif t == "country":
            ttk.Label(container, text="Borda:", font=("Segoe UI",8)).pack(anchor="w")
            subtype_var = tk.StringVar(value=item.get("border_style","dashed"))
            ttk.Combobox(container, textvariable=subtype_var,
                         values=["solid","dashed","dotted"],
                         state="readonly").pack(fill="x", **pad)

        # Size
        size_var = None
        if t not in ("continent","country","region","water","road"):
            ttk.Label(container, text="Tamanho:", font=("Segoe UI",8)).pack(anchor="w")
            size_var = tk.IntVar(value=item.get("size",16))
            size_max = 1000 if t == "image_icon" else 500
            ttk.Spinbox(container, textvariable=size_var, from_=4, to=size_max,
                        width=8).pack(anchor="w", **pad)

        # Color buttons
        color_fields = []
        if t in ("continent","country","region","water"):
            color_fields = [("fill","Preenchimento"),("outline","Contorno"),("text_color","Texto")]
        elif t == "settlement":
            color_fields = [("color","Cor símbolo"),("label_color","Cor nome")]
        elif t in ("terrain","poi","token","compass"):
            color_fields = [("color","Cor")]
        elif t == "road":
            color_fields = [("color","Cor")]
        elif t == "note":
            color_fields = [("color","Cor texto")]
        elif t == "map_title":
            color_fields = [("color","Cor texto")]

        color_vars = {}
        for field, label in color_fields:
            f = ttk.Frame(container); f.pack(fill="x", pady=1)
            ttk.Label(f, text=label+":", font=("Segoe UI",8), width=14).pack(side="left")
            current = item.get(field, "#ffffff")
            color_vars[field] = tk.StringVar(value=current)
            btn = tk.Button(f, bg=current, width=3, relief="flat", cursor="hand2")
            btn.pack(side="left")
            def _pick(fld=field, b=btn, cv=color_vars):
                res = colorchooser.askcolor(color=cv[fld].get(), parent=self)
                if res[1]:
                    cv[fld].set(res[1])
                    b.config(bg=res[1])
            btn.config(command=_pick)

        # Bold / italic for notes
        bold_var = italic_var = None
        if t == "note":
            bf = ttk.Frame(container); bf.pack(fill="x", pady=1)
            bold_var = tk.BooleanVar(value=item.get("bold", False))
            italic_var = tk.BooleanVar(value=item.get("italic", False))
            ttk.Checkbutton(bf, text="Negrito", variable=bold_var).pack(side="left")
            ttk.Checkbutton(bf, text="Itálico", variable=italic_var).pack(side="left")

        # map_title extra fields
        map_title_text_var = None
        box_color_var = None
        if t == "map_title":
            ttk.Label(container, text="Texto:", font=("Segoe UI",8)).pack(anchor="w")
            map_title_text_var = tk.StringVar(value=item.get("text","Título do Mapa"))
            ttk.Entry(container, textvariable=map_title_text_var).pack(fill="x", **pad)
            f2 = ttk.Frame(container); f2.pack(fill="x", pady=1)
            ttk.Label(f2, text="Cor caixa:", font=("Segoe UI",8), width=10).pack(side="left")
            box_color_var = tk.StringVar(value=item.get("box_color","#c8a870"))
            bc_btn = tk.Button(f2, bg=item.get("box_color","#c8a870"), width=3, relief="flat", cursor="hand2")
            bc_btn.pack(side="left")
            def _pick_box(b=bc_btn, v=box_color_var):
                res = colorchooser.askcolor(color=v.get(), parent=self)
                if res[1]:
                    v.set(res[1]); b.config(bg=res[1])
            bc_btn.config(command=_pick_box)

        # Rotation spinbox for items that support it
        rot_var = None
        if "rotation" in item:
            ttk.Label(container, text="Rotação (°):", font=("Segoe UI",8)).pack(anchor="w")
            rot_var = tk.IntVar(value=item.get("rotation", 0))
            ttk.Spinbox(container, textvariable=rot_var, from_=0, to=359,
                        wrap=True, width=8).pack(anchor="w", **pad)

        ttk.Separator(container, orient="horizontal").pack(fill="x", pady=6)

        def _apply():
            if name_var:
                item[name_field] = name_var.get()
            if subtype_var:
                if t == "terrain":    item["terrain_type"]    = subtype_var.get()
                elif t == "settlement": item["settlement_type"] = subtype_var.get()
                elif t == "poi":      item["poi_type"]         = subtype_var.get()
                elif t == "water":    item["water_type"]       = subtype_var.get()
                elif t == "road":     item["road_type"]        = subtype_var.get()
                elif t == "country":  item["border_style"]     = subtype_var.get()
            if size_var:
                item["size"] = size_var.get()
                if item.get("type") == "image_icon":
                    self._cv._img_cache.clear()
            for field in color_vars:
                item[field] = color_vars[field].get()
            if bold_var:
                item["bold"]   = bold_var.get()
            if italic_var:
                item["italic"] = italic_var.get()
            if map_title_text_var:
                item["text"] = map_title_text_var.get()
            if box_color_var:
                item["box_color"] = box_color_var.get()
            if rot_var is not None:
                item["rotation"] = rot_var.get()
                self._cv._img_cache.clear()
            self._cv._schedule_redraw()
            if self._cv.on_change:
                self._cv.on_change()

        ttk.Button(container, text="✓ Aplicar", command=_apply,
                   style="Accent.TButton").pack(fill="x", pady=1)
        ttk.Button(container, text="✕ Deletar",
                   command=lambda: self._cv._remove(item["id"]),
                   style="Danger.TButton").pack(fill="x", pady=1)

    # ── Session management ────────────────────────────────────────────────────

    def _refresh_maps(self):
        maps = self._mgr.list_maps()
        self._map_combo["values"] = maps
        if maps and not self._map_name:
            self._map_var.set(maps[0])
            self._load_map(maps[0])

    def _on_map_selected(self, _=None):
        name = self._map_var.get()
        if name and name != self._map_name:
            self._autosave()
            self._load_map(name)

    def _new_map(self):
        name = simpledialog.askstring("Novo Mapa", "Nome do mapa:", parent=self)
        if not name:
            return
        if name in self._mgr.list_maps():
            messagebox.showwarning("Aviso", f"Já existe um mapa com o nome '{name}'.")
            return
        self._autosave()
        data = self._mgr.create_map(name)
        self._map_name = name
        self._map_data = data
        self._refresh_maps()
        self._map_var.set(name)
        self._apply_map_to_canvas()
        self._update_canvas_state()

    def _del_map(self):
        name = self._map_var.get()
        if not name:
            return
        if not messagebox.askyesno("Confirmar", f"Excluir mapa '{name}'?"):
            return
        self._mgr.delete_map(name)
        self._map_name = ""
        self._map_data = None
        self._map_var.set("")
        self._refresh_maps()
        self._update_canvas_state()

    def _load_map(self, name: str):
        data = self._mgr.load_map(name)
        if data is None:
            return
        self._map_name = name
        self._map_data = data
        self._apply_map_to_canvas()
        self._refresh_snaps()
        self._sync_layer_vars()
        self._update_canvas_state()

    def _apply_map_to_canvas(self):
        if not self._map_data:
            return
        d = self._map_data
        style = d.get("bg_style", "dark")
        self._style_var.set(style)
        bg = d.get("bg_color", BG_STYLES.get(style, BG_STYLES["dark"]))
        self._bg_btn.config(bg=bg)
        self._cv.load(
            d.get("items", []),
            style,
            bg,
            d.get("grid_type", "none"),
            d.get("grid_size", 50),
            d.get("layers_visible", {}),
        )
        self._grid_var.set(d.get("grid_type", "none"))
        self._grid_size_var.set(d.get("grid_size", 50))

    def _sync_layer_vars(self):
        lv = self._map_data.get("layers_visible", {}) if self._map_data else {}
        for layer, var in self._layer_vars.items():
            var.set(lv.get(layer, True))

    def _update_canvas_state(self):
        if self._map_data:
            self._placeholder.place_forget()
        else:
            self._placeholder.place(relx=0.5, rely=0.5, anchor="center")

    # ── Snapshots ─────────────────────────────────────────────────────────────

    def _refresh_snaps(self):
        if not self._map_data:
            return
        snaps = [s["name"] for s in self._map_data.get("snapshots", [])]
        self._snap_combo["values"] = snaps

    def _save_snap(self):
        if not self._map_data:
            return
        name = simpledialog.askstring("Snapshot", "Nome do snapshot:", parent=self)
        if not name:
            return
        snap = {"name": name, "items": self._cv.get_snapshot()}
        snaps = self._map_data.setdefault("snapshots", [])
        for i, s in enumerate(snaps):
            if s["name"] == name:
                snaps[i] = snap
                break
        else:
            snaps.append(snap)
        self._autosave()
        self._refresh_snaps()
        self._snap_var.set(name)

    def _restore_snap(self):
        name = self._snap_var.get()
        if not name or not self._map_data:
            return
        for s in self._map_data.get("snapshots", []):
            if s["name"] == name:
                if messagebox.askyesno("Restaurar", f"Restaurar '{name}'?"):
                    self._map_data["items"] = copy.deepcopy(s["items"])
                    self._apply_map_to_canvas()
                return

    def _del_snap(self):
        name = self._snap_var.get()
        if not name or not self._map_data:
            return
        self._map_data["snapshots"] = [
            s for s in self._map_data.get("snapshots", []) if s["name"] != name
        ]
        self._autosave()
        self._refresh_snaps()
        self._snap_var.set("")

    # ── Canvas events ─────────────────────────────────────────────────────────

    def _on_canvas_change(self):
        if not self._map_data:
            return
        self._map_data["items"] = self._cv.items_data
        if not self._save_pending:
            self._save_pending = True
            self.after(800, self._flush_save)

    def _flush_save(self):
        self._save_pending = False
        self._autosave()

    def _autosave(self):
        if self._map_name and self._map_data:
            self._mgr.save_map(self._map_name, self._map_data)

    def _on_item_select(self, item):
        if item:
            t = item.get("type","")
            name = item.get("name") or item.get("text") or item.get("label") or ""
            stype = item.get("terrain_type") or item.get("settlement_type") or item.get("poi_type") or item.get("water_type") or ""
            self._status_var.set(
                f"[{LAYER_LABELS.get(item.get('layer','?'),'?')} / {t}]"
                + (f" «{name}»" if name else "")
                + (f" ({stype})" if stype else "")
                + "  |  Duplo-clique: renomear  |  Del: remover"
            )
            self._build_right_panel(item)
        else:
            self._status_var.set("Clique para selecionar • Clique direito para opções.")
            self._build_right_placeholder()

    def _on_cv_motion(self, e):
        wx, wy = self._cv.s2w(e.x, e.y)
        pts = len(self._cv._draw_pts)
        hint = ""
        if self._cv.tool in ("polygon","polyline") and pts > 0:
            hint = f"  |  {pts} pt(s) — Enter/2×clique = concluir, Esc = cancelar"
        self._status_var.set(f"x={wx:.0f}  y={wy:.0f}  |  Zoom: {self._cv.zoom:.2f}x{hint}")

    # ── Tool & color helpers ──────────────────────────────────────────────────

    def _set_tool(self, tool: str, layer, subtype):
        self._cv.tool = tool
        if layer:
            self._cv.active_layer = layer
        if subtype:
            self._cv.active_subtype = subtype
        self._cv._cancel_draw()
        cur = "crosshair" if tool != "select" else "arrow"
        self._cv.config(cursor=cur)
        hint = f"{tool}"
        if layer:   hint += f" / {LAYER_LABELS.get(layer, layer)}"
        if subtype: hint += f" / {subtype}"
        self._status_var.set(f"Ferramenta: {hint}")

    # ── Custom icon management ────────────────────────────────────────────────

    def _import_icon(self):
        path = filedialog.askopenfilename(
            title="Importar Ícone PNG",
            filetypes=[("Imagens", "*.png *.jpg *.gif *.ico"), ("Todos", "*.*")],
            parent=self,
        )
        if not path:
            return
        import shutil
        _os.makedirs(_ICONS_DIR, exist_ok=True)
        fname = _os.path.basename(path)
        dest = _os.path.join(_ICONS_DIR, fname)
        try:
            shutil.copy2(path, dest)
        except Exception as ex:
            messagebox.showerror("Erro", f"Falha ao copiar ícone:\n{ex}", parent=self)
            return
        self._refresh_icon_grid()
        self._status_var.set(f"Ícone importado: {fname}")

    def _refresh_icon_grid(self):
        if not hasattr(self, "_icon_grid_frame"):
            return
        for w in self._icon_grid_frame.winfo_children():
            w.destroy()
        _os.makedirs(_ICONS_DIR, exist_ok=True)
        exts = (".png", ".jpg", ".jpeg", ".gif", ".ico")
        icons = [f for f in sorted(_os.listdir(_ICONS_DIR))
                 if _os.path.splitext(f.lower())[1] in exts]
        for i, fname in enumerate(icons[:24]):
            path = _os.path.join(_ICONS_DIR, fname)
            photo = None
            try:
                from PIL import Image, ImageTk
                img = Image.open(path).convert("RGBA").resize((28, 28), Image.LANCZOS)
                photo = ImageTk.PhotoImage(img)
            except Exception:
                pass
            short = fname[:5] if not photo else ""
            btn = tk.Button(
                self._icon_grid_frame,
                text=short,
                image=photo if photo else None,
                width=32, height=32,
                relief="flat",
                bg=COLORS.get("surface", "#252641"),
                fg=COLORS.get("text", "#e2e8f0"),
                cursor="hand2",
                command=lambda f=fname: self._select_icon(f),
            )
            if photo:
                btn.image = photo  # keep reference
            btn.grid(row=i // 4, column=i % 4, padx=1, pady=1)

    def _select_icon(self, fname: str):
        self._cv.active_image = fname
        self._cv.tool = "point"
        self._cv.active_layer = "poi"
        self._cv.active_subtype = "image_icon"
        self._cv._cancel_draw()
        self._cv.config(cursor="crosshair")
        self._status_var.set(f"Ícone: {fname} — clique no mapa para colocar")

    def _pick_color(self, attr: str):
        current = getattr(self._cv, attr, "#ffffff")
        res = colorchooser.askcolor(color=current, parent=self)
        if res[1]:
            setattr(self._cv, attr, res[1])
            btn = getattr(self, f"_cbtn_{attr}", None)
            if btn:
                btn.config(bg=res[1])

    def _pick_bg(self):
        res = colorchooser.askcolor(color=self._cv.map_bg, parent=self,
                                    title="Cor de fundo do mapa")
        if res[1]:
            self._cv.map_bg = res[1]
            self._bg_btn.config(bg=res[1])
            if self._map_data:
                self._map_data["bg_color"] = res[1]
            self._cv._parchment_photo = None
            self._cv._schedule_redraw()
            self._autosave()

    def _open_qt_editor(self):
        """Abre o editor avançado PySide6 como processo separado."""
        try:
            from src.ui.map_editor.launch import launch_editor
            launch_editor(self._map_name or "")
        except ImportError:
            messagebox.showerror(
                "Editor Avançado",
                "PySide6 não instalado.\nInstale com: pip install PySide6"
            )
        except Exception as e:
            messagebox.showerror("Erro", str(e))

    def _on_style_change(self):
        style = self._style_var.get()
        if style == "custom":
            self._pick_bg()
            return
        bg = BG_STYLES.get(style, BG_STYLES["dark"])
        self._cv.bg_style = style
        self._cv.map_bg   = bg
        self._bg_btn.config(bg=bg)
        if self._map_data:
            self._map_data["bg_style"] = style
            self._map_data["bg_color"] = bg
        self._cv._parchment_photo = None
        self._cv._schedule_redraw()
        self._autosave()

    def _on_grid_change(self):
        gt = self._grid_var.get()
        gs = self._grid_size_var.get()
        self._cv.grid_type = gt
        self._cv.grid_size = gs
        if self._map_data:
            self._map_data["grid_type"] = gt
            self._map_data["grid_size"] = gs
        self._cv._schedule_redraw()
        self._autosave()

    # ── Export ────────────────────────────────────────────────────────────────

    def _export_png(self):
        if not self._map_data:
            messagebox.showwarning("Aviso", "Nenhum mapa carregado.")
            return
        path = filedialog.asksaveasfilename(
            title="Exportar Mapa como PNG",
            defaultextension=".png",
            filetypes=[("PNG", "*.png"), ("Todos", "*.*")],
            initialfile=f"{self._map_name or 'mapa'}.png",
        )
        if not path:
            return
        try:
            from PIL import ImageGrab
            self._cv.update_idletasks()
            x1 = self._cv.winfo_rootx()
            y1 = self._cv.winfo_rooty()
            x2 = x1 + self._cv.winfo_width()
            y2 = y1 + self._cv.winfo_height()
            img = ImageGrab.grab(bbox=(x1, y1, x2, y2))
            img.save(path)
            messagebox.showinfo("Exportado", f"Mapa salvo em:\n{path}")
        except Exception as ex:
            messagebox.showerror("Erro", f"Falha ao exportar: {ex}")
