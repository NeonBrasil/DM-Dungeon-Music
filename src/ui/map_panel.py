"""
DM - Dungeon Music
Criador de Mapas para campanhas de RPG.
Canvas com zoom/pan, ferramentas de desenho, sessoes e snapshots.
"""

import tkinter as tk
from tkinter import ttk, simpledialog, messagebox, colorchooser, filedialog
import json
import math
import uuid
import copy

from src.map_manager import MapSessionManager
from src.ui.theme import COLORS

# ─── Icones de terreno disponiveis ───────────────────────────────────────────

TERRAIN_ICONS = [
    ("Montanha",     "^"),
    ("Neve/Pico",    "^^"),
    ("Floresta",     "t"),
    ("Agua/Rio",     "~"),
    ("Deserto",      "."),
    ("Planicie",     "_"),
    ("Vulcao",       "V"),
    ("Pantano",      "%"),
    ("Castelo",      "[#]"),
    ("Cidade",       "(o)"),
    ("Ruinas",       "&"),
    ("Capital",      "*"),
    ("Batalha",      "X"),
    ("Perigo",       "!"),
    ("Dungeon",      "D"),
    ("Taverna",      "T"),
    ("Porto",        "P"),
    ("Templo",       "+"),
    ("Desconhecido", "?"),
    ("Marcador",     "O"),
]

_DFILL  = "#3a6b35"
_DLINE  = "#111111"
_DTEXT  = "#ffffff"
_DTOKEN = "#c0392b"


# ─── Dialogo de edicao generica ───────────────────────────────────────────────

class _EditDialog(tk.Toplevel):
    """Dialog simples para editar propriedades de um item do mapa."""

    def __init__(self, parent, item: dict):
        super().__init__(parent)
        self.resizable(False, False)
        self.result = None
        t = item["type"]

        if t == "region":
            self.title("Editar Regiao")
            self._fields = [
                ("name",          "Nome",              "text",  item.get("name", "")),
                ("fill",          "Preenchimento",     "color", item.get("fill", _DFILL)),
                ("outline",       "Borda",             "color", item.get("outline", _DLINE)),
                ("outline_width", "Largura da borda",  "int",   item.get("outline_width", 2)),
                ("text_color",    "Cor do texto",      "color", item.get("text_color", _DTEXT)),
            ]
        elif t == "border":
            self.title("Editar Fronteira")
            self._fields = [
                ("color",  "Cor",       "color", item.get("color", _DLINE)),
                ("width",  "Largura",   "int",   item.get("width", 2)),
                ("dashed", "Tracejado", "bool",  item.get("dashed", False)),
            ]
        elif t == "label":
            self.title("Editar Texto")
            self._fields = [
                ("text",  "Texto",    "text",  item.get("text", "")),
                ("size",  "Tamanho",  "int",   item.get("size", 14)),
                ("color", "Cor",      "color", item.get("color", _DTEXT)),
                ("bold",  "Negrito",  "bool",  item.get("bold", False)),
            ]
        elif t == "icon":
            self.title("Editar Icone")
            self._fields = [
                ("symbol", "Simbolo", "text",  item.get("symbol", "?")),
                ("size",   "Tamanho", "int",   item.get("size", 18)),
                ("color",  "Cor",     "color", item.get("color", _DTEXT)),
            ]
        elif t == "token":
            self.title("Editar Token")
            self._fields = [
                ("label", "Texto",   "text",  item.get("label", "A")),
                ("color", "Cor",     "color", item.get("color", _DTOKEN)),
                ("size",  "Tamanho", "int",   item.get("size", 16)),
            ]
        else:
            self._fields = []

        self._vars = {}
        self._color_btns = {}
        self._build()
        self.grab_set()
        self.wait_window()

    def _build(self):
        pad = {"padx": 10, "pady": 3}
        for key, label, ftype, default in self._fields:
            row = ttk.Frame(self)
            row.pack(fill="x", **pad)
            ttk.Label(row, text=label + ":", width=18, anchor="w").pack(side="left")

            if ftype == "text":
                var = tk.StringVar(value=str(default))
                ttk.Entry(row, textvariable=var, width=22).pack(side="left")
                self._vars[key] = var

            elif ftype == "int":
                var = tk.IntVar(value=int(default))
                ttk.Spinbox(row, textvariable=var, from_=1, to=200, width=7).pack(side="left")
                self._vars[key] = var

            elif ftype == "bool":
                var = tk.BooleanVar(value=bool(default))
                ttk.Checkbutton(row, variable=var).pack(side="left")
                self._vars[key] = var

            elif ftype == "color":
                var = tk.StringVar(value=str(default))
                self._vars[key] = var
                btn = tk.Button(
                    row, bg=default, width=4, relief="flat", cursor="hand2",
                    command=lambda k=key, v=var: self._pick(k, v),
                )
                btn.pack(side="left")
                self._color_btns[key] = btn

        btns = ttk.Frame(self)
        btns.pack(fill="x", padx=10, pady=(8, 6))
        ttk.Button(btns, text="OK", command=self._ok,
                   style="Accent.TButton").pack(side="right", padx=2)
        ttk.Button(btns, text="Cancelar",
                   command=self.destroy).pack(side="right", padx=2)

    def _pick(self, key: str, var: tk.StringVar):
        res = colorchooser.askcolor(color=var.get(), parent=self)
        if res[1]:
            var.set(res[1])
            self._color_btns[key].config(bg=res[1])

    def _ok(self):
        self.result = {}
        for key, _, ftype, _ in self._fields:
            self.result[key] = self._vars[key].get()
        self.destroy()


