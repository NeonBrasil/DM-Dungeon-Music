"""
DM - Dungeon Music
BattleMap — mapa de batalha interativo para D&D/RPG.

Funcionalidades:
- Fundos múltiplos (bloqueáveis pelo mestre)
- Tokens/imagens arrastáveis sobre os fundos
- Rolar dados com animação de suspense
- Histórico de rolagens da sessão
- Sincronização via rede para jogadores
"""

import os
import random
import datetime
import tkinter as tk
from tkinter import ttk, filedialog
from PIL import Image, ImageTk

from src.ui.canvas_window import _draw_dice_overlay

_DICE = ["D3", "D4", "D6", "D8", "D10", "D20", "D100"]
_BG_Z_BASE = -10000  # backgrounds usam z-orders muito negativos


# ──────────────────────────────────────────────────────────────────────────────
# Modelo de imagem
# ──────────────────────────────────────────────────────────────────────────────

class BattleMapImage:
    """Imagem posicionada no battlemap (fundo bloqueável ou token livre)."""

    def __init__(self, file_path: str, pil_image: Image.Image,
                 x: float, y: float, scale: float = 1.0,
                 z_order: int = 0, is_background: bool = False,
                 locked: bool = False):
        self.file_path = file_path
        self.name = os.path.basename(file_path)
        self.original_pil = pil_image.copy()
        self.x = x
        self.y = y
        self.scale = scale
        self.z_order = z_order
        self.is_background = is_background
        self.locked = locked
        self.selected = False
        self._cached_scale: float = 0.0
        self._cached_photo: ImageTk.PhotoImage | None = None
        self._cached_w: int = 0
        self._cached_h: int = 0

    def get_photo(self, final_scale: float) -> ImageTk.PhotoImage:
        if self._cached_photo and abs(self._cached_scale - final_scale) < 0.001:
            return self._cached_photo
        w = max(1, int(self.original_pil.width * final_scale))
        h = max(1, int(self.original_pil.height * final_scale))
        resized = self.original_pil.resize((w, h), Image.Resampling.BILINEAR)
        self._cached_photo = ImageTk.PhotoImage(resized)
        self._cached_scale = final_scale
        self._cached_w = w
        self._cached_h = h
        return self._cached_photo

    def invalidate_cache(self):
        self._cached_scale = 0.0
        self._cached_photo = None


# ──────────────────────────────────────────────────────────────────────────────
# BattleMapPanel principal
# ──────────────────────────────────────────────────────────────────────────────

