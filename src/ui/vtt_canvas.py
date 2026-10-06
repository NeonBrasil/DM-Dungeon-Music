"""
VTTCanvas — tabuleiro virtual com dois layers:
  Layer 0 (z_order < 0): backgrounds/cenário (não sincronizados obrigatoriamente)
  Layer 1 (z_order >= 0): CardEntity sincronizadas via NetworkManager

Arquitetura autoritativa: apenas o Mestre (is_hosting) pode alterar estado.
Jogadores recebem diffs via eventos de rede.
"""

from __future__ import annotations

import os
import tkinter as tk
from tkinter import filedialog, simpledialog, ttk

from PIL import Image, ImageDraw, ImageTk

from src.card_entity import CardEntity
from src.card_manager import CardManager
from src.ui.theme import COLORS


# ── Constantes ──────────────────────────────────────────────────────────────

CARD_W = 90          # largura base da carta em pixels no canvas
CARD_H = 130         # altura base
BG_Z_BASE = -10000   # z_order de backgrounds


# ── Helpers de renderização ──────────────────────────────────────────────────

def _make_card_back(w: int, h: int) -> Image.Image:
    """Gera textura de verso de carta (face oculta)."""
    img = Image.new("RGBA", (w, h), "#1a1230")
    draw = ImageDraw.Draw(img)
    draw.rectangle([2, 2, w - 3, h - 3], outline="#6b21a8", width=2)
    draw.rectangle([8, 8, w - 9, h - 9], outline="#4c1d95", width=1)
    cx, cy = w // 2, h // 2
    draw.text((cx, cy), "?", fill="#7c3aed", anchor="mm")
    return img


def _make_card_face(card: CardEntity, w: int, h: int) -> Image.Image:
    """Renderiza face da carta com imagem, nome, HP e level."""
    base = Image.new("RGBA", (w, h), "#0f0a1e")
    draw = ImageDraw.Draw(base)

    # Borda
    border_color = "#a78bfa" if card.card_type == "player" else (
        "#f87171" if card.card_type == "enemy" else "#60a5fa"
    )
    draw.rectangle([0, 0, w - 1, h - 1], outline=border_color, width=2)

    # Imagem do personagem
    img_h = h - 46  # reservar espaço para nome + HP + level
    if card.image_path and os.path.isfile(card.image_path):
        try:
            char_img = Image.open(card.image_path).convert("RGBA")
            if card.is_dead():
                char_img = char_img.convert("L").convert("RGBA")
            char_img = char_img.resize((w - 4, img_h - 4), Image.Resampling.LANCZOS)
            base.paste(char_img, (2, 2), char_img)
        except Exception:
            pass
    else:
        draw.rectangle([2, 2, w - 3, img_h - 2], fill="#1e1040")

    # Nome (truncado)
    name = card.name[:12] + "…" if len(card.name) > 12 else card.name
    draw.text((w // 2, img_h + 4), name, fill="#e2e8f0", anchor="mt")

    # Barra de HP
    hp_ratio = max(0.0, card.current_hp / max(1, card.max_hp))
    bar_x, bar_y = 4, img_h + 18
    bar_w = w - 8
    draw.rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + 6], fill="#374151")
    hp_color = "#22c55e" if hp_ratio > 0.5 else ("#f59e0b" if hp_ratio > 0.25 else "#ef4444")
    if hp_ratio > 0:
        draw.rectangle([bar_x, bar_y, bar_x + int(bar_w * hp_ratio), bar_y + 6], fill=hp_color)

    # HP texto + Level
    draw.text((4, img_h + 26), f"♥ {card.current_hp}/{card.max_hp}", fill="#d1d5db")
    draw.text((w - 4, img_h + 26), f"Lv.{card.level}", fill="#fbbf24", anchor="ra")

    return base


# ── Modelo interno de objeto no canvas ──────────────────────────────────────