# ─── Canvas do Mapa ──────────────────────────────────────────────────────────

class MapCanvas(tk.Canvas):
    """Canvas interativo com zoom, pan e ferramentas de edicao de mapa."""

    def __init__(self, parent, **kwargs):
        super().__init__(
            parent,
            bg=COLORS.get("bg", "#1e1e2e"),
            highlightthickness=0,
            cursor="crosshair",
            **kwargs,
        )
        # View state
        self.zoom = 1.0
        self.offset_x = 0.0
        self.offset_y = 0.0
        self._view_ready = False

        # Map data
        self.items_data: list = []
        self.map_bg = "#2d4a1e"
        self.grid_type = "none"
        self.grid_size = 50

        # Tool state
        self.tool = "select"
        self.selected_id = None
        self._draw_pts: list = []        # world coords em progresso
        self._preview_cids: list = []    # canvas IDs do preview
        self._drag_start = None
        self._drag_item_origin = None
        self._drag_pts_origin = None
        self._pan_start = None
        self._pan_offset_start = None
        self._space_pan = False

        # Active colors / icon
        self.fill_color  = _DFILL
        self.line_color  = _DLINE
        self.text_color  = _DTEXT
        self.token_color = _DTOKEN
        self.active_icon = "^"
        self.active_icon_size = 18

        # canvas_id -> item_id  (rebuilt on every _redraw)
        self._cid_to_iid: dict = {}

        # Callbacks
        self.on_change = None   # () -> None  triggered on item add/move/remove
        self.on_select = None   # (item|None) -> None

        self._bind_events()

    # ── Coordinate helpers ───────────────────────────────────────────────────

    def w2s(self, wx, wy):
        return wx * self.zoom + self.offset_x, wy * self.zoom + self.offset_y

    def s2w(self, sx, sy):
        return (sx - self.offset_x) / self.zoom, (sy - self.offset_y) / self.zoom

    # ── Bindings ─────────────────────────────────────────────────────────────

    def _bind_events(self):
        self.bind("<Configure>",           self._on_configure)
        self.bind("<MouseWheel>",          self._on_wheel)
        self.bind("<Button-1>",            self._on_lclick)
        self.bind("<Double-Button-1>",     self._on_dclick)
        self.bind("<B1-Motion>",           self._on_drag)
        self.bind("<ButtonRelease-1>",     self._on_release)
        self.bind("<Button-2>",            self._on_pan_start)
        self.bind("<B2-Motion>",           self._on_pan_move)
        self.bind("<Button-3>",            self._on_rclick)
        self.bind("<Motion>",              self._on_motion)
        self.bind("<KeyPress-space>",      lambda e: self._set_space_pan(True))
        self.bind("<KeyRelease-space>",    lambda e: self._set_space_pan(False))
        self.bind("<KeyPress-Delete>",     self._on_delete_key)
        self.bind("<KeyPress-Escape>",     lambda e: self._cancel_draw())
        self.bind("<KeyPress-Return>",     lambda e: self._finish_draw())

    def _on_configure(self, e):
        # Ignora eventos iniciais com tamanho irreal (< 10px)
        if not self._view_ready and e.width > 10 and e.height > 10:
            self.offset_x = e.width / 2
            self.offset_y = e.height / 2
            self._view_ready = True
        self._redraw()

    # ── Zoom & Pan ───────────────────────────────────────────────────────────

    def _on_wheel(self, e):
        factor = 1.12 if e.delta > 0 else 1 / 1.12
        self._zoom_at(factor, e.x, e.y)

    def _zoom_at(self, factor, sx, sy):
        wx, wy = self.s2w(sx, sy)
        self.zoom = max(0.07, min(8.0, self.zoom * factor))
        self.offset_x = sx - wx * self.zoom
        self.offset_y = sy - wy * self.zoom
        self._redraw()

    def zoom_in(self):
        self._zoom_at(1.25, self.winfo_width() / 2, self.winfo_height() / 2)

    def zoom_out(self):
        self._zoom_at(0.8, self.winfo_width() / 2, self.winfo_height() / 2)

    def zoom_reset(self):
        self.zoom = 1.0
        self.offset_x = self.winfo_width() / 2
        self.offset_y = self.winfo_height() / 2
        self._redraw()

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
            self._redraw()

    def _set_space_pan(self, active: bool):
        self._space_pan = active
        self.config(cursor="fleur" if active else "crosshair")
        if not active:
            self._pan_start = None

    # ── Full Redraw ──────────────────────────────────────────────────────────

    def _redraw(self):
        self.delete("all")
        self._cid_to_iid.clear()

        w, h = self.winfo_width(), self.winfo_height()
        if w < 2 or h < 2:
            return

        # Background
        self.create_rectangle(0, 0, w, h, fill=self.map_bg, outline="")

        # Grid
        self._draw_grid(w, h)

        # Items  (regions first, then borders, icons/labels/tokens on top)
        order = {"region": 0, "border": 1, "icon": 2, "label": 3, "token": 4}
        for item in sorted(self.items_data, key=lambda i: order.get(i["type"], 9)):
            self._draw_item(item)

        # Selection overlay
        if self.selected_id:
            self._draw_selection()

    def _draw_grid(self, w, h):
        if self.grid_type == "none":
            return
        gs = self.grid_size * self.zoom
        if gs < 8:
            return
        col = "#ffffff28" if self._is_dark(self.map_bg) else "#00000028"

        if self.grid_type == "square":
            sx = math.floor(-self.offset_x / gs) * gs + self.offset_x
            x = sx
            while x <= w:
                self.create_line(x, 0, x, h, fill=col)
                x += gs
            sy = math.floor(-self.offset_y / gs) * gs + self.offset_y
            y = sy
            while y <= h:
                self.create_line(0, y, w, y, fill=col)
                y += gs

        elif self.grid_type == "hex":
            r = gs / 2
            hex_w = r * 2
            hex_h = math.sqrt(3) * r
            cols = int(w / (hex_w * 0.75)) + 3
            rows = int(h / hex_h) + 3
            ox = self.offset_x % (hex_w * 1.5) - hex_w * 1.5
            oy = self.offset_y % (hex_h * 2) - hex_h

            for col_i in range(cols):
                for row_i in range(rows):
                    cx = col_i * hex_w * 0.75 + ox
                    cy = row_i * hex_h + oy
                    if col_i % 2 == 1:
                        cy += hex_h / 2
                    pts = []
                    for a in range(6):
                        ang = math.pi / 3 * a - math.pi / 6
                        pts += [cx + r * math.cos(ang), cy + r * math.sin(ang)]
                    self.create_polygon(pts, fill="", outline=col)

    @staticmethod
    def _is_dark(hex_color: str) -> bool:
        try:
            r, g, b = int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16)
            return (r * 299 + g * 587 + b * 114) / 1000 < 128
        except Exception:
            return True

    def _draw_item(self, item: dict):
        iid = item["id"]
        tag = f"item:{iid}"
        t = item["type"]

        if t == "region":
            pts = item.get("points", [])
            if len(pts) < 3:
                return
            flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
            cid = self.create_polygon(
                flat,
                fill=item.get("fill", _DFILL),
                outline=item.get("outline", _DLINE),
                width=max(1, item.get("outline_width", 2)),
                tags=("mi", tag),
            )
            self._cid_to_iid[cid] = iid
            if item.get("name"):
                cx = sum(p[0] for p in pts) / len(pts)
                cy = sum(p[1] for p in pts) / len(pts)
                sx, sy = self.w2s(cx, cy)
                self.create_text(
                    sx, sy, text=item["name"],
                    fill=item.get("text_color", _DTEXT),
                    font=("Segoe UI", max(7, int(11 * self.zoom)), "bold"),
                    tags=("mi", tag),
                )

        elif t == "border":
            pts = item.get("points", [])
            if len(pts) < 2:
                return
            flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
            dash = (8, 4) if item.get("dashed") else None
            cid = self.create_line(
                flat,
                fill=item.get("color", _DLINE),
                width=max(1, int(item.get("width", 2) * self.zoom)),
                dash=dash, smooth=True,
                tags=("mi", tag),
            )
            self._cid_to_iid[cid] = iid

        elif t == "icon":
            sx, sy = self.w2s(item["x"], item["y"])
            sz = max(7, int(item.get("size", 18) * self.zoom))
            cid = self.create_text(
                sx, sy, text=item.get("symbol", "?"),
                fill=item.get("color", _DTEXT),
                font=("Consolas", sz, "bold"),
                tags=("mi", tag),
            )
            self._cid_to_iid[cid] = iid

        elif t == "label":
            sx, sy = self.w2s(item["x"], item["y"])
            sz = max(6, int(item.get("size", 14) * self.zoom))
            weight = "bold" if item.get("bold") else "normal"
            cid = self.create_text(
                sx, sy, text=item.get("text", ""),
                fill=item.get("color", _DTEXT),
                font=("Segoe UI", sz, weight),
                tags=("mi", tag),
            )
            self._cid_to_iid[cid] = iid

        elif t == "token":
            sx, sy = self.w2s(item["x"], item["y"])
            r = max(6, int(item.get("size", 16) * self.zoom))
            cid = self.create_oval(
                sx - r, sy - r, sx + r, sy + r,
                fill=item.get("color", _DTOKEN),
                outline="#ffffff", width=2,
                tags=("mi", tag),
            )
            self._cid_to_iid[cid] = iid
            self.create_text(
                sx, sy, text=item.get("label", "?"),
                fill="#ffffff",
                font=("Segoe UI", max(6, int(r * 0.85)), "bold"),
                tags=("mi", tag),
            )

    def _draw_selection(self):
        item = self._get(self.selected_id)
        if not item:
            return
        sel = "#00aaff"
        t = item["type"]

        if t == "region":
            pts = item.get("points", [])
            if len(pts) < 3:
                return
            flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
            self.create_polygon(flat, fill="", outline=sel, width=3, dash=(6, 3))
            for wx, wy in pts:
                sx, sy = self.w2s(wx, wy)
                self.create_rectangle(sx - 5, sy - 5, sx + 5, sy + 5,
                                      fill=sel, outline="white")

        elif t == "border":
            pts = item.get("points", [])
            if len(pts) < 2:
                return
            flat = [c for wx, wy in pts for c in self.w2s(wx, wy)]
            self.create_line(flat, fill=sel, width=4, dash=(6, 3), smooth=True)
            for wx, wy in pts:
                sx, sy = self.w2s(wx, wy)
                self.create_rectangle(sx - 5, sy - 5, sx + 5, sy + 5,
                                      fill=sel, outline="white")

        elif t in ("icon", "label", "token"):
            sx, sy = self.w2s(item["x"], item["y"])
            r = 22
            self.create_oval(sx - r, sy - r, sx + r, sy + r,
                             fill="", outline=sel, width=2, dash=(4, 3))

    # ── Mouse Events ─────────────────────────────────────────────────────────

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
                if item["type"] in ("icon", "label", "token"):
                    self._drag_item_origin = (item["x"], item["y"])
                elif item["type"] in ("region", "border"):
                    self._drag_pts_origin = [tuple(p) for p in item["points"]]

        elif self.tool in ("region", "border"):
            self._draw_pts.append((wx, wy))
            self._update_preview(e.x, e.y)

        elif self.tool == "label":
            text = simpledialog.askstring("Label", "Texto:", parent=self)
            if text:
                self._add({"id": str(uuid.uuid4()), "type": "label",
                           "x": wx, "y": wy, "text": text,
                           "size": 14, "color": self.text_color, "bold": False})

        elif self.tool == "icon":
            self._add({"id": str(uuid.uuid4()), "type": "icon",
                       "x": wx, "y": wy, "symbol": self.active_icon,
                       "size": self.active_icon_size, "color": self.text_color})

        elif self.tool == "token":
            lbl = simpledialog.askstring("Token", "Letra/simbolo (ex: A, P1):", parent=self)
            if lbl:
                self._add({"id": str(uuid.uuid4()), "type": "token",
                           "x": wx, "y": wy, "label": lbl[:3],
                           "color": self.token_color, "size": 16})

    def _on_dclick(self, e):
        if self.tool == "region" and len(self._draw_pts) >= 3:
            self._finish_draw()
        elif self.tool == "border" and len(self._draw_pts) >= 2:
            self._finish_draw()
        elif self.tool == "select":
            self._try_select(e.x, e.y)
            if self.selected_id:
                self._edit_item(self.selected_id)

    def _on_motion(self, e):
        if self._space_pan and self._pan_start:
            dx = e.x - self._pan_start[0]
            dy = e.y - self._pan_start[1]
            self.offset_x = self._pan_offset_start[0] + dx
            self.offset_y = self._pan_offset_start[1] + dy
            self._redraw()
            return
        if self.tool in ("region", "border") and self._draw_pts:
            self._update_preview(e.x, e.y)
        # Coordinate display
        wx, wy = self.s2w(e.x, e.y)
        if self.on_select:
            pass  # status bar handled by MapPanel

    def _on_drag(self, e):
        if self._space_pan:
            return
        if self.tool != "select" or not self._drag_start or not self.selected_id:
            return
        dx_w = (e.x - self._drag_start[0]) / self.zoom
        dy_w = (e.y - self._drag_start[1]) / self.zoom
        item = self._get(self.selected_id)
        if not item:
            return

        if item["type"] in ("icon", "label", "token") and self._drag_item_origin:
            item["x"] = self._drag_item_origin[0] + dx_w
            item["y"] = self._drag_item_origin[1] + dy_w
            self._redraw()
        elif item["type"] in ("region", "border") and self._drag_pts_origin:
            for i, (ox, oy) in enumerate(self._drag_pts_origin):
                item["points"][i] = [ox + dx_w, oy + dy_w]
            self._redraw()

    def _on_release(self, e):
        if self._drag_start:
            if self.on_change:
                self.on_change()
        self._drag_start = None
        self._drag_item_origin = None
        self._drag_pts_origin = None
        if self._space_pan:
            self._pan_start = None

    def _on_rclick(self, e):
        self._try_select(e.x, e.y)
        if self.selected_id:
            menu = tk.Menu(self, tearoff=0,
                           bg=COLORS.get("surface", "#2a2a3e"),
                           fg=COLORS.get("text", "#e0e0e0"),
                           activebackground=COLORS.get("primary", "#7c4dff"),
                           activeforeground="#ffffff")
            menu.add_command(label="Editar", command=lambda: self._edit_item(self.selected_id))
            menu.add_separator()
            menu.add_command(label="Deletar", command=lambda: self._remove(self.selected_id))
            try:
                menu.tk_popup(e.x_root, e.y_root)
            finally:
                menu.grab_release()

    def _on_delete_key(self, e):
        if self.selected_id:
            self._remove(self.selected_id)

    # ── Selection ────────────────────────────────────────────────────────────

    def _try_select(self, sx: int, sy: int):
        nearest = self.find_overlapping(sx - 8, sy - 8, sx + 8, sy + 8)
        for cid in reversed(nearest):
            if cid in self._cid_to_iid:
                iid = self._cid_to_iid[cid]
                self.selected_id = iid
                item = self._get(iid)
                if item and item["type"] in ("region", "border"):
                    self._drag_pts_origin = [tuple(p) for p in item["points"]]
                if self.on_select:
                    self.on_select(item)
                self._redraw()
                return
        self.selected_id = None
        if self.on_select:
            self.on_select(None)
        self._redraw()

    # ── Drawing helpers ──────────────────────────────────────────────────────

    def _update_preview(self, sx: int, sy: int):
        for cid in self._preview_cids:
            self.delete(cid)
        self._preview_cids.clear()

        if not self._draw_pts:
            return

        screen_pts = [self.w2s(wx, wy) for wx, wy in self._draw_pts]
        screen_pts.append((sx, sy))
        flat = [c for pt in screen_pts for c in pt]

        if self.tool == "region" and len(screen_pts) >= 2:
            # fill="" pois tkinter nao suporta alpha em cores hex
            cid = self.create_polygon(
                flat, fill="",
                outline=self.line_color, width=2, dash=(5, 3))
            self._preview_cids.append(cid)
        elif self.tool == "border" and len(screen_pts) >= 2:
            cid = self.create_line(flat, fill=self.line_color, width=2, dash=(5, 3))
            self._preview_cids.append(cid)

        for px, py in screen_pts[:-1]:
            cid = self.create_oval(px - 4, py - 4, px + 4, py + 4,
                                   fill=self.line_color, outline="white")
            self._preview_cids.append(cid)

    def _finish_draw(self):
        pts = list(self._draw_pts)
        self._cancel_draw()

        if self.tool == "region" and len(pts) >= 3:
            name = simpledialog.askstring("Regiao", "Nome da regiao (opcional):", parent=self)
            self._add({
                "id": str(uuid.uuid4()), "type": "region",
                "points": [list(p) for p in pts],
                "fill": self.fill_color, "outline": self.line_color,
                "outline_width": 2, "name": name or "",
                "text_color": self.text_color,
            })
        elif self.tool == "border" and len(pts) >= 2:
            self._add({
                "id": str(uuid.uuid4()), "type": "border",
                "points": [list(p) for p in pts],
                "color": self.line_color, "width": 2, "dashed": False,
            })

    def _cancel_draw(self):
        self._draw_pts.clear()
        for cid in self._preview_cids:
            self.delete(cid)
        self._preview_cids.clear()

    # ── Item CRUD ────────────────────────────────────────────────────────────

    def _add(self, item: dict):
        self.items_data.append(item)
        self.selected_id = item["id"]
        self._redraw()
        if self.on_change:
            self.on_change()

    def _remove(self, iid: str):
        self.items_data = [i for i in self.items_data if i["id"] != iid]
        if self.selected_id == iid:
            self.selected_id = None
        self._redraw()
        if self.on_change:
            self.on_change()

    def _get(self, iid: str):
        for item in self.items_data:
            if item["id"] == iid:
                return item
        return None

    def _edit_item(self, iid: str):
        item = self._get(iid)
        if not item:
            return
        dlg = _EditDialog(self, item)
        if dlg.result:
            item.update(dlg.result)
            self._redraw()
            if self.on_change:
                self.on_change()

    # ── Load / Get data ──────────────────────────────────────────────────────

    def load(self, items: list, bg: str, grid_type: str, grid_size: int):
        self.items_data = copy.deepcopy(items)
        self.map_bg = bg
        self.grid_type = grid_type
        self.grid_size = grid_size
        self.selected_id = None
        self._cancel_draw()
        self._redraw()

    def get_snapshot(self) -> list:
        return copy.deepcopy(self.items_data)

    def mouse_world_pos(self, sx: int, sy: int):
        return self.s2w(sx, sy)