class BattleMapPanel(ttk.Frame):
    """
    Painel completo de BattleMap:
    - Toolbar (fundos, tokens, zoom)
    - Canvas interativo (drag, zoom, pan)
    - Histórico de rolagens (lateral direita)
    - Barra de dados com animação (rodapé)
    """

    BG_COLOR = "#0d0d1a"
    SEL_COLOR = "#7c3aed"
    TEXT_COLOR = "#e0e0e0"

    def __init__(self, parent):
        super().__init__(parent)
        self._images: list[BattleMapImage] = []   # todos (fundos + tokens)
        self._selected: BattleMapImage | None = None
        self._zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0
        self._drag = {"active": False, "x": 0, "y": 0, "img": None}
        self._pan_data = {"active": False, "x": 0, "y": 0}
        self._z_counter = 0
        self._network_manager = None
        self._roll_history: list[str] = []  # para serializar junto com o estado
        self._rolling = False
        self._build()
        self._bind_events()

    # ── Build ────────────────────────────────────────────────────────────────

    def _build(self):
        # ── Toolbar ──────────────────────────────────────────────────────────
        tb = ttk.Frame(self)
        tb.pack(fill="x", padx=4, pady=(4, 0))

        # Seção Fundos
        bg_section = ttk.LabelFrame(tb, text="Fundos", padding=(6, 3))
        bg_section.pack(side="left", padx=(0, 8))
        ttk.Button(bg_section, text="+ Fundo", width=8,
                   command=self._add_background).pack(side="left", padx=2)
        self._lock_btn = ttk.Button(bg_section, text="🔒 Travar", width=10,
                                    command=self._toggle_lock, state="disabled")
        self._lock_btn.pack(side="left", padx=2)
        self._remove_bg_btn = ttk.Button(bg_section, text="✕", width=3,
                                         command=self._remove_selected, state="disabled")
        self._remove_bg_btn.pack(side="left", padx=2)

        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=6)

        # Seção Tokens
        tok_section = ttk.LabelFrame(tb, text="Tokens", padding=(6, 3))
        tok_section.pack(side="left", padx=(0, 8))
        ttk.Button(tok_section, text="+ Token", width=8,
                   command=self._add_token).pack(side="left", padx=2)

        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=6)

        # Zoom
        zoom_section = ttk.LabelFrame(tb, text="Zoom", padding=(6, 3))
        zoom_section.pack(side="left", padx=(0, 8))
        ttk.Button(zoom_section, text="+", width=2,
                   command=lambda: self._apply_zoom(1.2)).pack(side="left", padx=1)
        ttk.Button(zoom_section, text="−", width=2,
                   command=lambda: self._apply_zoom(0.8)).pack(side="left", padx=1)
        ttk.Button(zoom_section, text="Reset", width=5,
                   command=self._zoom_reset).pack(side="left", padx=1)
        self._zoom_label = ttk.Label(zoom_section, text="100%", width=5)
        self._zoom_label.pack(side="left", padx=2)

        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=6)
        ttk.Button(tb, text="Centro", command=self._center_view).pack(side="left", padx=2)

        # Info da seleção
        self._info_label = ttk.Label(tb, text="", foreground="gray")
        self._info_label.pack(side="right", padx=8)

        # ── Área central: canvas + histórico ─────────────────────────────────
        center = ttk.Frame(self)
        center.pack(fill="both", expand=True, padx=4, pady=4)
        center.columnconfigure(0, weight=1)
        center.rowconfigure(0, weight=1)

        self.canvas = tk.Canvas(center, bg=self.BG_COLOR, highlightthickness=0)
        self.canvas.grid(row=0, column=0, sticky="nsew")

        self._default_text = self.canvas.create_text(
            640, 360,
            text="⚔️  BattleMap\n\nAdicione um fundo para começar",
            fill="#3a3a5a", font=("Segoe UI", 20, "bold"), justify="center"
        )

        # Painel de histórico
        hist_frame = ttk.LabelFrame(center, text="📜 Histórico de Dados", padding=6)
        hist_frame.grid(row=0, column=1, sticky="nsew", padx=(4, 0))
        center.columnconfigure(1, minsize=210, weight=0)

        self._history_text = tk.Text(
            hist_frame, width=24, state="disabled", wrap="word",
            bg="#0f0f1e", fg="#c0c0d0", font=("Consolas", 10),
            relief="flat", highlightthickness=0
        )
        hist_scroll = ttk.Scrollbar(hist_frame, command=self._history_text.yview)
        self._history_text.configure(yscrollcommand=hist_scroll.set)
        self._history_text.pack(side="left", fill="both", expand=True)
        hist_scroll.pack(side="right", fill="y")

        ttk.Button(hist_frame, text="Limpar", command=self._clear_history).pack(
            side="bottom", fill="x", pady=(4, 0)
        )

        # ── Barra de dados (rodapé) ───────────────────────────────────────────
        dice_frame = ttk.Frame(self)
        dice_frame.pack(fill="x", padx=4, pady=(0, 4))

        self._selected_die = tk.StringVar(value="D20")
        self._modifier = tk.IntVar(value=0)
        self._die_buttons: dict[str, ttk.Button] = {}

        # Botões de dado
        dice_left = ttk.Frame(dice_frame)
        dice_left.pack(side="left")
        for die in _DICE:
            btn = ttk.Button(dice_left, text=die, width=4,
                             command=lambda d=die: self._select_die(d))
            btn.pack(side="left", padx=1)
            self._die_buttons[die] = btn

        ttk.Separator(dice_frame, orient="vertical").pack(side="left", fill="y", padx=6)
        ttk.Label(dice_frame, text="Mod:").pack(side="left", padx=(2, 1))
        ttk.Spinbox(dice_frame, from_=-20, to=20,
                    textvariable=self._modifier, width=4).pack(side="left", padx=1)

        ttk.Separator(dice_frame, orient="vertical").pack(side="left", fill="y", padx=6)

        self._roll_btn = ttk.Button(dice_frame, text="⚄  ROLAR",
                                    command=self._start_roll)
        self._roll_btn.pack(side="left", padx=4)

        ttk.Separator(dice_frame, orient="vertical").pack(side="left", fill="y", padx=8)

        # Display animado do resultado (número grande)
        self._anim_label = ttk.Label(
            dice_frame, text="—",
            font=("Segoe UI", 36, "bold"), foreground="#ffd700", width=5,
            anchor="center"
        )
        self._anim_label.pack(side="left", padx=(4, 2))

        self._detail_label = ttk.Label(
            dice_frame, text="", foreground="#a78bfa",
            font=("Segoe UI", 11)
        )
        self._detail_label.pack(side="left", padx=4)

        self._select_die("D20")

    # ── Bind de eventos ──────────────────────────────────────────────────────

    def _bind_events(self):
        self.canvas.bind("<ButtonPress-1>", self._on_left_press)
        self.canvas.bind("<B1-Motion>", self._on_left_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_left_release)
        self.canvas.bind("<ButtonPress-3>", self._on_right_press)
        self.canvas.bind("<B3-Motion>", self._on_right_drag)
        self.canvas.bind("<ButtonRelease-3>", self._on_right_release)
        self.canvas.bind("<MouseWheel>", self._on_scroll)
        self.canvas.bind("<Button-4>", lambda e: self._apply_zoom(1.1, e.x, e.y))
        self.canvas.bind("<Button-5>", lambda e: self._apply_zoom(0.9, e.x, e.y))
        self.canvas.bind("<Configure>", self._on_resize)
        top = self.winfo_toplevel()
        top.bind("<Delete>", self._on_delete_key)
        top.bind("<Escape>", lambda e: self._deselect())

    # ── Coordenadas ──────────────────────────────────────────────────────────

    def _w2s(self, wx, wy):
        return (wx + self._pan_x) * self._zoom, (wy + self._pan_y) * self._zoom

    def _s2w(self, sx, sy):
        return sx / self._zoom - self._pan_x, sy / self._zoom - self._pan_y

    # ── Zoom & Pan ───────────────────────────────────────────────────────────

    def _apply_zoom(self, factor, cx=None, cy=None):
        old = self._zoom
        self._zoom = max(0.05, min(8.0, self._zoom * factor))
        if cx is not None and cy is not None:
            wx = cx / old - self._pan_x
            wy = cy / old - self._pan_y
            self._pan_x = cx / self._zoom - wx
            self._pan_y = cy / self._zoom - wy
        self._zoom_label.config(text=f"{int(self._zoom * 100)}%")
        self._redraw()

    def _zoom_reset(self):
        self._zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0
        self._zoom_label.config(text="100%")
        self._redraw()

    def _center_view(self):
        if not self._images:
            return
        cx = sum(i.x for i in self._images) / len(self._images)
        cy = sum(i.y for i in self._images) / len(self._images)
        cw = self.canvas.winfo_width() or 800
        ch = self.canvas.winfo_height() or 600
        self._pan_x = cw / (2 * self._zoom) - cx
        self._pan_y = ch / (2 * self._zoom) - cy
        self._redraw()

    # ── Eventos de mouse ─────────────────────────────────────────────────────

    def _on_left_press(self, event):
        img = self._find_at(event.x, event.y)
        if img:
            self._select(img)
            if not img.locked:
                self._drag = {"active": True, "x": event.x, "y": event.y, "img": img}
                self.canvas.config(cursor="fleur")
        else:
            self._deselect()

    def _on_left_drag(self, event):
        if self._drag["active"] and self._drag["img"]:
            dx = event.x - self._drag["x"]
            dy = event.y - self._drag["y"]
            img = self._drag["img"]
            img.x += dx / self._zoom
            img.y += dy / self._zoom
            self._drag["x"] = event.x
            self._drag["y"] = event.y
            self.canvas.move(f"bmi{id(img)}", dx, dy)

    def _on_left_release(self, event):
        self._drag = {"active": False, "x": 0, "y": 0, "img": None}
        self.canvas.config(cursor="arrow")
        self._broadcast_state()

    def _on_right_press(self, event):
        self._pan_data = {"active": True, "x": event.x, "y": event.y}
        self.canvas.config(cursor="hand2")

    def _on_right_drag(self, event):
        if self._pan_data["active"]:
            dx = event.x - self._pan_data["x"]
            dy = event.y - self._pan_data["y"]
            self._pan_x += dx / self._zoom
            self._pan_y += dy / self._zoom
            self._pan_data["x"] = event.x
            self._pan_data["y"] = event.y
            self.canvas.move("all", dx, dy)

    def _on_right_release(self, event):
        self._pan_data = {"active": False, "x": 0, "y": 0}
        self.canvas.config(cursor="arrow")

    def _on_scroll(self, event):
        factor = 1.1 if event.delta > 0 else 0.9
        self._apply_zoom(factor, event.x, event.y)

    def _on_delete_key(self, event):
        if self._selected and not self._selected.is_background:
            self._images.remove(self._selected)
            self._selected = None
            self._info_label.config(text="")
            self._redraw()
            self._broadcast_state()

    def _on_resize(self, event):
        if self._default_text:
            try:
                self.canvas.coords(self._default_text,
                                   event.width // 2, event.height // 2)
            except tk.TclError:
                pass

    # ── Seleção ──────────────────────────────────────────────────────────────

    def _select(self, img: BattleMapImage):
        if self._selected:
            self._selected.selected = False
        img.selected = True
        self._selected = img
        self._update_toolbar_for_selection()
        self._redraw()

    def _deselect(self):
        if self._selected:
            self._selected.selected = False
            self._selected = None
        self._info_label.config(text="")
        self._lock_btn.config(state="disabled")
        self._remove_bg_btn.config(state="disabled")
        self._redraw()

    def _update_toolbar_for_selection(self):
        img = self._selected
        if img is None:
            self._info_label.config(text="")
            self._lock_btn.config(state="disabled")
            self._remove_bg_btn.config(state="disabled")
            return
        kind = "🖼 Fundo" if img.is_background else "🎭 Token"
        lock_icon = "🔒 Travar" if not img.locked else "🔓 Destravar"
        self._info_label.config(text=f"{kind}: {img.name}  |  Escala: {int(img.scale*100)}%")
        self._lock_btn.config(text=lock_icon, state="normal")
        self._remove_bg_btn.config(state="normal")

    # ── Hit testing ──────────────────────────────────────────────────────────

    def _find_at(self, sx, sy) -> BattleMapImage | None:
        for img in reversed(sorted(self._images, key=lambda i: i.z_order)):
            ix, iy = self._w2s(img.x, img.y)
            w = img._cached_w or img.original_pil.width * img.scale * self._zoom
            h = img._cached_h or img.original_pil.height * img.scale * self._zoom
            if (ix - w/2 <= sx <= ix + w/2 and iy - h/2 <= sy <= iy + h/2):
                return img
        return None

    # ── Renderização ─────────────────────────────────────────────────────────

    def _redraw(self):
        self.canvas.delete("bmi")
        if self._default_text:
            try:
                self.canvas.delete(self._default_text)
            except tk.TclError:
                pass
            self._default_text = None

        if not self._images:
            w = self.canvas.winfo_width() or 800
            h = self.canvas.winfo_height() or 600
            self._default_text = self.canvas.create_text(
                w // 2, h // 2,
                text="⚔️  BattleMap\n\nAdicione um fundo para começar",
                fill="#3a3a5a", font=("Segoe UI", 20, "bold"), justify="center",
                tags="bmi"
            )
            return

        for img in sorted(self._images, key=lambda i: i.z_order):
            self._render_img(img)

    def _render_img(self, img: BattleMapImage):
        try:
            final_scale = img.scale * self._zoom
            photo = img.get_photo(final_scale)
            tag = f"bmi{id(img)}"
            sx, sy = self._w2s(img.x, img.y)
            self.canvas.create_image(sx, sy, image=photo, anchor="center",
                                     tags=("bmi", tag))
            if img.selected:
                hw, hh = img._cached_w / 2, img._cached_h / 2
                color = "#ffd700" if img.is_background else self.SEL_COLOR
                self.canvas.create_rectangle(
                    sx - hw - 3, sy - hh - 3,
                    sx + hw + 3, sy + hh + 3,
                    outline=color, width=2, dash=(6, 4), tags=("bmi", tag)
                )
                # Ícone de cadeado se bloqueado
                if img.locked:
                    self.canvas.create_text(
                        sx + hw - 5, sy - hh + 5,
                        text="🔒", font=("Segoe UI", 12), anchor="ne",
                        tags=("bmi", tag)
                    )
        except Exception as exc:
            print(f"[BattleMap] Erro ao renderizar {img.name}: {exc}")

    # ── Gerência de imagens ───────────────────────────────────────────────────

    def _add_background(self):
        paths = filedialog.askopenfilenames(
            title="Selecionar Fundo(s)",
            filetypes=[("Imagens", "*.png *.jpg *.jpeg *.webp *.bmp *.gif"), ("Todos", "*.*")]
        )
        if not paths:
            return
        cw = self.canvas.winfo_width() or 800
        ch = self.canvas.winfo_height() or 600
        for path in paths:
            try:
                pil = Image.open(path)
                # Auto-escala para preencher o canvas
                ratio = min(cw / pil.width, ch / pil.height)
                scale = ratio / self._zoom
                bg_z = _BG_Z_BASE - len([i for i in self._images if i.is_background]) * 100
                img = BattleMapImage(
                    file_path=path, pil_image=pil,
                    x=cw / (2 * self._zoom) - self._pan_x,
                    y=ch / (2 * self._zoom) - self._pan_y,
                    scale=scale, z_order=bg_z,
                    is_background=True, locked=True
                )
                self._images.append(img)
            except Exception as exc:
                print(f"[BattleMap] Erro ao carregar fundo {path}: {exc}")
        self._redraw()
        self._broadcast_state()

    def _add_token(self):
        paths = filedialog.askopenfilenames(
            title="Selecionar Token(s)",
            filetypes=[("Imagens", "*.png *.jpg *.jpeg *.webp *.bmp *.gif"), ("Todos", "*.*")]
        )
        if not paths:
            return
        cw = self.canvas.winfo_width() or 800
        ch = self.canvas.winfo_height() or 600
        cx = cw / (2 * self._zoom) - self._pan_x
        cy = ch / (2 * self._zoom) - self._pan_y
        for i, path in enumerate(paths):
            try:
                pil = Image.open(path)
                # Tokens: tamanho razoável (max 120px na maior dimensão)
                max_dim = 120 / self._zoom
                scale = min(max_dim / pil.width, max_dim / pil.height, 1.0)
                self._z_counter += 1
                img = BattleMapImage(
                    file_path=path, pil_image=pil,
                    x=cx + i * 30, y=cy + i * 30,
                    scale=scale, z_order=self._z_counter,
                    is_background=False, locked=False
                )
                self._images.append(img)
            except Exception as exc:
                print(f"[BattleMap] Erro ao carregar token {path}: {exc}")
        self._redraw()
        self._broadcast_state()

    def _toggle_lock(self):
        if self._selected is None:
            return
        self._selected.locked = not self._selected.locked
        self._update_toolbar_for_selection()
        self._redraw()

    def _remove_selected(self):
        if self._selected is None:
            return
        self._images.remove(self._selected)
        self._selected = None
        self._info_label.config(text="")
        self._lock_btn.config(state="disabled")
        self._remove_bg_btn.config(state="disabled")
        self._redraw()
        self._broadcast_state()

    # ── Dados animados ────────────────────────────────────────────────────────

    def _select_die(self, die: str):
        self._selected_die.set(die)
        for d, btn in self._die_buttons.items():
            btn.configure(style="Accent.TButton" if d == die else "TButton")

    def _start_roll(self):
        if self._rolling:
            return
        die = self._selected_die.get()
        mod = self._modifier.get()
        sides = int(die[1:])
        rolled = random.randint(1, sides)
        total = rolled + mod
        self._rolling = True
        self._roll_btn.config(state="disabled")
        self._detail_label.config(text="")
        self._anim_label.config(text="?", foreground="#a78bfa")
        # Inicia animação: 22 quadros com atraso crescente
        self._animate_roll(sides, mod, rolled, total, step=0, total_steps=22)

    def _animate_roll(self, sides: int, mod: int, rolled: int, total: int,
                      step: int, total_steps: int):
        if step < total_steps:
            display = random.randint(1, sides)
            # Muda cor progressivamente de roxo → dourado
            ratio = step / total_steps
            r_comp = int(0xa7 + (0xff - 0xa7) * ratio)
            g_comp = int(0x8b + (0xd7 - 0x8b) * ratio)
            b_comp = int(0xfa - 0xfa * ratio)
            color = f"#{r_comp:02x}{g_comp:02x}{b_comp:02x}"
            self._anim_label.config(text=str(display), foreground=color)
            # Atraso exponencial: começa rápido (30ms) e desacelera (até ~300ms)
            delay = int(30 + (step ** 1.9) * 0.38)
            self.after(delay, lambda: self._animate_roll(
                sides, mod, rolled, total, step + 1, total_steps
            ))
        else:
            # Resultado final
            self._rolling = False
            self._roll_btn.config(state="normal")
            self._anim_label.config(text=str(total), foreground="#ffd700")
            die = self._selected_die.get()
            mod_str = f"+{mod}" if mod > 0 else (str(mod) if mod < 0 else "")
            self._detail_label.config(
                text=f"{die}{mod_str}  |  rolou {rolled}",
                foreground="#a78bfa"
            )
            # Overlay no canvas
            self._show_overlay(die, mod, rolled, total)
            # Histórico
            nm = self._network_manager
            player = getattr(nm, '_local_player_id', 'mestre') if nm else 'mestre'
            self._add_to_history(die, mod, rolled, total, player)
            # Broadcast
            if nm:
                payload = {"die": die, "modifier": mod,
                           "rolled": rolled, "total": total, "player": player}
                if nm.is_hosting:
                    nm.broadcast("dice_result", payload)
                elif nm.is_client:
                    nm.send_to_host("dice_roll", payload)

    def _show_overlay(self, die: str, mod: int, rolled: int, total: int,
                      player: str = ""):
        _draw_dice_overlay(self.canvas, die, mod, rolled, total, player)
        self.after(3500, lambda: self.canvas.delete("dice_overlay"))

    def show_dice_overlay(self, die: str, mod: int, rolled: int, total: int,
                           player: str = ""):
        """API pública — chamada pela rede quando outro jogador rola."""
        self._show_overlay(die, mod, rolled, total, player)
        nm = self._network_manager
        pid = getattr(nm, '_local_player_id', '') if nm else ''
        self._add_to_history(die, mod, rolled, total, player)

    # ── Histórico ─────────────────────────────────────────────────────────────

    def _add_to_history(self, die: str, mod: int, rolled: int, total: int,
                         player: str):
        mod_str = f"+{mod}" if mod > 0 else (str(mod) if mod < 0 else "")
        ts = datetime.datetime.now().strftime("%H:%M")
        line = f"[{ts}] {player}: {die}{mod_str} = {total}  (rolou {rolled})\n"
        self._history_text.config(state="normal")
        # Coloração do resultado
        tag = "crit" if rolled == int(die[1:]) else ("fail" if rolled == 1 else "normal")
        self._history_text.tag_config("crit", foreground="#ffd700")
        self._history_text.tag_config("fail", foreground="#ef4444")
        self._history_text.tag_config("normal", foreground="#c0c0d0")
        self._history_text.insert("end", line, tag)
        self._history_text.see("end")
        self._history_text.config(state="disabled")

    def _clear_history(self):
        self._history_text.config(state="normal")
        self._history_text.delete("1.0", "end")
        self._history_text.config(state="disabled")

    # ── Rede ──────────────────────────────────────────────────────────────────

    def set_network_manager(self, nm):
        self._network_manager = nm

    def serialize_state(self) -> dict:
        return {
            "images": [
                {
                    "file_path": img.file_path,
                    "x": img.x, "y": img.y,
                    "scale": img.scale,
                    "z_order": img.z_order,
                    "is_background": img.is_background,
                    "locked": img.locked,
                }
                for img in sorted(self._images, key=lambda i: i.z_order)
            ]
        }

    def apply_state(self, state: dict):
        """Aplica estado recebido da rede (usado pelo PlayerWindow)."""
        self._images.clear()
        self._selected = None
        for item in state.get("images", []):
            fp = item.get("file_path", "")
            if not fp or not os.path.isfile(fp):
                continue
            try:
                pil = Image.open(fp)
                img = BattleMapImage(
                    file_path=fp, pil_image=pil,
                    x=item.get("x", 0), y=item.get("y", 0),
                    scale=item.get("scale", 1.0),
                    z_order=item.get("z_order", 0),
                    is_background=item.get("is_background", False),
                    locked=item.get("locked", False),
                )
                self._images.append(img)
            except Exception as exc:
                print(f"[BattleMap.apply_state] Erro: {exc}")
        self._redraw()

    def _broadcast_state(self):
        nm = self._network_manager
        if nm is None or not nm.is_hosting:
            return
        state = self.serialize_state()
        nm.broadcast("battlemap_update", state)
