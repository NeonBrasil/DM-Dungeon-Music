"""
DM - Dungeon Music
Janela de jogador (Player View) — visão somente-leitura para participantes da sessão.
Exibe: canvas/battlemap sincronizado, volume global e rolagem de dados.
"""

import os
import threading
import tkinter as tk
from tkinter import ttk
from urllib import request as urllib_request

from PIL import Image, ImageTk

from src.audio_manager import AudioManager, AudioTrack
from src.network_manager import NetworkManager
from src.ui.canvas_window import DiceRollerFrame, _draw_dice_overlay


class PlayerCanvas(ttk.Frame):
    """Canvas somente-leitura para jogadores. Suporta pan e zoom, sem arrastar."""

    BG_COLOR = "#1a1a2e"
    TEXT_COLOR = "#e0e0e0"

    def __init__(self, parent):
        super().__init__(parent)
        self._zoom = 1.0
        self._pan_x = 0.0
        self._pan_y = 0.0
        self._pan_data = {"active": False, "x": 0, "y": 0}
        self._photo_refs: list = []
        self._network_manager = None
        self._waiting_id = None
        self._build()
        self._bind_events()

    def _build(self):
        self.canvas = tk.Canvas(self, bg=self.BG_COLOR, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self._waiting_id = self.canvas.create_text(
            320, 240,
            text="⚔️  Aguardando o Mestre…",
            fill=self.TEXT_COLOR, font=("Segoe UI", 20, "bold"),
            justify="center"
        )

    def _bind_events(self):
        self.canvas.bind("<ButtonPress-3>", self._on_right_press)
        self.canvas.bind("<B3-Motion>", self._on_right_drag)
        self.canvas.bind("<ButtonRelease-3>", self._on_right_release)
        self.canvas.bind("<MouseWheel>", self._on_scroll)
        self.canvas.bind("<Configure>", self._on_resize)

    # ── Pan & Zoom ──────────────────────────────────────────────────────────
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
            self.canvas.move("img_item", dx, dy)

    def _on_right_release(self, event):
        self._pan_data = {"active": False, "x": 0, "y": 0}
        self.canvas.config(cursor="arrow")

    def _on_scroll(self, event):
        factor = 1.1 if event.delta > 0 else 0.9
        old = self._zoom
        self._zoom = max(0.1, min(5.0, self._zoom * factor))
        wx = event.x / old - self._pan_x
        wy = event.y / old - self._pan_y
        self._pan_x = event.x / self._zoom - wx
        self._pan_y = event.y / self._zoom - wy

    def _on_resize(self, event):
        if self._waiting_id:
            try:
                self.canvas.coords(self._waiting_id, event.width // 2, event.height // 2)
            except tk.TclError:
                pass

    # ── State sync ──────────────────────────────────────────────────────────
    def apply_canvas_state(self, images_data: list):
        """Aplica estado de canvas/battlemap recebido do host."""
        self.canvas.delete("img_item")
        self.canvas.delete("dice_overlay")
        self._photo_refs.clear()

        if not images_data:
            w = self.canvas.winfo_width() or 640
            h = self.canvas.winfo_height() or 480
            if self._waiting_id:
                try:
                    self.canvas.delete(self._waiting_id)
                except tk.TclError:
                    pass
            self._waiting_id = self.canvas.create_text(
                w // 2, h // 2,
                text="⚔️  Aguardando o Mestre…",
                fill=self.TEXT_COLOR, font=("Segoe UI", 20, "bold"),
                justify="center"
            )
            return

        if self._waiting_id:
            try:
                self.canvas.delete(self._waiting_id)
            except tk.TclError:
                pass
            self._waiting_id = None

        for item in sorted(images_data, key=lambda d: d.get("z_order", 0)):
            fp = item.get("file_path", "")
            if not fp or not os.path.isfile(fp):
                continue
            try:
                pil_img = Image.open(fp)
                scale = item.get("scale", 1.0) * self._zoom
                new_w = max(1, int(pil_img.width * scale))
                new_h = max(1, int(pil_img.height * scale))
                pil_img = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)
                photo = ImageTk.PhotoImage(pil_img)
                self._photo_refs.append(photo)
                wx = item.get("x", 0)
                wy = item.get("y", 0)
                sx = (wx + self._pan_x) * self._zoom
                sy = (wy + self._pan_y) * self._zoom
                self.canvas.create_image(sx, sy, image=photo, anchor="center",
                                         tags="img_item")
            except Exception as exc:
                print(f"[PlayerCanvas] Erro ao carregar {fp}: {exc}")

    # ── Dice overlay ────────────────────────────────────────────────────────
    def show_dice_overlay(self, die: str, mod: int, rolled: int, total: int,
                           player: str = ""):
        _draw_dice_overlay(self.canvas, die, mod, rolled, total, player)
        self.after(3000, lambda: self.canvas.delete("dice_overlay"))


class PlayerWindow(tk.Toplevel):
    """Janela de jogador: canvas somente-leitura + volume + dados."""

    def __init__(self, master_root, network_manager: NetworkManager,
                 audio_manager: AudioManager):
        super().__init__(master_root)
        self.title("DM - Visão do Jogador")
        self.geometry("1024x700")
        self.minsize(640, 480)

        self._network = network_manager
        self._audio = audio_manager
        # filename → AudioTrack (add_track retorna AudioTrack, não int)
        self._active_tracks: dict[str, AudioTrack] = {}
        self._active_sfx: dict[str, AudioTrack] = {}

        self._build_ui()
        self._network.add_message_listener(self._on_network_message)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        # ── Status bar ──────────────────────────────────────────────────────
        host = self._network._last_connected_host
        pid = self._network._local_player_id
        status_bar = ttk.Frame(self)
        status_bar.pack(fill="x", padx=8, pady=(6, 2))
        ttk.Label(
            status_bar,
            text=f"🌐  Conectado a {host}  |  Jogador: {pid}",
            foreground="#3498db"
        ).pack(side="left")
        self._status_label = ttk.Label(status_bar, text="", foreground="gray")
        self._status_label.pack(side="right")

        # ── Canvas ──────────────────────────────────────────────────────────
        self.player_canvas = PlayerCanvas(self)
        self.player_canvas._network_manager = self._network
        self.player_canvas.pack(fill="both", expand=True, padx=4, pady=2)

        # ── Bottom bar: volume + dados ───────────────────────────────────────
        bottom = ttk.Frame(self)
        bottom.pack(fill="x", padx=6, pady=(2, 6))

        ttk.Label(bottom, text="Volume:").pack(side="left", padx=(4, 2))
        self._vol_var = tk.DoubleVar(value=1.0)
        ttk.Scale(
            bottom, from_=0.0, to=1.0, orient="horizontal",
            variable=self._vol_var, length=140,
            command=self._on_volume_change
        ).pack(side="left", padx=(0, 10))

        ttk.Separator(bottom, orient="vertical").pack(side="left", fill="y", padx=6)

        self._dice_bar = DiceRollerFrame(self.player_canvas)
        self._dice_bar.pack(side="left", fill="x", expand=True)

    # ── Volume ──────────────────────────────────────────────────────────────
    def _on_volume_change(self, _value=None):
        vol = self._vol_var.get()
        for track in self._audio.tracks.values():
            track.set_volume(vol)
        self._network.send_to_host("volume_change", {"volume": vol})

    # ── Network messages ────────────────────────────────────────────────────
    def _on_network_message(self, payload: dict):
        event = payload.get("type")
        if event in ("canvas_update", "canvas_full_sync",
                     "battlemap_update", "battlemap_full_sync"):
            images = payload.get("images", [])
            self.after(0, lambda img=images: self.player_canvas.apply_canvas_state(img))
        elif event == "play_track":
            filename = payload.get("filename", "")
            loop = payload.get("loop", False)
            vol = payload.get("volume", 1.0)
            self.after(0, lambda f=filename, l=loop, v=vol: self._fetch_and_play(f, l, v))
        elif event == "stop_track":
            filename = payload.get("filename", "")
            self.after(0, lambda f=filename: self._stop_track(f))
        elif event == "sfx_play":
            filename = payload.get("filename", "")
            vol = payload.get("volume", 1.0)
            self.after(0, lambda f=filename, v=vol: self._fetch_and_play_sfx(f, v))
        elif event == "set_volume":
            vol = float(payload.get("volume", 1.0))
            self.after(0, lambda v=vol: self._set_global_volume(v))
        elif event == "dice_result":
            die = payload.get("die", "D20")
            mod = payload.get("modifier", 0)
            rolled = payload.get("rolled", 0)
            total = payload.get("total", 0)
            player = payload.get("player", "")
            self.after(0, lambda: self.player_canvas.show_dice_overlay(
                die, mod, rolled, total, player
            ))

    # ── Audio playback ──────────────────────────────────────────────────────
    def _cache_dir(self) -> str:
        d = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "player_cache")
        os.makedirs(d, exist_ok=True)
        return d

    def _fetch_and_play(self, filename: str, loop: bool, volume: float):
        if not filename:
            return
        local_path = os.path.join(self._cache_dir(), filename)
        if os.path.isfile(local_path):
            self._play_cached(local_path, filename, loop, volume)
            return
        self._set_status(f"Baixando {filename}…")
        host = self._network._last_connected_host
        url = f"http://{host}:8766/audio/{filename}"
        threading.Thread(
            target=self._download_and_play,
            args=(url, local_path, filename, loop, volume),
            daemon=True,
        ).start()

    def _download_and_play(self, url: str, local_path: str, filename: str,
                            loop: bool, volume: float):
        try:
            urllib_request.urlretrieve(url, local_path)
            self.after(0, lambda: self._play_cached(local_path, filename, loop, volume))
            self.after(0, lambda: self._set_status(""))
        except Exception as exc:
            self.after(0, lambda: self._set_status(f"Erro ao baixar {filename}: {exc}"))

    def _play_cached(self, local_path: str, filename: str, loop: bool, volume: float):
        # Verifica se já está tocando
        existing = self._active_tracks.get(filename)
        if existing is not None and existing.is_active():
            return
        try:
            track: AudioTrack = self._audio.add_track(local_path)
            self._active_tracks[filename] = track
            track.set_volume(volume * self._vol_var.get())
            track.play(loop=loop)
        except Exception as exc:
            self._set_status(f"Erro ao tocar {filename}: {exc}")

    def _stop_track(self, filename: str):
        track = self._active_tracks.pop(filename, None)
        if track is not None:
            try:
                track.stop()
            except Exception:
                pass

    def _fetch_and_play_sfx(self, filename: str, volume: float):
        if not filename:
            return
        local_path = os.path.join(self._cache_dir(), filename)
        if os.path.isfile(local_path):
            self._play_sfx_cached(local_path, filename, volume)
            return
        host = self._network._last_connected_host
        url = f"http://{host}:8766/audio/{filename}"
        threading.Thread(
            target=self._download_sfx,
            args=(url, local_path, filename, volume),
            daemon=True,
        ).start()

    def _download_sfx(self, url: str, local_path: str, filename: str, volume: float):
        try:
            urllib_request.urlretrieve(url, local_path)
            self.after(0, lambda: self._play_sfx_cached(local_path, filename, volume))
        except Exception:
            pass

    def _play_sfx_cached(self, local_path: str, filename: str, volume: float):
        try:
            track: AudioTrack = self._audio.add_track(local_path)
            self._active_sfx[filename] = track
            track.set_volume(volume * self._vol_var.get())
            track.play()
        except Exception:
            pass

    def _set_global_volume(self, volume: float):
        self._vol_var.set(volume)
        for track in self._audio.tracks.values():
            track.set_volume(volume)

    def _set_status(self, msg: str):
        if self.winfo_exists():
            self._status_label.config(text=msg)

    # ── Cleanup ─────────────────────────────────────────────────────────────
    def _on_close(self):
        try:
            self._network._message_listeners.remove(self._on_network_message)
        except ValueError:
            pass
        self.destroy()