# ─── Painel Principal ────────────────────────────────────────────────────────

class MapPanel(ttk.Frame):
    """Painel completo do criador de mapas com sessoes, snapshots e ferramentas."""

    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        self._mgr = MapSessionManager()
        self._map_data: dict = None
        self._map_name: str = ""
        self._save_pending = False
        self._build()
        self._refresh_maps()

    # ── Build UI ─────────────────────────────────────────────────────────────

    def _build(self):
        # ── Session bar ──────────────────────────────────────────────────────
        top = ttk.Frame(self)
        top.pack(fill="x", padx=6, pady=(6, 0))

        ttk.Label(top, text="Mapa:").pack(side="left", padx=(0, 3))
        self._map_var = tk.StringVar()
        self._map_combo = ttk.Combobox(top, textvariable=self._map_var,
                                       state="readonly", width=20)
        self._map_combo.pack(side="left", padx=2)
        self._map_combo.bind("<<ComboboxSelected>>", self._on_map_selected)

        ttk.Button(top, text="+ Novo",   command=self._new_map).pack(side="left", padx=2)
        ttk.Button(top, text="Excluir",  command=self._del_map,
                   style="Danger.TButton").pack(side="left", padx=2)

        ttk.Separator(top, orient="vertical").pack(side="left", fill="y", padx=8, pady=2)

        ttk.Label(top, text="Snapshot:").pack(side="left", padx=(0, 3))
        self._snap_var = tk.StringVar()
        self._snap_combo = ttk.Combobox(top, textvariable=self._snap_var,
                                        state="readonly", width=18)
        self._snap_combo.pack(side="left", padx=2)

        ttk.Button(top, text="Salvar",    command=self._save_snap).pack(side="left", padx=2)
        ttk.Button(top, text="Restaurar", command=self._restore_snap).pack(side="left", padx=2)
        ttk.Button(top, text="Del.",      command=self._del_snap).pack(side="left", padx=2)

        ttk.Button(top, text="Exportar PNG", command=self._export_png,
                   style="Accent.TButton").pack(side="right", padx=5)

        # ── Tool bar ─────────────────────────────────────────────────────────
        tb = ttk.Frame(self)
        tb.pack(fill="x", padx=6, pady=2)

        self._tool_var = tk.StringVar(value="select")
        for tid, lbl in [
            ("select", "↖ Selecionar"),
            ("region", "⬟ Regiao"),
            ("border", "— Fronteira"),
            ("label",  "T Texto"),
            ("icon",   "★ Icone"),
            ("token",  "● Token"),
        ]:
            ttk.Radiobutton(tb, text=lbl, value=tid, variable=self._tool_var,
                            command=lambda t=tid: self._set_tool(t)).pack(side="left", padx=3)

        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=8, pady=2)
        ttk.Button(tb, text="+ Zoom",  width=7,  command=lambda: self._cv.zoom_in()).pack(side="left", padx=1)
        ttk.Button(tb, text="- Zoom",  width=7,  command=lambda: self._cv.zoom_out()).pack(side="left", padx=1)
        ttk.Button(tb, text="Reset",   width=5,  command=lambda: self._cv.zoom_reset()).pack(side="left", padx=1)
        ttk.Button(tb, text="Cancelar Desenho", command=lambda: self._cv._cancel_draw()).pack(side="left", padx=10)
        ttk.Button(tb, text="Concluir Desenho", command=lambda: self._cv._finish_draw()).pack(side="left", padx=1)

        # ── Main area ────────────────────────────────────────────────────────
        main = ttk.Frame(self)
        main.pack(fill="both", expand=True, padx=6, pady=4)

        # Left sidebar
        sidebar = ttk.Frame(main, width=165)
        sidebar.pack(side="left", fill="y", padx=(0, 5))
        sidebar.pack_propagate(False)
        self._build_sidebar(sidebar)

        # Canvas + status
        cv_frame = ttk.Frame(main)
        cv_frame.pack(side="left", fill="both", expand=True)

        self._cv = MapCanvas(cv_frame)
        self._cv.pack(fill="both", expand=True)
        self._cv.on_change = self._on_canvas_change
        self._cv.on_select = self._on_item_select

        # Status bar
        self._status_var = tk.StringVar(value="Crie ou selecione um mapa para comecar.")
        ttk.Label(cv_frame, textvariable=self._status_var,
                  foreground=COLORS.get("text_muted", "gray"),
                  font=("Segoe UI", 8)).pack(anchor="w", padx=4, pady=(1, 0))

        self._cv.bind("<Motion>", self._on_cv_motion, add=True)

        # Placeholder
        self._placeholder = ttk.Label(
            cv_frame, text="Crie ou selecione um mapa para comecar.",
            foreground=COLORS.get("text_muted", "gray"),
            font=("Segoe UI", 13))

        self._update_canvas_state()

    def _build_sidebar(self, parent):
        # ── Icon palette ──────────────────────────────────────────────────────
        ttk.Label(parent, text="Icones", font=("Segoe UI", 8, "bold")).pack(anchor="w", pady=(4, 1))

        ig = ttk.Frame(parent)
        ig.pack(fill="x")
        self._icon_btns: dict = {}

        for idx, (name, sym) in enumerate(TERRAIN_ICONS):
            col = idx % 5
            row = idx // 5
            btn = tk.Button(
                ig, text=sym, font=("Consolas", 9, "bold"), width=3, height=1,
                relief="flat", cursor="hand2",
                bg=COLORS.get("surface", "#2a2a3e"),
                fg=COLORS.get("text", "#e0e0e0"),
                activebackground=COLORS.get("primary", "#7c4dff"),
                command=lambda s=sym, n=name: self._select_icon(s, n),
            )
            btn.grid(in_=ig, row=row, column=col, padx=1, pady=1, sticky="nsew")
            btn.bind("<Enter>", lambda e, n=name: self._status_var.set(f"Icone: {n}"))
            self._icon_btns[sym] = btn

        ttk.Separator(parent, orient="horizontal").pack(fill="x", pady=5)

        # ── Colors ────────────────────────────────────────────────────────────
        ttk.Label(parent, text="Cores", font=("Segoe UI", 8, "bold")).pack(anchor="w", pady=(0, 2))

        for attr, label, default in [
            ("fill_color",  "Preenchimento", _DFILL),
            ("line_color",  "Linha/Borda",   _DLINE),
            ("text_color",  "Texto/Icone",   _DTEXT),
            ("token_color", "Token",         _DTOKEN),
        ]:
            row = ttk.Frame(parent)
            row.pack(fill="x", pady=1)
            ttk.Label(row, text=label, width=13, font=("Segoe UI", 8)).pack(side="left")
            btn = tk.Button(
                row, bg=default, width=3, relief="flat", cursor="hand2",
                command=lambda a=attr: self._pick_color(a),
            )
            btn.pack(side="left")
            setattr(self, f"_cbtn_{attr}", btn)

        # Background
        row = ttk.Frame(parent)
        row.pack(fill="x", pady=1)
        ttk.Label(row, text="Fundo", width=13, font=("Segoe UI", 8)).pack(side="left")
        self._bg_btn = tk.Button(row, bg="#2d4a1e", width=3, relief="flat",
                                 cursor="hand2", command=self._pick_bg)
        self._bg_btn.pack(side="left")

        ttk.Separator(parent, orient="horizontal").pack(fill="x", pady=5)

        # ── Grid ──────────────────────────────────────────────────────────────
        ttk.Label(parent, text="Grade", font=("Segoe UI", 8, "bold")).pack(anchor="w", pady=(0, 2))

        self._grid_var = tk.StringVar(value="none")
        for val, lbl in [("none", "Nenhuma"), ("square", "Quadrada"), ("hex", "Hexagonal")]:
            ttk.Radiobutton(parent, text=lbl, value=val, variable=self._grid_var,
                            command=self._on_grid_change).pack(anchor="w")

        gs_row = ttk.Frame(parent)
        gs_row.pack(fill="x", pady=(4, 0))
        ttk.Label(gs_row, text="Tamanho:", font=("Segoe UI", 8)).pack(side="left")
        self._grid_size_var = tk.IntVar(value=50)
        ttk.Spinbox(gs_row, textvariable=self._grid_size_var,
                    from_=10, to=300, width=6,
                    command=self._on_grid_change).pack(side="left", padx=2)

    # ── Session management ───────────────────────────────────────────────────

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
            messagebox.showwarning("Aviso", f"Ja existe um mapa com o nome '{name}'.")
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
        self._update_canvas_state()

    def _apply_map_to_canvas(self):
        if not self._map_data:
            return
        d = self._map_data
        self._cv.load(
            d.get("items", []),
            d.get("bg_color", "#2d4a1e"),
            d.get("grid_type", "none"),
            d.get("grid_size", 50),
        )
        self._grid_var.set(d.get("grid_type", "none"))
        self._grid_size_var.set(d.get("grid_size", 50))
        self._bg_btn.config(bg=d.get("bg_color", "#2d4a1e"))

    def _update_canvas_state(self):
        # Usa place para o placeholder: canvas sempre fica no pack correto
        if self._map_data:
            self._placeholder.place_forget()
        else:
            self._placeholder.place(relx=0.5, rely=0.5, anchor="center")

    # ── Snapshots ────────────────────────────────────────────────────────────

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
        # Substitui se ja existe com mesmo nome
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
                if messagebox.askyesno("Restaurar", f"Restaurar snapshot '{name}'?\nAlteracoes nao salvas serao perdidas."):
                    self._map_data["items"] = copy.deepcopy(s["items"])
                    self._cv.load(
                        self._map_data["items"],
                        self._map_data.get("bg_color", "#2d4a1e"),
                        self._map_data.get("grid_type", "none"),
                        self._map_data.get("grid_size", 50),
                    )
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
            self._status_var.set(
                f"Selecionado: [{item['type']}]  "
                + (f"'{item.get('name') or item.get('text') or item.get('label') or item.get('symbol', '')}'"
                   if item['type'] in ('region', 'label', 'token', 'icon') else "")
                + "  |  Duplo-clique para editar  |  Del para remover"
            )
        else:
            self._status_var.set("Clique para selecionar. Clique com botao direito para opcoes.")

    def _on_cv_motion(self, e):
        wx, wy = self._cv.s2w(e.x, e.y)
        tool = self._tool_var.get()
        pts = len(self._cv._draw_pts)
        hint = ""
        if tool in ("region", "border") and pts > 0:
            hint = f"  |  {pts} ponto(s) — Enter/Duplo-clique para concluir, Esc para cancelar"
        self._status_var.set(f"x={wx:.0f}  y={wy:.0f}  |  Zoom: {self._cv.zoom:.2f}x{hint}")

    # ── Tools & Colors ────────────────────────────────────────────────────────

    def _set_tool(self, tool: str):
        self._cv.tool = tool
        self._cv._cancel_draw()
        self._cv.config(cursor="crosshair" if tool != "select" else "arrow")

    def _select_icon(self, sym: str, name: str):
        self._cv.active_icon = sym
        self._tool_var.set("icon")
        self._cv.tool = "icon"
        self._status_var.set(f"Icone selecionado: {name} ({sym})")
        for s, btn in self._icon_btns.items():
            btn.config(relief="sunken" if s == sym else "flat",
                       bg=COLORS.get("primary", "#7c4dff") if s == sym
                          else COLORS.get("surface", "#2a2a3e"))

    def _pick_color(self, attr: str):
        current = getattr(self._cv, attr, "#ffffff")
        res = colorchooser.askcolor(color=current, parent=self, title=f"Cor: {attr}")
        if res[1]:
            setattr(self._cv, attr, res[1])
            btn = getattr(self, f"_cbtn_{attr}", None)
            if btn:
                btn.config(bg=res[1])

    def _pick_bg(self):
        res = colorchooser.askcolor(
            color=self._cv.map_bg, parent=self, title="Cor de fundo do mapa")
        if res[1]:
            self._cv.map_bg = res[1]
            self._bg_btn.config(bg=res[1])
            if self._map_data:
                self._map_data["bg_color"] = res[1]
            self._cv._redraw()
            self._autosave()

    def _on_grid_change(self):
        gt = self._grid_var.get()
        gs = self._grid_size_var.get()
        self._cv.grid_type = gt
        self._cv.grid_size = gs
        if self._map_data:
            self._map_data["grid_type"] = gt
            self._map_data["grid_size"] = gs
        self._cv._redraw()
        self._autosave()

    # ── Export PNG ────────────────────────────────────────────────────────────

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