class _CanvasCard:
    """Wrapper de renderização de uma CardEntity no tk.Canvas."""

    def __init__(self, card: CardEntity):
        self.card = card
        self._photo: ImageTk.PhotoImage | None = None
        self._pil: Image.Image | None = None
        # IDs de itens no canvas
        self.img_id: int | None = None
        self.hp_bar_id: int | None = None
        self._dirty = True
        self._cached_w: int = 0
        self._cached_h: int = 0
        self.shake_offset_x: float = 0.0

    def invalidate(self):
        self._dirty = True

    def get_photo(self, w: int, h: int, revealed: bool) -> ImageTk.PhotoImage:
        if self._dirty or self._photo is None or w != self._cached_w or h != self._cached_h:
            if revealed or self.card.card_type != "enemy":
                pil = _make_card_face(self.card, w, h)
            else:
                pil = _make_card_back(w, h)
            self._pil = pil
            self._photo = ImageTk.PhotoImage(pil)
            self._dirty = False
            self._cached_w = w
            self._cached_h = h
        return self._photo  # type: ignore[return-value]


class _BgImage:
    """Imagem de background (layer 0)."""

    def __init__(self, file_path: str, x: float, y: float, scale: float, z_order: int):
        self.file_path = file_path
        self.x = x
        self.y = y
        self.scale = scale
        self.z_order = z_order
        self._pil_orig: Image.Image | None = None
        self._photo: ImageTk.PhotoImage | None = None
        self._cached_scale: float = -1.0
        self.img_id: int | None = None
        try:
            self._pil_orig = Image.open(file_path).convert("RGBA")
        except Exception:
            pass

    def get_photo(self, zoom: float) -> ImageTk.PhotoImage | None:
        effective = self.scale * zoom
        if effective != self._cached_scale and self._pil_orig:
            nw = max(1, int(self._pil_orig.width * effective))
            nh = max(1, int(self._pil_orig.height * effective))
            resized = self._pil_orig.resize((nw, nh), Image.Resampling.BILINEAR)
            self._photo = ImageTk.PhotoImage(resized)
            self._cached_scale = effective
        return self._photo


# ── Diálogos ─────────────────────────────────────────────────────────────────

class _InspectDialog(tk.Toplevel):
    """Janela de inspeção de carta (leitura)."""

    def __init__(self, parent, card: CardEntity, editable: bool = False):
        super().__init__(parent)
        self.title(f"Carta — {card.name}")
        self.resizable(False, False)
        self.grab_set()
        self._card = card
        self._editable = editable
        self._build()

    def _build(self):
        c = self._card
        pad = {"padx": 8, "pady": 2}

        # Imagem
        if c.image_path and os.path.isfile(c.image_path):
            try:
                pil = Image.open(c.image_path).convert("RGBA").resize((80, 110))
                self._photo = ImageTk.PhotoImage(pil)
                tk.Label(self, image=self._photo).grid(row=0, column=0, columnspan=2,
                                                        pady=8)
            except Exception:
                pass

        rows = [
            ("Nome", c.name),
            ("Level", str(c.level)),
            ("PV", f"{c.current_hp} / {c.max_hp}"),
            ("CA", str(c.armor_class)),
            ("FOR / DES / CON", f"{c.strength} / {c.dexterity} / {c.constitution}"),
            ("INT / SAB / CAR", f"{c.intelligence} / {c.wisdom} / {c.charisma}"),
            ("Sanidade", f"{c.sanity} / {c.max_sanity}"),
            ("Fé", f"{c.faith} / {c.max_faith}"),
            ("Obscur", f"{c.obscur} / {c.max_obscur}"),
        ]
        for i, (label, value) in enumerate(rows, start=1):
            ttk.Label(self, text=label + ":", foreground=COLORS.get("text_muted", "gray")
                      ).grid(row=i, column=0, sticky="e", **pad)
            ttk.Label(self, text=value).grid(row=i, column=1, sticky="w", **pad)

        # Inventário
        r = len(rows) + 1
        ttk.Label(self, text="Inventário:").grid(row=r, column=0, sticky="ne", **pad)
        inv_text = "\n".join(
            f"• {it.get('name', '?')} x{it.get('qty', 1)}" for it in c.inventory
        ) or "(vazio)"
        ttk.Label(self, text=inv_text, justify="left").grid(row=r, column=1, sticky="w", **pad)

        ttk.Button(self, text="Fechar", command=self.destroy).grid(
            row=r + 1, column=0, columnspan=2, pady=8
        )


