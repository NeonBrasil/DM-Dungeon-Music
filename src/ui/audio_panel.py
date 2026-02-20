"""
DM - Dungeon Music
Painel de controle de áudio com suporte a múltiplas faixas simultâneas.
Inclui timeline/seek para controle de posição da música.
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageTk
import io
import queue
from src.audio_manager import AudioManager, AudioTrack
from src.ui.theme import COLORS


class TrackWidget(ttk.Frame):
    """Widget individual para controlar uma faixa de áudio com timeline."""

    def __init__(self, parent, track: AudioTrack, on_remove=None):
        super().__init__(parent, padding=8, relief="groove", borderwidth=1)
        self.track = track
        self.on_remove = on_remove
        self._seeking = False
        self._effects_visible = False
        self._thumb_photo = None  # mantém referência
        self._thumb_label = None
        self._build()

    def _get_thumbnail(self, size=(48, 48)):
        """Retorna PhotoImage do artwork ou ícone padrão."""
        if self.track.artwork_data:
            try:
                img = Image.open(io.BytesIO(self.track.artwork_data))
                img = img.resize(size, Image.Resampling.BILINEAR)
                return ImageTk.PhotoImage(img)
            except Exception as e:
                print(f"[DM] Erro ao criar thumbnail: {e}")
        # Ícone padrão
        img = Image.new("RGB", size, COLORS["surface"])
        return ImageTk.PhotoImage(img)

    def refresh_metadata(self):
        """Atualiza widget após metadados carregados (duração, artwork)."""
        # Atualiza thumbnail
        self._thumb_photo = self._get_thumbnail()
        if self._thumb_label:
            self._thumb_label.config(image=self._thumb_photo)
        # Libera artwork_data da RAM (já está no cache em disco)
        self.track.artwork_data = None
        # Atualiza duração
        if self.track.duration > 0:
            self.timeline_slider.configure(to=max(self.track.duration, 0.1))
            self.time_total.config(text=self.track.format_time(self.track.duration))
        # Remove indicador de "carregando"
        if hasattr(self, '_loading_label') and self._loading_label:
            self._loading_label.config(text="")

    def _build(self):
        # ── Linha 1: Controles principais ──
        top_row = ttk.Frame(self)
        top_row.pack(fill="x", pady=(0, 3))

        # Thumbnail da artwork
        self._thumb_photo = self._get_thumbnail()
        self._thumb_label = ttk.Label(top_row, image=self._thumb_photo)
        self._thumb_label.pack(side="left", padx=(0, 8))

        # Libera artwork_data após criar thumbnail (está no cache em disco)
        if self.track.metadata_loaded:
            self.track.artwork_data = None

        # Nome do arquivo
        name_label = ttk.Label(top_row, text=self.track.file_name, width=30,
                               anchor="w", font=("Segoe UI", 9, "bold"))
        name_label.pack(side="left", padx=(0, 5))

        # Indicador de carregamento de metadados
        self._loading_label = ttk.Label(
            top_row,
            text="⏳" if not self.track.metadata_loaded else "",
            width=3, foreground=COLORS.get("text_muted", "gray")
        )
        self._loading_label.pack(side="left", padx=(0, 5))

        # Botão Play/Pause
        self.play_btn = ttk.Button(top_row, text="▶", width=3,
                                   command=self._toggle_play)
        self.play_btn.pack(side="left", padx=2)

        # Botão Stop
        stop_btn = ttk.Button(top_row, text="⏹", width=3, command=self._stop)
        stop_btn.pack(side="left", padx=2)

        # Loop checkbox
        self.loop_var = tk.BooleanVar(value=False)
        loop_cb = ttk.Checkbutton(top_row, text="Loop", variable=self.loop_var)
        loop_cb.pack(side="left", padx=5)

        # Volume slider
        ttk.Label(top_row, text="Vol:").pack(side="left", padx=(10, 2))
        self.volume_var = tk.DoubleVar(value=self.track.volume)
        volume_slider = ttk.Scale(
            top_row, from_=0.0, to=1.0, variable=self.volume_var,
            orient="horizontal", length=100, command=self._on_volume_change
        )
        volume_slider.pack(side="left", padx=2)

        self.vol_label = ttk.Label(top_row, text=f"{int(self.track.volume * 100)}%",
                                   width=4)
        self.vol_label.pack(side="left", padx=2)

        # Status
        self.status_label = ttk.Label(top_row, text="⏹ Parado", width=12,
                                      foreground="gray")
        self.status_label.pack(side="left", padx=5)

        # Botão Remover
        remove_btn = ttk.Button(top_row, text="✕", width=3, command=self._remove,
                                style="Danger.TButton")
        remove_btn.pack(side="right", padx=(10, 0))

        # Botão Efeitos
        self.fx_btn = ttk.Button(top_row, text="🎛 FX", width=5,
                                 command=self._toggle_effects)
        self.fx_btn.pack(side="right", padx=2)

        # ── Linha 2: Timeline / Seek ──
        timeline_row = ttk.Frame(self)
        timeline_row.pack(fill="x", pady=(0, 2))

        # Tempo atual
        self.time_current = ttk.Label(timeline_row, text="00:00", width=6,
                                      font=("Consolas", 9))
        self.time_current.pack(side="left", padx=(5, 3))

        # Slider de timeline
        self.timeline_var = tk.DoubleVar(value=0.0)
        self.timeline_slider = ttk.Scale(
            timeline_row, from_=0.0, to=max(self.track.duration, 0.1),
            variable=self.timeline_var, orient="horizontal",
            command=self._on_timeline_drag
        )
        self.timeline_slider.pack(side="left", fill="x", expand=True, padx=2)

        # Bind para detectar início e fim do drag
        self.timeline_slider.bind("<ButtonPress-1>", self._on_timeline_press)
        self.timeline_slider.bind("<ButtonRelease-1>", self._on_timeline_release)

        # Tempo total
        self.time_total = ttk.Label(
            timeline_row,
            text=self.track.format_time(self.track.duration),
            width=6, font=("Consolas", 9)
        )
        self.time_total.pack(side="left", padx=(3, 5))

        # ── Linha 3: Efeitos (colapsável) ──
        self._effects_frame = ttk.Frame(self)
        fx_inner = ttk.Frame(self._effects_frame, padding=(10, 5))
        fx_inner.pack(fill="x")

        ttk.Label(fx_inner, text="Velocidade:").pack(side="left", padx=(0, 5))
        self.speed_var = tk.DoubleVar(value=self.track.speed_factor)
        speed_scale = ttk.Scale(
            fx_inner, from_=0.5, to=2.0, variable=self.speed_var,
            orient="horizontal", length=120, command=self._on_speed_change
        )
        speed_scale.pack(side="left", padx=2)
        self.speed_label = ttk.Label(fx_inner,
                                     text=f"{self.track.speed_factor:.1f}x",
                                     width=4)
        self.speed_label.pack(side="left", padx=2)

        self.reverb_var = tk.BooleanVar(value=self.track.reverb_enabled)
        ttk.Checkbutton(fx_inner, text="Reverb",
                        variable=self.reverb_var).pack(side="left", padx=10)

        ttk.Button(fx_inner, text="✓ Aplicar",
                   command=self._apply_effects).pack(side="left", padx=5)
        ttk.Button(fx_inner, text="↺ Reset",
                   command=self._reset_effects).pack(side="left", padx=2)

    def _toggle_play(self):
        if self.track.is_paused:
            self.track.unpause()
        elif self.track.is_playing:
            self.track.pause()
        else:
            self.track.play(loop=self.loop_var.get())
        self._update_ui()

    def _stop(self):
        self.track.stop()
        self.timeline_var.set(0.0)
        self.time_current.config(text="00:00")
        self._update_ui()

    def _on_volume_change(self, _=None):
        vol = self.volume_var.get()
        self.track.set_volume(vol)
        self.vol_label.config(text=f"{int(vol * 100)}%")

    def _on_timeline_press(self, _=None):
        """Início do drag no slider de timeline."""
        self._seeking = True

    def _on_timeline_release(self, _=None):
        """Fim do drag no slider - aplica seek."""
        if self._seeking:
            position = self.timeline_var.get()
            self.track.seek(position)
            self._seeking = False
            self._update_ui()

    def _on_timeline_drag(self, _=None):
        """Chamado durante o drag do slider - atualiza label de tempo."""
        if self._seeking:
            pos = self.timeline_var.get()
            self.time_current.config(text=self.track.format_time(pos))

    def _remove(self):
        if self.on_remove:
            self.on_remove(self.track.track_id)

    def _update_ui(self):
        """Atualiza o estado visual dos botões e status (evita chamadas redundantes)."""
        if self.track.is_paused:
            new_state = "paused"
        elif self.track.is_active():
            new_state = "playing"
        else:
            new_state = "stopped"
            if self.track.is_playing:
                self.track.is_playing = False

        # Só atualiza UI se estado mudou (evita ~680 .config() desnecessários)
        if getattr(self, '_last_state', None) != new_state:
            self._last_state = new_state
            if new_state == "paused":
                self.play_btn.config(text="▶")
                self.status_label.config(text="⏸ Pausado", foreground="#f39c12")
            elif new_state == "playing":
                self.play_btn.config(text="⏸")
                self.status_label.config(text="♪ Tocando", foreground="#2ecc71")
            else:
                self.play_btn.config(text="▶")
                self.status_label.config(text="⏹ Parado", foreground="gray")

    def _toggle_effects(self):
        """Mostra/esconde painel de efeitos."""
        self._effects_visible = not self._effects_visible
        if self._effects_visible:
            self._effects_frame.pack(fill="x", pady=(0, 3))
            self.fx_btn.config(text="🎛 FX ▼")
        else:
            self._effects_frame.pack_forget()
            self.fx_btn.config(text="🎛 FX")

    def _on_speed_change(self, _=None):
        """Atualiza label de velocidade."""
        speed = self.speed_var.get()
        self.speed_label.config(text=f"{speed:.1f}x")

    def _apply_effects(self):
        """Aplica efeitos de áudio na faixa."""
        speed = self.speed_var.get()
        reverb = self.reverb_var.get()
        try:
            self.track.apply_effects(speed=speed, reverb=reverb)
            self.timeline_slider.configure(to=max(self.track.duration, 0.1))
            self.time_total.config(text=self.track.format_time(self.track.duration))
            self._update_ui()
        except Exception as e:
            messagebox.showerror("Erro", f"Erro ao aplicar efeitos: {e}")

    def _reset_effects(self):
        """Remove efeitos de áudio."""
        self.speed_var.set(1.0)
        self.reverb_var.set(False)
        self.speed_label.config(text="1.0x")
        self.track.reset_effects()
        self.timeline_slider.configure(to=max(self.track.duration, 0.1))
        self.time_total.config(text=self.track.format_time(self.track.duration))
        self._update_ui()

    def needs_update(self) -> bool:
        """Retorna True se este widget precisa de atualização periódica."""
        return self.track.is_playing or self.track.is_paused

    def update_status(self):
        """Atualiza status visual e timeline (chamado periodicamente)."""
        self._update_ui()

        # Atualiza timeline se não estiver em seek manual
        if not self._seeking:
            pos = self.track.get_position()
            self.timeline_var.set(pos)
            self.time_current.config(text=self.track.format_time(pos))

            # Detecta fim natural da música (não looping)
            if (self.track.is_playing and not self.track.is_paused
                    and not self.track.is_looping
                    and not self.track.is_active()):
                self.track.is_playing = False
                self.track._seek_offset = 0.0
                self.timeline_var.set(0.0)
                self.time_current.config(text="00:00")
                self._update_ui()  # Força update final para "Parado"


class AudioPanel(ttk.LabelFrame):
    """Painel principal de controle de áudio."""

    def __init__(self, parent, audio_manager: AudioManager):
        super().__init__(parent, text=" 🎵 Player de Áudio ", padding=10)
        self.audio_manager = audio_manager
        self.track_widgets: dict[int, TrackWidget] = {}
        self._metadata_queue: queue.Queue = queue.Queue()
        self._build()

    def restore_tracks(self):
        """Restaura widgets para faixas já carregadas no manager."""
        new_tracks = []
        for track in self.audio_manager.tracks.values():
            if track.track_id not in self.track_widgets:
                self._add_track_widget(track)
                if not track.metadata_loaded:
                    new_tracks.append(track)
        if new_tracks:
            self._start_metadata_loading(new_tracks)

    def _build(self):
        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", pady=(0, 10))

        add_btn = ttk.Button(toolbar, text="➕ Adicionar Música",
                             command=self._add_tracks, style="Accent.TButton")
        add_btn.pack(side="left", padx=2)

        pause_all_btn = ttk.Button(toolbar, text="⏸ Pausar Tudo",
                                   command=self._pause_all)
        pause_all_btn.pack(side="left", padx=2)

        stop_all_btn = ttk.Button(toolbar, text="⏹ Parar Tudo",
                                  command=self._stop_all)
        stop_all_btn.pack(side="left", padx=2)

        # Container com scroll para as faixas
        self.canvas = tk.Canvas(self, highlightthickness=0, bg=COLORS["bg"])
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.tracks_frame = ttk.Frame(self.canvas)

        self.tracks_frame.bind("<Configure>",
                               lambda e: self.canvas.configure(
                                   scrollregion=self.canvas.bbox("all")))
        self.canvas.create_window((0, 0), window=self.tracks_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Placeholder
        self.placeholder = ttk.Label(
            self.tracks_frame,
            text="Nenhuma música adicionada.\n"
                 "Clique em '➕ Adicionar Música' para começar.",
            foreground="gray", justify="center", padding=30
        )
        self.placeholder.pack()

    def _add_tracks(self):
        files = filedialog.askopenfilenames(
            title="Selecionar Músicas",
            filetypes=[
                ("Arquivos de Áudio", "*.mp3 *.wav *.ogg *.flac *.opus *.webm *.m4a"),
                ("MP3", "*.mp3"),
                ("WAV", "*.wav"),
                ("OGG/Opus", "*.ogg *.opus"),
                ("Todos", "*.*"),
            ]
        )
        if not files:
            return
        new_tracks = []
        for file_path in files:
            try:
                track = self.audio_manager.add_track(file_path)
                self._add_track_widget(track)
                new_tracks.append(track)
            except Exception as e:
                messagebox.showerror("Erro", str(e))
        if new_tracks:
            self._start_metadata_loading(new_tracks)

    def _start_metadata_loading(self, tracks: list[AudioTrack]):
        """Inicia carregamento de metadados em background."""
        def on_ready(track):
            self._metadata_queue.put(track.track_id)

        self.audio_manager.load_metadata_async(tracks, on_track_ready=on_ready)
        self._poll_metadata()

    def _poll_metadata(self):
        """Verifica se metadados ficaram prontas e atualiza widgets."""
        updated = False
        try:
            while True:
                track_id = self._metadata_queue.get_nowait()
                if track_id in self.track_widgets:
                    self.track_widgets[track_id].refresh_metadata()
                    updated = True
        except queue.Empty:
            pass
        # Continua verificando enquanto houver faixas sem metadata
        pending = any(not t.metadata_loaded
                      for t in self.audio_manager.tracks.values()
                      if t.track_id in self.track_widgets)
        if pending:
            self.after(100, self._poll_metadata)

    def _add_track_widget(self, track: AudioTrack):
        """Adiciona um widget de faixa à UI."""
        if self.placeholder.winfo_ismapped():
            self.placeholder.pack_forget()

        widget = TrackWidget(self.tracks_frame, track, on_remove=self._remove_track)
        widget.pack(fill="x", pady=2)
        self.track_widgets[track.track_id] = widget

    def _remove_track(self, track_id: int):
        """Remove uma faixa."""
        if track_id in self.track_widgets:
            self.track_widgets[track_id].destroy()
            del self.track_widgets[track_id]
        self.audio_manager.remove_track(track_id)

        if not self.track_widgets:
            self.placeholder.pack()

    def _pause_all(self):
        any_playing = any(t.is_playing and not t.is_paused
                         for t in self.audio_manager.tracks.values())
        if any_playing:
            self.audio_manager.pause_all()
        else:
            self.audio_manager.unpause_all()
        self._update_all_statuses()

    def _stop_all(self):
        self.audio_manager.stop_all()
        self._update_all_statuses()

    def _update_all_statuses(self):
        for widget in self.track_widgets.values():
            widget.update_status()

    def periodic_update(self):
        """Chamado periodicamente — só atualiza faixas ativas."""
        for widget in self.track_widgets.values():
            if widget.needs_update():
                widget.update_status()


class SfxPanel(ttk.LabelFrame):
    """Painel de efeitos sonoros (mesma funcionalidade do AudioPanel, para organização)."""

    def __init__(self, parent, audio_manager: AudioManager):
        super().__init__(parent, text=" 💥 Efeitos Sonoros ", padding=10)
        self.audio_manager = audio_manager
        self.track_widgets: dict[int, TrackWidget] = {}
        self._metadata_queue: queue.Queue = queue.Queue()
        self._build()

    def restore_tracks(self):
        """Restaura widgets para faixas já carregadas no manager."""
        new_tracks = []
        for track in self.audio_manager.tracks.values():
            if track.track_id not in self.track_widgets:
                self._add_track_widget(track)
                if not track.metadata_loaded:
                    new_tracks.append(track)
        if new_tracks:
            self._start_metadata_loading(new_tracks)

    def _build(self):
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", pady=(0, 10))

        add_btn = ttk.Button(toolbar, text="➕ Adicionar Efeito Sonoro",
                             command=self._add_tracks, style="Accent.TButton")
        add_btn.pack(side="left", padx=2)

        pause_all_btn = ttk.Button(toolbar, text="⏸ Pausar Tudo",
                                   command=self._pause_all)
        pause_all_btn.pack(side="left", padx=2)

        stop_all_btn = ttk.Button(toolbar, text="⏹ Parar Tudo",
                                  command=self._stop_all)
        stop_all_btn.pack(side="left", padx=2)

        self.canvas = tk.Canvas(self, highlightthickness=0, bg=COLORS["bg"])
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.tracks_frame = ttk.Frame(self.canvas)

        self.tracks_frame.bind("<Configure>",
                               lambda e: self.canvas.configure(
                                   scrollregion=self.canvas.bbox("all")))
        self.canvas.create_window((0, 0), window=self.tracks_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self.placeholder = ttk.Label(
            self.tracks_frame,
            text="Nenhum efeito sonoro adicionado.\n"
                 "Clique em '➕ Adicionar Efeito Sonoro' para começar.\n\n"
                 "Use esta aba para sons curtos como:\n"
                 "espadas, explosões, passos, portas, etc.",
            foreground="gray", justify="center", padding=30
        )
        self.placeholder.pack()

    def _add_tracks(self):
        files = filedialog.askopenfilenames(
            title="Selecionar Efeitos Sonoros",
            filetypes=[
                ("Arquivos de Áudio", "*.mp3 *.wav *.ogg *.flac *.opus *.webm *.m4a"),
                ("WAV", "*.wav"),
                ("MP3", "*.mp3"),
                ("OGG/Opus", "*.ogg *.opus"),
                ("Todos", "*.*"),
            ]
        )
        if not files:
            return
        new_tracks = []
        for file_path in files:
            try:
                track = self.audio_manager.add_track(file_path)
                self._add_track_widget(track)
                new_tracks.append(track)
            except Exception as e:
                messagebox.showerror("Erro", str(e))
        if new_tracks:
            self._start_metadata_loading(new_tracks)

    def _start_metadata_loading(self, tracks: list[AudioTrack]):
        """Inicia carregamento de metadados em background."""
        def on_ready(track):
            self._metadata_queue.put(track.track_id)

        self.audio_manager.load_metadata_async(tracks, on_track_ready=on_ready)
        self._poll_metadata()

    def _poll_metadata(self):
        """Verifica se metadados ficaram prontas e atualiza widgets."""
        try:
            while True:
                track_id = self._metadata_queue.get_nowait()
                if track_id in self.track_widgets:
                    self.track_widgets[track_id].refresh_metadata()
        except queue.Empty:
            pass
        pending = any(not t.metadata_loaded
                      for t in self.audio_manager.tracks.values()
                      if t.track_id in self.track_widgets)
        if pending:
            self.after(100, self._poll_metadata)

    def _add_track_widget(self, track: AudioTrack):
        if self.placeholder.winfo_ismapped():
            self.placeholder.pack_forget()
        widget = TrackWidget(self.tracks_frame, track, on_remove=self._remove_track)
        widget.pack(fill="x", pady=2)
        self.track_widgets[track.track_id] = widget

    def _remove_track(self, track_id: int):
        if track_id in self.track_widgets:
            self.track_widgets[track_id].destroy()
            del self.track_widgets[track_id]
        self.audio_manager.remove_track(track_id)
        if not self.track_widgets:
            self.placeholder.pack()

    def _pause_all(self):
        any_playing = any(t.is_playing and not t.is_paused
                         for t in self.audio_manager.tracks.values())
        if any_playing:
            self.audio_manager.pause_all()
        else:
            self.audio_manager.unpause_all()
        self._update_all_statuses()

    def _stop_all(self):
        self.audio_manager.stop_all()
        self._update_all_statuses()

    def _update_all_statuses(self):
        for widget in self.track_widgets.values():
            widget.update_status()

    def periodic_update(self):
        for widget in self.track_widgets.values():
            if widget.needs_update():
                widget.update_status()
