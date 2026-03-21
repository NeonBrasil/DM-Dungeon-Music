"""
DM - Dungeon Music
Janela de apresentação (Canvas) para exibir imagens aos jogadores.
Canvas estilo livre com posicionamento, zoom global, zoom individual,
camadas (z-order) e drag de imagens.
"""

import os
import json
import tkinter as tk
from tkinter import ttk
from dataclasses import asdict
from PIL import Image, ImageTk
import random
import math
from src.session_manager import Session, ImageItem


class CanvasImage:
    """Representa uma imagem no canvas com posição, escala e z-order."""

    def __init__(self, img_item: ImageItem, pil_image: Image.Image,
                 x: float, y: float, scale: float = 1.0, z_order: int = 0):
        self.img_item = img_item
        self.original_pil = pil_image.copy()
        self.x = x
        self.y = y
        self.scale = scale
        self.z_order = z_order
        self.canvas_id: int | None = None
        self.photo: ImageTk.PhotoImage | None = None
        self.stats_id: int | None = None
        self.stats_bg_id: int | None = None
        self.selected = False
        # Cache de imagem redimensionada
        self._cached_scale: float = 0.0
        self._cached_photo: ImageTk.PhotoImage | None = None
        self._cached_w: int = 0
        self._cached_h: int = 0

    def get_photo(self, final_scale: float) -> ImageTk.PhotoImage:
        """Retorna photo redimensionada, usando cache se escala não mudou."""
        if self._cached_photo and abs(self._cached_scale - final_scale) < 0.001:
            self.photo = self._cached_photo
            return self._cached_photo
        new_w = max(1, int(self.original_pil.width * final_scale))
        new_h = max(1, int(self.original_pil.height * final_scale))
        resized = self.original_pil.resize((new_w, new_h), Image.Resampling.BILINEAR)
        self._cached_photo = ImageTk.PhotoImage(resized)
        self._cached_scale = final_scale
        self._cached_w = new_w
        self._cached_h = new_h
        self.photo = self._cached_photo
        return self._cached_photo

    def invalidate_cache(self):
        """Invalida cache (chamado quando escala muda)."""
        self._cached_scale = 0.0
        self._cached_photo = None


class Particle:
    """Uma partícula simples para efeitos visuais."""

    def __init__(self, x, y, vx, vy, life, color, size):
        self.x, self.y = x, y
        self.vx, self.vy = vx, vy
        self.life = life
        self.max_life = life
        self.color = color
        self.size = size

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vy += 0.05
        self.life -= 1

    def is_alive(self):
        return self.life > 0