class _AttackDialog(tk.Toplevel):
    """Dialog simples para o mestre informar o valor de dano."""

    def __init__(self, parent, attacker_name: str, target_name: str):
        super().__init__(parent)
        self.title("Aplicar Dano")
        self.resizable(False, False)
        self.grab_set()
        self.result: int | None = None
        self._build(attacker_name, target_name)

    def _build(self, attacker: str, target: str):
        ttk.Label(self, text=f"{attacker}  →  {target}", font=("Segoe UI", 11, "bold")
                  ).pack(pady=(12, 4), padx=16)
        ttk.Label(self, text="Valor do dano:").pack()
        self._var = tk.IntVar(value=0)
        ttk.Spinbox(self, from_=0, to=9999, textvariable=self._var, width=8
                    ).pack(pady=4)
        btn_frame = ttk.Frame(self)
        btn_frame.pack(pady=8)
        ttk.Button(btn_frame, text="Confirmar", command=self._confirm).pack(side="left", padx=4)
        ttk.Button(btn_frame, text="Cancelar", command=self.destroy).pack(side="left", padx=4)

    def _confirm(self):
        self.result = max(0, self._var.get())
        self.destroy()


# ── VTTCanvas ────────────────────────────────────────────────────────────────

class VTTCanvas(ttk.Frame):
    """
    Aba VTT: tabuleiro virtual com backgrounds (layer 0) e cartas (layer 1).
    O Mestre controla tudo; jogadores recebem estado via rede.
    """

    BG_COLOR = "#0a0a18"

    def __init__(self, parent, card_manager: CardManager, is_host: bool = False,
                 local_player_id: str = ""):
        super().__init__(parent)
        self._cm = card_manager
        self._is_host = is_host
        self._local_player_id = local_player_id
        self._network = None

        # Canvas state
        self._zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0
        self._pan_data: dict = {"active": False, "x": 0, "y": 0}

        # Objetos renderizados
        self._bg_images: list[_BgImage] = []
        self._cards: dict[str, _CanvasCard] = {}  # card_id → _CanvasCard
        self._photo_refs: list = []  # evitar GC

        # Seleção e modo de ataque
        self._selected_card_id: str | None = None
        self._attack_mode = False
        self._attack_source_id: str | None = None

        self._build()
        self._bind_events()

    def set_network_manager(self, nm) -> None:
        self._network = nm
        self._is_host = nm.is_hosting
        nm.add_message_listener(self._on_network_event)
        self._update_toolbar_state()

    def set_role(self, is_host: bool, player_id: str = "") -> None:
        self._is_host = is_host
        self._local_player_id = player_id
        self._update_toolbar_state()

    # ── UI ───────────────────────────────────────────────────────────────────

    def _build(self):
        # Toolbar
        tb = ttk.Frame(self)
        tb.pack(fill="x", padx=4, pady=(4, 0))

        ttk.Button(tb, text="+ Fundo", command=self._add_background).pack(side="left", padx=2)

        self._btn_blank = ttk.Button(tb, text="+ Carta Blank", command=self._add_blank_card)
        self._btn_blank.pack(side="left", padx=2)

        self._btn_npc = ttk.Button(tb, text="+ NPC/Inimigo", command=self._add_npc_card)
        self._btn_npc.pack(side="left", padx=2)

        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=4)

        self._btn_reveal = ttk.Button(tb, text="Revelar", state="disabled",
                                      command=self._reveal_selected)
        self._btn_reveal.pack(side="left", padx=2)

        self._btn_attack = ttk.Button(tb, text="Atacar", state="disabled",
                                      command=self._start_attack_mode)
        self._btn_attack.pack(side="left", padx=2)

        self._btn_hide = ttk.Button(tb, text="Ocultar", state="disabled",
                                    command=self._hide_selected)
        self._btn_hide.pack(side="left", padx=2)

        self._btn_delete = ttk.Button(tb, text="Deletar", state="disabled",
                                      command=self._delete_selected)
        self._btn_delete.pack(side="left", padx=2)

        ttk.Separator(tb, orient="vertical").pack(side="left", fill="y", padx=4)
        ttk.Button(tb, text="Zoom 100%", command=self._zoom_reset).pack(side="left", padx=2)

        self._mode_label = ttk.Label(tb, text="", foreground="#f59e0b")
        self._mode_label.pack(side="right", padx=8)

        # Canvas
        self.canvas = tk.Canvas(self, bg=self.BG_COLOR, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True, padx=4, pady=4)

        self._update_toolbar_state()

    def _bind_events(self):
        c = self.canvas
        c.bind("<ButtonPress-1>", self._on_left_press)
        c.bind("<B1-Motion>", self._on_left_drag)
        c.bind("<ButtonRelease-1>", self._on_left_release)
        c.bind("<ButtonPress-3>", self._on_right_press)
        c.bind("<B3-Motion>", self._on_right_drag)
        c.bind("<ButtonRelease-3>", self._on_right_release)
        c.bind("<MouseWheel>", self._on_scroll)
        c.bind("<Button-4>", self._on_scroll)
        c.bind("<Button-5>", self._on_scroll)
        c.bind("<Delete>", lambda _e: self._delete_selected())

    @property
    def _is_master(self) -> bool:
        """True se offline ou hospedando — permite ações autoritativas."""
        if self._network is None:
            return True
        # rede existe mas não está em nenhum papel (offline) → mestre local
        return self._is_host or (not self._network.is_hosting and not self._network.is_client)

    def _update_toolbar_state(self):
        host_state = "normal" if self._is_master else "disabled"
        for btn in (self._btn_blank, self._btn_npc):
            btn.config(state=host_state)
        has_sel = self._selected_card_id is not None
        for btn in (self._btn_reveal, self._btn_attack, self._btn_hide, self._btn_delete):
            btn.config(state="normal" if (self._is_master and has_sel) else "disabled")

    # ── Coordenadas ──────────────────────────────────────────────────────────

    def _w2s(self, wx: float, wy: float) -> tuple[float, float]:
        return (wx + self._pan_x) * self._zoom, (wy + self._pan_y) * self._zoom

    def _s2w(self, sx: float, sy: float) -> tuple[float, float]:
        return sx / self._zoom - self._pan_x, sy / self._zoom - self._pan_y

    # ── Rendering ────────────────────────────────────────────────────────────

    def _redraw(self):
        self.canvas.delete("all")
        self._photo_refs.clear()

        # Layer 0: backgrounds
        for bg in sorted(self._bg_images, key=lambda b: b.z_order):
            photo = bg.get_photo(self._zoom)
            if photo is None:
                continue
            sx, sy = self._w2s(bg.x, bg.y)
            bg.img_id = self.canvas.create_image(sx, sy, image=photo, anchor="nw",
                                                  tags="bg_item")
            self._photo_refs.append(photo)

        # Layer 1: cartas
        all_cards = sorted(self._cm.all_cards(), key=lambda c: c.z_order)
        for card in all_cards:
            # Jogador não vê cartas ocultas
            if not card.visible and not self._is_host:
                continue
            cc = self._cards.get(card.card_id)
            if cc is None:
                cc = _CanvasCard(card)
                self._cards[card.card_id] = cc

            revealed = card.revealed or card.card_type != "enemy"
            w = max(1, int(CARD_W * card.scale * self._zoom))
            h = max(1, int(CARD_H * card.scale * self._zoom))
            photo = cc.get_photo(w, h, revealed)
            self._photo_refs.append(photo)

            sx, sy = self._w2s(card.x, card.y)
            sx += cc.shake_offset_x
            tag = f"card_{card.card_id}"
            cc.img_id = self.canvas.create_image(sx, sy, image=photo, anchor="center",
                                                  tags=("card_item", tag))

            # Anel de seleção
            if card.card_id == self._selected_card_id:
                self.canvas.create_rectangle(
                    sx - w // 2 - 3, sy - h // 2 - 3,
                    sx + w // 2 + 3, sy + h // 2 + 3,
                    outline="#fbbf24", width=2, tags="selection"
                )

            # Anel de alvo em modo ataque
            if self._attack_mode and card.card_id != self._attack_source_id:
                self.canvas.create_rectangle(
                    sx - w // 2 - 2, sy - h // 2 - 2,
                    sx + w // 2 + 2, sy + h // 2 + 2,
                    outline="#ef4444", width=2, dash=(4, 2), tags="target_ring"
                )

    # ── Hit test ─────────────────────────────────────────────────────────────

    def _find_card_at(self, sx: float, sy: float) -> CardEntity | None:
        wx, wy = self._s2w(sx, sy)
        for card in reversed(sorted(self._cm.all_cards(), key=lambda c: c.z_order)):
            if not card.visible and not self._is_host:
                continue
            hw = CARD_W * card.scale / 2
            hh = CARD_H * card.scale / 2
            if card.x - hw <= wx <= card.x + hw and card.y - hh <= wy <= card.y + hh:
                return card
        return None

    # ── Mouse events ─────────────────────────────────────────────────────────

    def _on_left_press(self, event):
        card = self._find_card_at(event.x, event.y)

        if self._attack_mode and card and card.card_id != self._attack_source_id:
            self._execute_attack(card)
            return

        if card:
            self._select_card(card.card_id)
            if self._is_master:
                self._drag_data = {"card_id": card.card_id, "x": event.x, "y": event.y}
            else:
                self._drag_data = None
        else:
            self._deselect()
            self._drag_data = None

        if self._attack_mode:
            self._cancel_attack_mode()

    def _on_left_drag(self, event):
        dd = getattr(self, "_drag_data", None)
        if not dd or not self._is_master:
            return
        dx = (event.x - dd["x"]) / self._zoom
        dy = (event.y - dd["y"]) / self._zoom
        card = self._cm.get_card(dd["card_id"])
        if card:
            card.x += dx
            card.y += dy
            dd["x"] = event.x
            dd["y"] = event.y
            self._redraw()

    def _on_left_release(self, _event):
        dd = getattr(self, "_drag_data", None)
        if dd and self._is_host:
            self._broadcast_card_update(dd["card_id"])
        self._drag_data = None

    def _on_right_press(self, event):
        card = self._find_card_at(event.x, event.y)
        if card:
            self._open_inspect(card)
        else:
            self._pan_data = {"active": True, "x": event.x, "y": event.y}
            self.canvas.config(cursor="fleur")

    def _on_right_drag(self, event):
        if self._pan_data.get("active"):
            dx = event.x - self._pan_data["x"]
            dy = event.y - self._pan_data["y"]
            self._pan_x += dx / self._zoom
            self._pan_y += dy / self._zoom
            self._pan_data["x"] = event.x
            self._pan_data["y"] = event.y
            self.canvas.move("all", dx, dy)

    def _on_right_release(self, _event):
        self._pan_data = {"active": False, "x": 0, "y": 0}
        self.canvas.config(cursor="arrow")

    def _on_scroll(self, event):
        if event.num == 4 or event.delta > 0:
            factor = 1.1
        else:
            factor = 0.9
        old = self._zoom
        self._zoom = max(0.1, min(8.0, self._zoom * factor))
        wx = event.x / old - self._pan_x
        wy = event.y / old - self._pan_y
        self._pan_x = event.x / self._zoom - wx
        self._pan_y = event.y / self._zoom - wy
        self._redraw()

    def _zoom_reset(self):
        self._zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0
        self._redraw()

    # ── Seleção ──────────────────────────────────────────────────────────────

    def _select_card(self, card_id: str):
        self._selected_card_id = card_id
        self._update_toolbar_state()
        self._redraw()

    def _deselect(self):
        self._selected_card_id = None
        self._update_toolbar_state()
        self._redraw()

    # ── Inspeção (right-click) ────────────────────────────────────────────────

    def _open_inspect(self, card: CardEntity):
        if self._is_host:
            _InspectDialog(self, card)
        elif card.owner_player_id == self._local_player_id:
            _InspectDialog(self, card)
        # outros jogadores não têm acesso

    # ── Ações do Mestre ───────────────────────────────────────────────────────

    def _add_background(self):
        paths = filedialog.askopenfilenames(
            filetypes=[("Imagens", "*.png *.jpg *.jpeg *.webp *.gif *.bmp")]
        )
        for p in paths:
            z = BG_Z_BASE - len(self._bg_images) * 100
            self._bg_images.append(_BgImage(p, 0.0, 0.0, 1.0, z))
        self._redraw()

    def _add_blank_card(self):
        if not self._is_master:
            return
        name = simpledialog.askstring("Nova Carta", "Nome do personagem:", parent=self)
        if not name:
            return
        card = CardEntity(name=name, card_type="player")
        card.x = float(self.canvas.winfo_width() // 2)
        card.y = float(self.canvas.winfo_height() // 2)
        self._cm.add_card(card)
        self._broadcast_card_created(card)
        self._redraw()

    def _add_npc_card(self):
        if not self._is_master:
            return
        name = simpledialog.askstring("Novo NPC/Inimigo", "Nome:", parent=self)
        if not name:
            return
        card_type = "enemy"
        card = CardEntity(name=name, card_type=card_type, revealed=False)
        card.x = float(self.canvas.winfo_width() // 2)
        card.y = float(self.canvas.winfo_height() // 2)
        self._cm.add_card(card)
        self._broadcast_card_created(card)
        self._redraw()

    def _reveal_selected(self):
        if not self._is_master or not self._selected_card_id:
            return
        card = self._cm.get_card(self._selected_card_id)
        if not card:
            return
        card.revealed = True
        if self._network:
            self._network.broadcast("card_revealed", {"card_id": card.card_id})
        self._animate_flip(card.card_id)

    def _hide_selected(self):
        if not self._is_master or not self._selected_card_id:
            return
        card = self._cm.get_card(self._selected_card_id)
        if not card:
            return
        card.visible = False
        if self._network:
            self._network.broadcast("card_hidden", {"card_id": card.card_id})
        self._redraw()

    def _delete_selected(self):
        if not self._is_master or not self._selected_card_id:
            return
        card_id = self._selected_card_id
        self._cm.remove_card(card_id)
        self._cards.pop(card_id, None)
        self._selected_card_id = None
        if self._network:
            self._network.broadcast("card_deleted", {"card_id": card_id})
        self._update_toolbar_state()
        self._redraw()

    # ── Modo de ataque ────────────────────────────────────────────────────────

    def _start_attack_mode(self):
        if not self._is_master or not self._selected_card_id:
            return
        self._attack_mode = True
        self._attack_source_id = self._selected_card_id
        self._mode_label.config(text="⚔  Selecione o alvo")
        self._redraw()

    def _cancel_attack_mode(self):
        self._attack_mode = False
        self._attack_source_id = None
        self._mode_label.config(text="")
        self._redraw()

    def _execute_attack(self, target: CardEntity):
        self._attack_mode = False
        self._mode_label.config(text="")
        source = self._cm.get_card(self._attack_source_id or "")
        self._attack_source_id = None

        dlg = _AttackDialog(self, source.name if source else "?", target.name)
        self.wait_window(dlg)
        if dlg.result is None:
            self._redraw()
            return

        damage = dlg.result
        old_hp = target.current_hp
        target.current_hp = max(0, target.current_hp - damage)

        if self._network:
            self._network.broadcast("card_damage_applied", {
                "card_id": target.card_id,
                "damage": damage,
                "new_hp": target.current_hp,
                "max_hp": target.max_hp,
            })

        cc = self._cards.get(target.card_id)
        if cc:
            cc.invalidate()
        self._animate_damage(target.card_id, old_hp, target.current_hp, target.max_hp)

    # ── Animações ────────────────────────────────────────────────────────────

    def _animate_flip(self, card_id: str, step: int = 0, total: int = 12):
        """Flip horizontal: encolhe (fase 1) → troca face → expande (fase 2)."""
        cc = self._cards.get(card_id)
        card = self._cm.get_card(card_id)
        if not cc or not card:
            return

        mid = total // 2
        if step == mid:
            cc.invalidate()  # troca de face no meio da animação

        if step <= total:
            self.after(20, lambda: self._animate_flip(card_id, step + 1, total))
        else:
            self._redraw()

    def _animate_damage(self, card_id: str, old_hp: int, new_hp: int, max_hp: int,
                         step: int = 0):
        """Shake + red flash + HP tween."""
        card = self._cm.get_card(card_id)
        cc = self._cards.get(card_id)
        if not card or not cc:
            self._redraw()
            return

        total_steps = 18
        hp_steps = 20

        # HP tween
        if step == 0:
            self._tween_hp(card_id, old_hp, new_hp, max_hp, hp_steps)

        # Shake: escreve offset em cc; _redraw() aplica na posição
        shake = [5, -5, 4, -4, 3, -3, 2, -2, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0]
        if step < len(shake):
            cc.shake_offset_x = float(shake[step])
            self._redraw()
        elif step == len(shake):
            cc.shake_offset_x = 0.0

        # Red flash nos primeiros 8 frames
        if step == 0:
            self._show_damage_flash(card_id)

        if step < total_steps:
            self.after(40, lambda: self._animate_damage(card_id, old_hp, new_hp, max_hp,
                                                         step + 1))
        else:
            cc.shake_offset_x = 0.0
            cc.invalidate()
            self._redraw()

    def _show_damage_flash(self, card_id: str):
        card = self._cm.get_card(card_id)
        if not card:
            return
        sx, sy = self._w2s(card.x, card.y)
        w = int(CARD_W * card.scale * self._zoom)
        h = int(CARD_H * card.scale * self._zoom)
        flash_id = self.canvas.create_rectangle(
            sx - w // 2, sy - h // 2, sx + w // 2, sy + h // 2,
            fill="#ef4444", stipple="gray25", outline="", tags="damage_flash"
        )
        self.after(350, lambda: self._safe_delete(flash_id))

    def _safe_delete(self, item_id: int):
        try:
            self.canvas.delete(item_id)
        except tk.TclError:
            pass

    def _tween_hp(self, card_id: str, from_hp: int, to_hp: int, max_hp: int,
                   steps: int = 20):
        """Anima a barra de HP gradualmente."""
        delta = (to_hp - from_hp) / max(1, steps)
        for i in range(steps + 1):
            cur = round(from_hp + delta * i)
            self.after(i * 25, lambda c=cur: self._set_tween_hp(card_id, c, max_hp))

    def _set_tween_hp(self, card_id: str, hp: int, max_hp: int):
        card = self._cm.get_card(card_id)
        cc = self._cards.get(card_id)
        if card and cc:
            card.current_hp = hp
            cc.invalidate()
            # Redesenha apenas a carta afetada (otimização)
            self._redraw()

    def show_dice_overlay(self, die: str, mod: int, rolled: int, total: int,
                           player: str = ""):
        """Mostra resultado de dados recebido da rede."""
        from src.ui.canvas_window import _draw_dice_overlay
        _draw_dice_overlay(self.canvas, die, mod, rolled, total, player)
        self.after(3000, lambda: self.canvas.delete("dice_overlay"))

    # ── Broadcast helpers ─────────────────────────────────────────────────────

    def _broadcast_card_update(self, card_id: str):
        if not self._network:
            return
        card = self._cm.get_card(card_id)
        if card:
            self._network.broadcast("card_entity_update", card.public_dict())

    def _broadcast_card_created(self, card: CardEntity):
        if not self._network:
            return
        self._network.broadcast("card_created", card.public_dict())

    def get_full_sync_payload(self) -> dict:
        """Dados para enviar ao jogador que acabou de conectar."""
        return {
            "cards": [c.public_dict() for c in self._cm.all_cards()],
        }

    # ── Eventos de rede ───────────────────────────────────────────────────────

    def _on_network_event(self, payload: dict):
        """Processa eventos VTT recebidos do host. Roda via after(0)."""
        event = payload.get("type")
        if event not in ("card_entity_update", "card_damage_applied", "card_revealed",
                         "card_deleted", "card_hidden", "card_created", "vtt_full_sync"):
            return
        self.after(0, lambda p=payload: self._apply_network_event(p))

    def _apply_network_event(self, payload: dict):
        event = payload.get("type")

        if event == "vtt_full_sync":
            self._cm.apply_full_sync(payload.get("cards", []))
            self._cards.clear()
            self._redraw()

        elif event in ("card_entity_update", "card_created"):
            card = self._cm.apply_public_update(payload)
            if card:
                cc = self._cards.get(card.card_id)
                if cc:
                    cc.invalidate()
            self._redraw()

        elif event == "card_damage_applied":
            card_id = payload.get("card_id", "")
            new_hp = payload.get("new_hp", 0)
            max_hp = payload.get("max_hp", 1)
            damage = payload.get("damage", 0)
            card = self._cm.get_card(card_id)
            if card:
                old_hp = card.current_hp
                card.current_hp = new_hp
                card.max_hp = max_hp
                cc = self._cards.get(card_id)
                if cc:
                    cc.invalidate()
                self._animate_damage(card_id, old_hp, new_hp, max_hp)

        elif event == "card_revealed":
            card_id = payload.get("card_id", "")
            card = self._cm.get_card(card_id)
            if card:
                card.revealed = True
                cc = self._cards.get(card_id)
                if cc:
                    cc.invalidate()
                self._animate_flip(card_id)

        elif event == "card_hidden":
            card_id = payload.get("card_id", "")
            card = self._cm.get_card(card_id)
            if card:
                card.visible = False
                self._redraw()

        elif event == "card_deleted":
            card_id = payload.get("card_id", "")
            self._cm.remove_card(card_id)
            self._cards.pop(card_id, None)
            if self._selected_card_id == card_id:
                self._selected_card_id = None
                self._update_toolbar_state()
            self._redraw()