class PresentationCanvas(ttk.Frame):
    """
    Frame de apresentação canvas com:
    - Posicionamento livre de imagens (drag com botão esquerdo)
    - Zoom global (scroll do mouse)
    - Zoom individual por imagem (Ctrl + scroll)
    - Z-order / Camadas (botões e atalhos Page Up/Down)
    - Pan do canvas (drag com botão direito)
    - Seleção visual de imagens
    """

    BG_COLOR = "#1a1a2e"
    TEXT_COLOR = "#e0e0e0"
    SELECTION_COLOR = "#3498db"

    def __init__(self, parent):
        super().__init__(parent)

        # Estado do canvas
        self._canvas_images: list[CanvasImage] = []
        self._selected_image: CanvasImage | None = None
        self._canvas_zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0

        # Drag state
        self._drag_data = {"active": False, "x": 0, "y": 0, "image": None}
        self._pan_data = {"active": False, "x": 0, "y": 0}

        # Partículas
        self.particles: list[Particle] = []
        self.particle_emitters: list[dict] = []
        self._animating = False

        # Z-order counter
        self._z_counter = 0

        # Sessão atual (para salvar posições)
        self._current_session: Session | None = None

        self._build()
        self._bind_events()

    def _build(self):
        # ── Toolbar do mestre ──
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", padx=5, pady=2)

        ttk.Label(toolbar, text="Zoom:").pack(side="left", padx=(5, 2))
        self._zoom_label = ttk.Label(toolbar, text="100%", width=5)
        self._zoom_label.pack(side="left", padx=2)

        ttk.Button(toolbar, text="🔍+", width=4,
                   command=lambda: self._apply_zoom(1.25)).pack(side="left", padx=1)
        ttk.Button(toolbar, text="🔍−", width=4,
                   command=lambda: self._apply_zoom(0.8)).pack(side="left", padx=1)
        ttk.Button(toolbar, text="🔍 Reset", width=8,
                   command=self._zoom_reset).pack(side="left", padx=1)

        ttk.Separator(toolbar, orient="vertical").pack(side="left", fill="y", padx=5)

        ttk.Label(toolbar, text="Camada:").pack(side="left", padx=(5, 2))
        ttk.Button(toolbar, text="↑ Frente", width=8,
                   command=self._bring_forward).pack(side="left", padx=1)
        ttk.Button(toolbar, text="↓ Trás", width=8,
                   command=self._send_backward).pack(side="left", padx=1)
        ttk.Button(toolbar, text="⊤ Topo", width=8,
                   command=self._bring_to_top).pack(side="left", padx=1)
        ttk.Button(toolbar, text="⊥ Fundo", width=8,
                   command=self._send_to_bottom).pack(side="left", padx=1)

        ttk.Separator(toolbar, orient="vertical").pack(side="left", fill="y", padx=5)

        ttk.Button(toolbar, text="🖼 Centralizar", width=10,
                   command=self._center_view).pack(side="left", padx=1)

        ttk.Separator(toolbar, orient="vertical").pack(side="left", fill="y", padx=5)

        ttk.Button(toolbar, text="💾 Salvar Posições", width=14,
                   command=self._save_positions).pack(side="left", padx=1)

        ttk.Separator(toolbar, orient="vertical").pack(side="left", fill="y", padx=5)

        ttk.Label(toolbar, text="Escala:").pack(side="left", padx=(5, 2))
        self._scale_var = tk.IntVar(value=100)
        self._scale_spin = ttk.Spinbox(
            toolbar, from_=5, to=1000, textvariable=self._scale_var,
            width=5, command=self._on_scale_spin
        )
        self._scale_spin.pack(side="left", padx=2)
        self._scale_spin.bind("<Return>", lambda e: self._on_scale_spin())
        ttk.Label(toolbar, text="%").pack(side="left")
        ttk.Button(toolbar, text="+", width=2,
                   command=lambda: self._scale_step(10)).pack(side="left", padx=1)
        ttk.Button(toolbar, text="−", width=2,
                   command=lambda: self._scale_step(-10)).pack(side="left", padx=1)
        ttk.Button(toolbar, text="🔄", width=3,
                   command=self._reset_image_scale).pack(side="left", padx=1)

        self._info_label = ttk.Label(toolbar, text="", foreground="gray")
        self._info_label.pack(side="right", padx=5)

        # ── Canvas principal ──
        self.canvas = tk.Canvas(
            self, bg=self.BG_COLOR, highlightthickness=0, cursor="arrow"
        )
        self.canvas.pack(fill="both", expand=True)

        # Texto padrão
        self.default_text = self.canvas.create_text(
            640, 360,
            text="⚔️ DM - Dungeon Music ⚔️\n\nAguardando o Mestre...",
            fill=self.TEXT_COLOR, font=("Segoe UI", 24, "bold"),
            justify="center"
        )

    def _bind_events(self):
        """Liga todos os eventos do canvas."""
        self.canvas.bind("<Configure>", self._on_resize)

        # Botão esquerdo: selecionar e arrastar imagem
        self.canvas.bind("<ButtonPress-1>", self._on_left_press)
        self.canvas.bind("<B1-Motion>", self._on_left_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_left_release)

        # Botão direito: pan do canvas
        self.canvas.bind("<ButtonPress-3>", self._on_right_press)
        self.canvas.bind("<B3-Motion>", self._on_right_drag)
        self.canvas.bind("<ButtonRelease-3>", self._on_right_release)

        # Scroll: zoom global
        self.canvas.bind("<MouseWheel>", self._on_mousewheel)
        # Linux
        self.canvas.bind("<Button-4>", lambda e: self._on_mousewheel_linux(e, 1))
        self.canvas.bind("<Button-5>", lambda e: self._on_mousewheel_linux(e, -1))

        # Ctrl + scroll: zoom individual da imagem
        self.canvas.bind("<Control-MouseWheel>", self._on_ctrl_mousewheel)

        # Teclado (bind no toplevel do frame)
        top = self.winfo_toplevel()
        top.bind("<Delete>", self._on_delete_key)
        top.bind("<Escape>", lambda e: self._deselect())
        top.bind("<Prior>", lambda e: self._bring_forward())   # Page Up
        top.bind("<Next>", lambda e: self._send_backward())    # Page Down

    # ═══════════════════════════════════════
    # Coordenadas mundo <-> tela
    # ═══════════════════════════════════════

    def _world_to_screen(self, wx: float, wy: float) -> tuple[float, float]:
        """Converte coordenadas do mundo para coordenadas de tela."""
        sx = (wx + self._pan_x) * self._canvas_zoom
        sy = (wy + self._pan_y) * self._canvas_zoom
        return sx, sy

    def _screen_to_world(self, sx: float, sy: float) -> tuple[float, float]:
        """Converte coordenadas de tela para coordenadas do mundo."""
        wx = sx / self._canvas_zoom - self._pan_x
        wy = sy / self._canvas_zoom - self._pan_y
        return wx, wy

    # ═══════════════════════════════════════
    # Zoom
    # ═══════════════════════════════════════

    def _apply_zoom(self, factor: float, center_x: float = None,
                    center_y: float = None):
        """Aplica zoom global centrado em um ponto."""
        old_zoom = self._canvas_zoom
        self._canvas_zoom = max(0.1, min(5.0, self._canvas_zoom * factor))

        # Mantém o ponto sob o cursor fixo
        if center_x is not None and center_y is not None:
            wx = center_x / old_zoom - self._pan_x
            wy = center_y / old_zoom - self._pan_y
            self._pan_x = center_x / self._canvas_zoom - wx
            self._pan_y = center_y / self._canvas_zoom - wy

        self._zoom_label.config(text=f"{int(self._canvas_zoom * 100)}%")
        self._redraw()

    def _zoom_reset(self):
        """Reseta zoom e pan para o padrão."""
        self._canvas_zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0
        self._zoom_label.config(text="100%")
        self._redraw()

    # ═══════════════════════════════════════
    # Eventos de mouse
    # ═══════════════════════════════════════

    def _on_left_press(self, event):
        """Clique esquerdo: seleciona e inicia drag da imagem."""
        clicked = self._find_image_at(event.x, event.y)
        if clicked:
            self._select_image(clicked)
            self._drag_data = {
                "active": True, "x": event.x, "y": event.y, "image": clicked
            }
            self.canvas.config(cursor="fleur")
        else:
            self._deselect()

    def _on_left_drag(self, event):
        """Arrasta a imagem selecionada."""
        if self._drag_data["active"] and self._drag_data["image"]:
            dx_screen = event.x - self._drag_data["x"]
            dy_screen = event.y - self._drag_data["y"]

            img = self._drag_data["image"]
            img.x += dx_screen / self._canvas_zoom
            img.y += dy_screen / self._canvas_zoom
            img.img_item.position_x = int(img.x)
            img.img_item.position_y = int(img.y)

            self._drag_data["x"] = event.x
            self._drag_data["y"] = event.y

            # Move itens da imagem diretamente (evita delete+recreate)
            tag = f"img{id(img)}"
            self.canvas.move(tag, dx_screen, dy_screen)

    def _on_left_release(self, event):
        """Finaliza drag."""
        self._drag_data = {"active": False, "x": 0, "y": 0, "image": None}
        self.canvas.config(cursor="arrow")

    def _on_right_press(self, event):
        """Clique direito: inicia pan do canvas."""
        self._pan_data = {"active": True, "x": event.x, "y": event.y}
        self.canvas.config(cursor="hand2")

    def _on_right_drag(self, event):
        """Arrasta para mover a câmera do canvas."""
        if self._pan_data["active"]:
            dx_screen = event.x - self._pan_data["x"]
            dy_screen = event.y - self._pan_data["y"]
            self._pan_x += dx_screen / self._canvas_zoom
            self._pan_y += dy_screen / self._canvas_zoom
            self._pan_data["x"] = event.x
            self._pan_data["y"] = event.y

            # Move tudo no canvas diretamente (evita delete+recreate)
            self.canvas.move("all", dx_screen, dy_screen)

    def _on_right_release(self, event):
        """Finaliza pan."""
        self._pan_data = {"active": False, "x": 0, "y": 0}
        self.canvas.config(cursor="arrow")

    def _on_mousewheel(self, event):
        """Scroll: zoom global centrado no cursor."""
        if event.state & 0x4:  # Ctrl pressionado
            return
        factor = 1.1 if event.delta > 0 else 0.9
        self._apply_zoom(factor, event.x, event.y)

    def _on_mousewheel_linux(self, event, direction):
        factor = 1.1 if direction > 0 else 0.9
        self._apply_zoom(factor, event.x, event.y)

    def _on_ctrl_mousewheel(self, event):
        """Ctrl + scroll: redimensiona a imagem sob o cursor."""
        img = self._find_image_at(event.x, event.y)
        if img:
            factor = 1.1 if event.delta > 0 else 0.9
            img.scale = max(0.05, min(10.0, img.scale * factor))
            img.img_item.scale = img.scale
            self._redraw()
            self._update_info()

    def _on_delete_key(self, event):
        """Delete: oculta a imagem selecionada da apresentação."""
        if self._selected_image:
            self._selected_image.img_item.visible = False
            self._canvas_images.remove(self._selected_image)
            self._selected_image = None
            self._info_label.config(text="")
            self._redraw()

    def _on_resize(self, event):
        """Recentraliza o texto padrão ao redimensionar."""
        if self.default_text:
            try:
                self.canvas.coords(self.default_text,
                                   event.width // 2, event.height // 2)
            except tk.TclError:
                pass

    # ═══════════════════════════════════════
    # Seleção
    # ═══════════════════════════════════════

    def _select_image(self, img: CanvasImage):
        """Seleciona uma imagem (destaque visual)."""
        if self._selected_image:
            self._selected_image.selected = False
        img.selected = True
        self._selected_image = img
        self._update_info()
        self._redraw()

    def _deselect(self):
        """Remove seleção."""
        if self._selected_image:
            self._selected_image.selected = False
            self._selected_image = None
            self._info_label.config(text="")
            self._redraw()

    def _update_info(self):
        """Atualiza label de informação sobre a imagem selecionada."""
        if self._selected_image:
            img = self._selected_image
            self._info_label.config(
                text=f"📌 {img.img_item.name} | "
                     f"Escala: {int(img.scale * 100)}% | "
                     f"Pos: ({int(img.x)}, {int(img.y)}) | "
                     f"Z: {img.z_order}"
            )
            self._scale_var.set(int(img.scale * 100))

    # ═══════════════════════════════════════
    # Escala individual
    # ═══════════════════════════════════════

    def _on_scale_spin(self):
        """Aplica escala do spinbox à imagem selecionada."""
        if self._selected_image:
            try:
                pct = self._scale_var.get()
                pct = max(5, min(1000, pct))
                self._selected_image.scale = pct / 100.0
                self._selected_image.img_item.scale = self._selected_image.scale
                self._redraw()
                self._update_info()
            except (tk.TclError, ValueError):
                pass

    def _scale_step(self, delta: int):
        """Incrementa/decrementa escala da imagem selecionada."""
        if self._selected_image:
            current = int(self._selected_image.scale * 100)
            new_pct = max(5, min(1000, current + delta))
            self._scale_var.set(new_pct)
            self._selected_image.scale = new_pct / 100.0
            self._selected_image.img_item.scale = self._selected_image.scale
            self._redraw()
            self._update_info()

    def _reset_image_scale(self):
        """Reseta escala da imagem selecionada para 100%."""
        if self._selected_image:
            self._selected_image.scale = 1.0
            self._selected_image.img_item.scale = 1.0
            self._scale_var.set(100)
            self._redraw()
            self._update_info()

    # ═══════════════════════════════════════
    # Z-Order (Camadas)
    # ═══════════════════════════════════════

    def _bring_forward(self):
        """Move imagem selecionada uma camada para frente."""
        if self._selected_image:
            self._selected_image.z_order += 1
            self._sort_by_z_order()
            self._redraw()
            self._update_info()

    def _send_backward(self):
        """Move imagem selecionada uma camada para trás."""
        if self._selected_image:
            self._selected_image.z_order -= 1
            self._sort_by_z_order()
            self._redraw()
            self._update_info()

    def _bring_to_top(self):
        """Move imagem selecionada para a camada mais alta."""
        if self._selected_image and self._canvas_images:
            max_z = max(img.z_order for img in self._canvas_images)
            self._selected_image.z_order = max_z + 1
            self._sort_by_z_order()
            self._redraw()
            self._update_info()

    def _send_to_bottom(self):
        """Move imagem selecionada para a camada mais baixa."""
        if self._selected_image and self._canvas_images:
            min_z = min(img.z_order for img in self._canvas_images)
            self._selected_image.z_order = min_z - 1
            self._sort_by_z_order()
            self._redraw()
            self._update_info()

    def _sort_by_z_order(self):
        """Ordena a lista de imagens por z-order (fundo primeiro)."""
        self._canvas_images.sort(key=lambda img: img.z_order)

    # ═══════════════════════════════════════
    # Hit testing
    # ═══════════════════════════════════════

    def _find_image_at(self, sx: float, sy: float) -> CanvasImage | None:
        """Encontra a imagem do topo sob as coordenadas de tela."""
        for img in reversed(self._canvas_images):
            if self._point_in_image(img, sx, sy):
                return img
        return None

    def _point_in_image(self, img: CanvasImage, sx: float, sy: float) -> bool:
        """Verifica se um ponto da tela está dentro do bounding box da imagem."""
        ix, iy = self._world_to_screen(img.x, img.y)
        w = img.original_pil.width * img.scale * self._canvas_zoom
        h = img.original_pil.height * img.scale * self._canvas_zoom
        return (ix - w / 2 <= sx <= ix + w / 2 and
                iy - h / 2 <= sy <= iy + h / 2)

    # ═══════════════════════════════════════
    # Renderização
    # ═══════════════════════════════════════

    def _redraw(self):
        """Redesenha todo o canvas."""
        self.canvas.delete("all")
        self.default_text = None

        if not self._canvas_images:
            w = self.canvas.winfo_width() or 1280
            h = self.canvas.winfo_height() or 720
            self.default_text = self.canvas.create_text(
                w // 2, h // 2,
                text="⚔️ DM - Dungeon Music ⚔️\n\nAguardando o Mestre...",
                fill=self.TEXT_COLOR, font=("Segoe UI", 24, "bold"),
                justify="center"
            )
            return

        # Desenha cada imagem na ordem de z-order
        for img in self._canvas_images:
            self._render_image(img)

    def _render_image(self, img: CanvasImage):
        """Renderiza uma imagem individual no canvas."""
        try:
            final_scale = img.scale * self._canvas_zoom
            photo = img.get_photo(final_scale)
            new_w = img._cached_w
            new_h = img._cached_h
            tag = f"img{id(img)}"

            sx, sy = self._world_to_screen(img.x, img.y)
            img.canvas_id = self.canvas.create_image(
                sx, sy, image=photo, anchor="center", tags=tag
            )

            # Borda de seleção (tracejada azul)
            if img.selected:
                hw, hh = new_w / 2, new_h / 2
                self.canvas.create_rectangle(
                    sx - hw - 3, sy - hh - 3,
                    sx + hw + 3, sy + hh + 3,
                    outline=self.SELECTION_COLOR, width=2, dash=(6, 4),
                    tags=tag
                )

            # Overlay de stats (itens de RPG)
            if img.img_item.stats:
                stats_text = "\n".join(
                    f"{k}: {v}" for k, v in img.img_item.stats.items()
                )
                text_y = sy + new_h / 2 + 15
                img.stats_id = self.canvas.create_text(
                    sx, text_y, text=stats_text,
                    fill="#ffd700", font=("Consolas", 11, "bold"),
                    justify="center", anchor="n", tags=tag
                )
                bbox = self.canvas.bbox(img.stats_id)
                if bbox:
                    img.stats_bg_id = self.canvas.create_rectangle(
                        bbox[0] - 8, bbox[1] - 4,
                        bbox[2] + 8, bbox[3] + 4,
                        fill="#1a1a2e", outline="#ffd700", stipple="gray50",
                        tags=tag
                    )
                    self.canvas.tag_raise(img.stats_id, img.stats_bg_id)

        except Exception as e:
            print(f"Erro ao renderizar imagem: {e}")

    # ═══════════════════════════════════════
    # API pública
    # ═══════════════════════════════════════

    def display_session_images(self, session: Session | None):
        """Exibe todas as imagens visíveis de uma sessão no canvas."""
        self._current_session = session
        self._canvas_images.clear()
        self._selected_image = None
        self.particles.clear()
        self.particle_emitters.clear()
        self._animating = False

        if session is None:
            self._redraw()
            return

        visible_images = [img for img in session.images if img.visible]
        if not visible_images:
            self._redraw()
            return

        canvas_w = self.canvas.winfo_width() or 1280
        canvas_h = self.canvas.winfo_height() or 720

        for i, img_item in enumerate(visible_images):
            try:
                pil_img = Image.open(img_item.file_path)

                # Posição: usa salva ou auto-calcula em grid
                if img_item.position_x == 0 and img_item.position_y == 0:
                    cols = min(len(visible_images), 3)
                    row = i // cols
                    col = i % cols
                    total_rows = max(1, (len(visible_images) + cols - 1) // cols)
                    x = (col + 0.5) * (canvas_w / cols)
                    y = (row + 0.5) * (canvas_h / total_rows)
                else:
                    x = img_item.position_x
                    y = img_item.position_y

                # Escala: auto-ajusta na primeira vez
                scale = img_item.scale
                if scale == 1.0 and len(visible_images) == 1:
                    ratio = min(canvas_w / pil_img.width,
                                canvas_h / pil_img.height) * 0.85
                    scale = ratio
                elif scale == 1.0:
                    max_dim = min(canvas_w / min(len(visible_images), 3),
                                  canvas_h) - 40
                    ratio = min(max_dim / pil_img.width,
                                max_dim / pil_img.height)
                    scale = max(0.1, ratio)

                canvas_img = CanvasImage(
                    img_item=img_item, pil_image=pil_img,
                    x=x, y=y, scale=scale, z_order=self._z_counter
                )
                self._z_counter += 1
                self._canvas_images.append(canvas_img)

            except Exception as e:
                print(f"Erro ao carregar {img_item.file_path}: {e}")

        self._redraw()

        # Partículas
        self._setup_particle_effects()
        if self.particle_emitters and not self._animating:
            self._animating = True
            self._animate_particles()

    def _save_positions(self):
        """Persiste posição e escala atuais de todas as imagens no JSON da sessão."""
        session = self._current_session
        if not session:
            return
        # Sincroniza z_order de volta para o ImageItem não é necessário pois
        # position_x/y e scale já são atualizados em tempo real durante drag/scale.
        meta_path = os.path.join(session.folder_path, "_session.json")
        data = {
            "name": session.name,
            "folder_path": session.folder_path,
            "images": [asdict(img) for img in session.images],
            "display_order": session.display_order,
        }
        try:
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._info_label.config(text="✅ Posições salvas!")
            self.after(2500, lambda: self._info_label.config(
                text=f"📌 {self._selected_image.img_item.name} | "
                     f"Escala: {int(self._selected_image.scale * 100)}% | "
                     f"Pos: ({int(self._selected_image.x)}, {int(self._selected_image.y)})"
                     if self._selected_image else ""
            ))
        except Exception as e:
            self._info_label.config(text=f"❌ Erro ao salvar: {e}")

    def _center_view(self):
        """Centraliza a câmera em todas as imagens visíveis."""
        if not self._canvas_images:
            return

        min_x = min(img.x for img in self._canvas_images)
        max_x = max(img.x for img in self._canvas_images)
        min_y = min(img.y for img in self._canvas_images)
        max_y = max(img.y for img in self._canvas_images)

        center_x = (min_x + max_x) / 2
        center_y = (min_y + max_y) / 2

        canvas_w = self.canvas.winfo_width() or 1280
        canvas_h = self.canvas.winfo_height() or 720

        self._pan_x = canvas_w / (2 * self._canvas_zoom) - center_x
        self._pan_y = canvas_h / (2 * self._canvas_zoom) - center_y
        self._redraw()

    def set_background_color(self, color: str):
        """Altera a cor de fundo da apresentação."""
        self.configure(bg=color)
        self.canvas.configure(bg=color)
        self._redraw()

    def show_text(self, text: str, font_size: int = 24):
        """Exibe um texto centralizado na tela."""
        self._canvas_images.clear()
        self._selected_image = None
        self.canvas.delete("all")
        w = self.canvas.winfo_width() or 1280
        h = self.canvas.winfo_height() or 720
        self.default_text = self.canvas.create_text(
            w // 2, h // 2, text=text,
            fill=self.TEXT_COLOR, font=("Segoe UI", font_size, "bold"),
            justify="center"
        )

    # ═══════════════════════════════════════
    # Partículas
    # ═══════════════════════════════════════

    def _setup_particle_effects(self):
        """Configura emissores de partículas baseado nos efeitos das imagens."""
        self.particle_emitters.clear()
        self.particles.clear()

        canvas_w = self.canvas.winfo_width() or 1280

        for img in self._canvas_images:
            if not img.img_item.effects:
                continue
            for effect in img.img_item.effects:
                el = effect.lower()
                if "poeira" in el or "dust" in el:
                    self.particle_emitters.append({
                        "x": img.x, "y": img.y, "type": "dust",
                        "color": "#c8b88a", "rate": 2,
                        "spread_x": 150, "spread_y": 100
                    })
                elif "brilho" in el or "glow" in el:
                    self.particle_emitters.append({
                        "x": img.x, "y": img.y, "type": "glow",
                        "color": "#ffd700", "rate": 3,
                        "spread_x": 80, "spread_y": 80
                    })
                elif "fogo" in el or "fire" in el:
                    self.particle_emitters.append({
                        "x": img.x, "y": img.y - 40, "type": "fire",
                        "color": "#ff4500", "rate": 5,
                        "spread_x": 30, "spread_y": 10
                    })
                elif "neve" in el or "snow" in el:
                    self.particle_emitters.append({
                        "x": canvas_w // 2, "y": 0, "type": "snow",
                        "color": "#ffffff", "rate": 4,
                        "spread_x": canvas_w // 2, "spread_y": 5
                    })
                elif "chuva" in el or "rain" in el:
                    self.particle_emitters.append({
                        "x": canvas_w // 2, "y": 0, "type": "rain",
                        "color": "#4a90d9", "rate": 8,
                        "spread_x": canvas_w // 2, "spread_y": 5
                    })

    def _animate_particles(self):
        """Loop de animação de partículas (~30 FPS)."""
        if not self._animating or not self.particle_emitters:
            return

        for emitter in self.particle_emitters:
            for _ in range(emitter["rate"]):
                self._emit_particle(emitter)

        self.canvas.delete("particle")
        alive = []
        for p in self.particles:
            p.update()
            if p.is_alive():
                alive.append(p)
                alpha = p.life / p.max_life
                size = max(1, int(p.size * alpha))
                sx, sy = self._world_to_screen(p.x, p.y)
                self.canvas.create_oval(
                    sx - size, sy - size, sx + size, sy + size,
                    fill=p.color, outline="", tags="particle"
                )
        self.particles = alive

        if self.winfo_exists():
            self.after(33, self._animate_particles)

    def _emit_particle(self, emitter: dict):
        """Emite uma partícula de um emissor."""
        ptype = emitter["type"]
        x = emitter["x"] + random.uniform(-emitter["spread_x"], emitter["spread_x"])
        y = emitter["y"] + random.uniform(-emitter["spread_y"], emitter["spread_y"])

        if ptype == "dust":
            vx, vy = random.uniform(-0.5, 0.5), random.uniform(-1.5, -0.3)
            life, size = random.randint(40, 100), random.randint(1, 3)
        elif ptype == "glow":
            a = random.uniform(0, 2 * math.pi)
            s = random.uniform(0.3, 1.0)
            vx, vy = math.cos(a) * s, math.sin(a) * s
            life, size = random.randint(20, 60), random.randint(2, 4)
        elif ptype == "fire":
            vx, vy = random.uniform(-1, 1), random.uniform(-3, -1)
            life, size = random.randint(15, 40), random.randint(2, 5)
            emitter["color"] = random.choice(
                ["#ff4500", "#ff6347", "#ffa500", "#ffff00"]
            )
        elif ptype == "snow":
            vx, vy = random.uniform(-0.5, 0.5), random.uniform(0.5, 2.0)
            life, size = random.randint(100, 300), random.randint(2, 4)
        elif ptype == "rain":
            vx, vy = random.uniform(-0.3, 0.3), random.uniform(5, 10)
            life, size = random.randint(30, 80), random.randint(1, 2)
        else:
            return

        self.particles.append(
            Particle(x, y, vx, vy, life, emitter["color"], size)
        )

    def destroy(self):
        self._animating = False
        super().destroy()
