"""
DM - Dungeon Music
Painel de controle de áudio com suporte a múltiplas faixas simultâneas.
Inclui timeline/seek para controle de posição da música.
"""

import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
from PIL import Image, ImageTk
import io
import queue
from src.audio_manager import AudioManager, AudioTrack
from src.ui.theme import COLORS
from src.i18n.translator import t


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
        loop_cb = ttk.Checkbutton(top_row, text=t("audio.track.loop"), variable=self.loop_var,
                                  command=self._on_loop_toggle)
        loop_cb.pack(side="left", padx=5)

        # Volume slider
        ttk.Label(top_row, text=t("audio.track.vol_label")).pack(side="left", padx=(10, 2))
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
        self.status_label = ttk.Label(top_row, text=t("audio.track.status_stopped"), width=12,
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

        ttk.Label(fx_inner, text=t("audio.fx.speed_label")).pack(side="left", padx=(0, 5))
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
        ttk.Checkbutton(fx_inner, text=t("audio.fx.reverb"),
                        variable=self.reverb_var).pack(side="left", padx=10)

        ttk.Button(fx_inner, text=t("audio.fx.apply"),
                   command=self._apply_effects).pack(side="left", padx=5)
        ttk.Button(fx_inner, text=t("audio.fx.reset"),
                   command=self._reset_effects).pack(side="left", padx=2)

    def _on_loop_toggle(self):
        """Ativado quando o checkbox de Loop muda. Atualiza flag sem interromper playback."""
        self.track.is_looping = self.loop_var.get()

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
                self.status_label.config(text=t("audio.track.status_paused"), foreground="#f39c12")
            elif new_state == "playing":
                self.play_btn.config(text="⏸")
                self.status_label.config(text=t("audio.track.status_playing"), foreground="#2ecc71")
            else:
                self.play_btn.config(text="▶")
                self.status_label.config(text=t("audio.track.status_stopped"), foreground="gray")

    def _toggle_effects(self):
        """Mostra/esconde painel de efeitos."""
        self._effects_visible = not self._effects_visible
        if self._effects_visible:
            self._effects_frame.pack(fill="x", pady=(0, 3))
            self.fx_btn.config(text=t("audio.fx.btn_open"))
        else:
            self._effects_frame.pack_forget()
            self.fx_btn.config(text=t("audio.fx.btn"))

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
            messagebox.showerror(t("audio.error.title"), t("audio.error.apply_effects", error=e))

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

            # Detecta fim natural da música
            if (self.track.is_playing and not self.track.is_paused
                    and not self.track.is_active()):
                if self.track.is_looping:
                    # Loop ativado após o início: reinicia sem fade
                    self.track._seek_offset = 0.0
                    self.track.play(loop=True)
                else:
                    self.track.is_playing = False
                    self.track._seek_offset = 0.0
                    self.timeline_var.set(0.0)
                    self.time_current.config(text="00:00")
                    self._update_ui()


class AudioPanel(ttk.LabelFrame):
    """Painel principal de controle de áudio com sessões."""

    def __init__(self, parent, audio_manager: AudioManager, audio_session_mgr=None):
        super().__init__(parent, text=t("audio.panel.title"), padding=10)
        self.audio_manager = audio_manager
        self.audio_session_mgr = audio_session_mgr
        self.track_widgets: dict[int, TrackWidget] = {}
        self._metadata_queue: queue.Queue = queue.Queue()
        self.current_session_name: str = ""
        self._pending_track_data: list = []
        self._pending_index: int = 0
        self._batch_size: int = 25
        self._search_text: str = ""
        self._build()
        if self.audio_session_mgr:
            self._refresh_sessions_list()

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
        # ── Session Toolbar ──
        session_frame = ttk.Frame(self)
        session_frame.pack(fill="x", pady=(0, 5))

        ttk.Label(session_frame, text=t("session.label")).pack(side="left", padx=(0, 5))
        self.session_var = tk.StringVar()
        self.session_combo = ttk.Combobox(
            session_frame, textvariable=self.session_var,
            state="readonly", width=25
        )
        self.session_combo.pack(side="left", padx=2)
        self.session_combo.bind("<<ComboboxSelected>>", self._on_session_selected)

        ttk.Button(session_frame, text=t("session.new_btn"),
                   command=self._new_session).pack(side="left", padx=2)
        ttk.Button(session_frame, text=t("session.import_btn"),
                   command=self._import_folder).pack(side="left", padx=2)
        ttk.Button(session_frame, text=t("session.delete_btn"),
                   command=self._delete_session).pack(side="left", padx=2)

        # ── Action Toolbar ──
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", pady=(0, 10))

        add_btn = ttk.Button(toolbar, text=t("audio.toolbar.add"),
                             command=self._add_tracks, style="Accent.TButton")
        add_btn.pack(side="left", padx=2)

        pause_all_btn = ttk.Button(toolbar, text=t("audio.toolbar.pause_all"),
                                   command=self._pause_all)
        pause_all_btn.pack(side="left", padx=2)

        stop_all_btn = ttk.Button(toolbar, text=t("audio.toolbar.stop_all"),
                                  command=self._stop_all)
        stop_all_btn.pack(side="left", padx=2)

        # Busca
        ttk.Label(toolbar, text="🔍").pack(side="left", padx=(15, 2))
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", self._on_search_changed)
        search_entry = ttk.Entry(toolbar, textvariable=self.search_var, width=20)
        search_entry.pack(side="left", padx=2)

        # Indicador de carregamento em lote
        self._batch_loading_label = ttk.Label(
            toolbar, text="", foreground=COLORS.get("text_muted", "gray")
        )
        self._batch_loading_label.pack(side="right", padx=5)

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

        # Mouse wheel scroll
        self.canvas.bind("<Enter>",
                         lambda e: self.canvas.bind_all("<MouseWheel>", self._on_mousewheel))
        self.canvas.bind("<Leave>",
                         lambda e: self.canvas.unbind_all("<MouseWheel>"))

        # Placeholder
        self.placeholder = ttk.Label(
            self.tracks_frame,
            text=t("audio.placeholder.no_session"),
            foreground="gray", justify="center", padding=30
        )
        self.placeholder.pack()

    def _on_mousewheel(self, event):
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    # ═══════════════════════════════════════
    # Gerenciamento de Sessões
    # ═══════════════════════════════════════

    def _refresh_sessions_list(self):
        """Atualiza a lista de sessões no combo."""
        if not self.audio_session_mgr:
            return
        sessions = self.audio_session_mgr.list_sessions()
        self.session_combo["values"] = sessions
        if sessions and not self.session_var.get():
            self.session_var.set(sessions[0])
            self._load_session(sessions[0])

    def _on_session_selected(self, _=None):
        self.save_current_session()
        name = self.session_var.get()
        if name:
            self._load_session(name)

    def _new_session(self):
        if not self.audio_session_mgr:
            return
        name = simpledialog.askstring(t("session.new_title"), t("audio.session.new_prompt"),
                                      parent=self)
        if name:
            self.save_current_session()
            self.audio_session_mgr.create_session(name)
            self._refresh_sessions_list()
            self.session_var.set(name)
            self._load_session(name)

    def _import_folder(self):
        if not self.audio_session_mgr:
            return
        folder = filedialog.askdirectory(title=t("audio.session.import_folder_title"))
        if folder:
            name = simpledialog.askstring(
                t("session.import_name_title"),
                t("session.import_name_prompt"),
                initialvalue=os.path.basename(folder),
                parent=self
            )
            if name:
                self.save_current_session()
                session = self.audio_session_mgr.import_folder(folder, name)
                if session:
                    self._refresh_sessions_list()
                    self.session_var.set(name)
                    self._load_session(name)
                else:
                    messagebox.showwarning(
                        t("audio.warning.title"), t("audio.session.no_audio_found")
                    )

    def _delete_session(self):
        if not self.audio_session_mgr:
            return
        name = self.session_var.get()
        if name:
            if messagebox.askyesno(t("session.delete_confirm_title"), t("session.delete_confirm_body", name=name)):
                self._clear_all_tracks()
                self.audio_session_mgr.delete_session(name)
                self.current_session_name = ""
                self.session_var.set("")
                self._refresh_sessions_list()
                self.placeholder.config(
                    text=t("audio.placeholder.no_session")
                )
                self.placeholder.pack()

    def _load_session(self, name: str):
        """Carrega uma sessão de áudio, criando widgets em lotes."""
        if not self.audio_session_mgr:
            return
        self._clear_all_tracks()
        self.current_session_name = name
        session = self.audio_session_mgr.get_session(name)

        if not session or not session.tracks:
            self.placeholder.config(
                text=t("audio.placeholder.no_tracks")
            )
            self.placeholder.pack()
            return

        # Filtra arquivos válidos
        valid = [trk for trk in session.tracks
                 if os.path.isfile(trk.get('file_path', ''))]
        if not valid:
            self.placeholder.config(text=t("audio.placeholder.no_valid_files"))
            self.placeholder.pack()
            return

        self.placeholder.pack_forget()
        self._pending_track_data = valid
        self._pending_index = 0
        if len(valid) > self._batch_size:
            self._batch_loading_label.config(
                text=t("audio.loading_progress", current=0, total=len(valid))
            )
        self._load_next_batch()

    def _load_next_batch(self):
        """Cria widgets em lotes para manter a UI responsiva."""
        start = self._pending_index
        total = len(self._pending_track_data)
        end = min(start + self._batch_size, total)

        new_tracks = []
        for i in range(start, end):
            item = self._pending_track_data[i]
            try:
                track = self.audio_manager.add_track(item['file_path'])
                track.set_volume(item.get('volume', 0.7))
                widget = self._add_track_widget(track)
                # Aplica filtro de busca
                if self._search_text and self._search_text not in track.file_name.lower():
                    widget.pack_forget()
                if not track.metadata_loaded:
                    new_tracks.append(track)
            except Exception as e:
                print(f"[DM] Erro ao carregar '{item.get('file_path', '')}': {e}")

        self._pending_index = end
        if new_tracks:
            self._start_metadata_loading(new_tracks)

        if self._pending_index < total:
            self._batch_loading_label.config(
                text=t("audio.loading_progress", current=end, total=total)
            )
            self.after(10, self._load_next_batch)
        else:
            self._batch_loading_label.config(text="")
            self._pending_track_data = []

    def _clear_all_tracks(self):
        """Remove todas as faixas e widgets."""
        for widget in self.track_widgets.values():
            widget.destroy()
        self.track_widgets.clear()
        self.audio_manager.clear_all()

    def save_current_session(self):
        """Salva as faixas atuais na sessão corrente."""
        if not self.current_session_name or not self.audio_session_mgr:
            return
        tracks_data = []
        for track in self.audio_manager.tracks.values():
            tracks_data.append({
                "file_path": track.file_path,
                "volume": track.volume
            })
        self.audio_session_mgr.save_session_tracks(
            self.current_session_name, tracks_data
        )

    # ═══════════════════════════════════════
    # Busca / Filtro
    # ═══════════════════════════════════════

    def _on_search_changed(self, *_args):
        self._search_text = self.search_var.get().strip().lower()
        self._apply_search_filter()

    def _apply_search_filter(self):
        """Mostra/esconde widgets baseado no filtro de busca."""
        for tid, widget in self.track_widgets.items():
            if not self._search_text or self._search_text in widget.track.file_name.lower():
                widget.pack(fill="x", pady=2)
            else:
                widget.pack_forget()

    # ═══════════════════════════════════════
    # Operações de Faixas
    # ═══════════════════════════════════════

    def _add_tracks(self):
        if not self.current_session_name:
            messagebox.showwarning(t("audio.warning.title"), t("audio.select_session_first"))
            return
        files = filedialog.askopenfilenames(
            title=t("audio.add_tracks_title"),
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
                messagebox.showerror(t("audio.error.title"), str(e))
        if new_tracks:
            self._start_metadata_loading(new_tracks)
            self.save_current_session()

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

    def _add_track_widget(self, track: AudioTrack) -> TrackWidget:
        """Adiciona um widget de faixa à UI."""
        if self.placeholder.winfo_ismapped():
            self.placeholder.pack_forget()

        widget = TrackWidget(self.tracks_frame, track, on_remove=self._remove_track)
        widget.pack(fill="x", pady=2)
        self.track_widgets[track.track_id] = widget
        return widget

    def _remove_track(self, track_id: int):
        """Remove uma faixa."""
        if track_id in self.track_widgets:
            self.track_widgets[track_id].destroy()
            del self.track_widgets[track_id]
        self.audio_manager.remove_track(track_id)

        if not self.track_widgets:
            self.placeholder.pack()
        self.save_current_session()

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
    """Painel de efeitos sonoros com sessões."""

    def __init__(self, parent, audio_manager: AudioManager, audio_session_mgr=None):
        super().__init__(parent, text=t("sfx.panel.title"), padding=10)
        self.audio_manager = audio_manager
        self.audio_session_mgr = audio_session_mgr
        self.track_widgets: dict[int, TrackWidget] = {}
        self._metadata_queue: queue.Queue = queue.Queue()
        self.current_session_name: str = ""
        self._pending_track_data: list = []
        self._pending_index: int = 0
        self._batch_size: int = 25
        self._search_text: str = ""
        self._build()
        if self.audio_session_mgr:
            self._refresh_sessions_list()

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
        # ── Session Toolbar ──
        session_frame = ttk.Frame(self)
        session_frame.pack(fill="x", pady=(0, 5))

        ttk.Label(session_frame, text=t("session.label")).pack(side="left", padx=(0, 5))
        self.session_var = tk.StringVar()
        self.session_combo = ttk.Combobox(
            session_frame, textvariable=self.session_var,
            state="readonly", width=25
        )
        self.session_combo.pack(side="left", padx=2)
        self.session_combo.bind("<<ComboboxSelected>>", self._on_session_selected)

        ttk.Button(session_frame, text=t("session.new_btn"),
                   command=self._new_session).pack(side="left", padx=2)
        ttk.Button(session_frame, text=t("session.import_btn"),
                   command=self._import_folder).pack(side="left", padx=2)
        ttk.Button(session_frame, text=t("session.delete_btn"),
                   command=self._delete_session).pack(side="left", padx=2)

        # ── Action Toolbar ──
        toolbar = ttk.Frame(self)
        toolbar.pack(fill="x", pady=(0, 10))

        add_btn = ttk.Button(toolbar, text=t("sfx.toolbar.add"),
                             command=self._add_tracks, style="Accent.TButton")
        add_btn.pack(side="left", padx=2)

        pause_all_btn = ttk.Button(toolbar, text=t("audio.toolbar.pause_all"),
                                   command=self._pause_all)
        pause_all_btn.pack(side="left", padx=2)

        stop_all_btn = ttk.Button(toolbar, text=t("audio.toolbar.stop_all"),
                                  command=self._stop_all)
        stop_all_btn.pack(side="left", padx=2)

        # Busca
        ttk.Label(toolbar, text="🔍").pack(side="left", padx=(15, 2))
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", self._on_search_changed)
        search_entry = ttk.Entry(toolbar, textvariable=self.search_var, width=20)
        search_entry.pack(side="left", padx=2)

        # Indicador de carregamento em lote
        self._batch_loading_label = ttk.Label(
            toolbar, text="", foreground=COLORS.get("text_muted", "gray")
        )
        self._batch_loading_label.pack(side="right", padx=5)

        # Container com scroll
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

        # Mouse wheel scroll
        self.canvas.bind("<Enter>",
                         lambda e: self.canvas.bind_all("<MouseWheel>", self._on_mousewheel))
        self.canvas.bind("<Leave>",
                         lambda e: self.canvas.unbind_all("<MouseWheel>"))

        # Placeholder
        self.placeholder = ttk.Label(
            self.tracks_frame,
            text=t("sfx.placeholder.no_session"),
            foreground="gray", justify="center", padding=30
        )
        self.placeholder.pack()

    def _on_mousewheel(self, event):
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    # ═══════════════════════════════════════
    # Gerenciamento de Sessões
    # ═══════════════════════════════════════

    def _refresh_sessions_list(self):
        if not self.audio_session_mgr:
            return
        sessions = self.audio_session_mgr.list_sessions()
        self.session_combo["values"] = sessions
        if sessions and not self.session_var.get():
            self.session_var.set(sessions[0])
            self._load_session(sessions[0])

    def _on_session_selected(self, _=None):
        self.save_current_session()
        name = self.session_var.get()
        if name:
            self._load_session(name)

    def _new_session(self):
        if not self.audio_session_mgr:
            return
        name = simpledialog.askstring(t("session.new_title"), t("sfx.session.new_prompt"),
                                      parent=self)
        if name:
            self.save_current_session()
            self.audio_session_mgr.create_session(name)
            self._refresh_sessions_list()
            self.session_var.set(name)
            self._load_session(name)

    def _import_folder(self):
        if not self.audio_session_mgr:
            return
        folder = filedialog.askdirectory(title=t("sfx.session.import_folder_title"))
        if folder:
            name = simpledialog.askstring(
                t("session.import_name_title"),
                t("session.import_name_prompt"),
                initialvalue=os.path.basename(folder),
                parent=self
            )
            if name:
                self.save_current_session()
                session = self.audio_session_mgr.import_folder(folder, name)
                if session:
                    self._refresh_sessions_list()
                    self.session_var.set(name)
                    self._load_session(name)
                else:
                    messagebox.showwarning(
                        t("audio.warning.title"), t("audio.session.no_audio_found")
                    )

    def _delete_session(self):
        if not self.audio_session_mgr:
            return
        name = self.session_var.get()
        if name:
            if messagebox.askyesno(t("session.delete_confirm_title"), t("session.delete_confirm_body", name=name)):
                self._clear_all_tracks()
                self.audio_session_mgr.delete_session(name)
                self.current_session_name = ""
                self.session_var.set("")
                self._refresh_sessions_list()
                self.placeholder.config(
                    text=t("sfx.placeholder.no_session")
                )
                self.placeholder.pack()

    def _load_session(self, name: str):
        if not self.audio_session_mgr:
            return
        self._clear_all_tracks()
        self.current_session_name = name
        session = self.audio_session_mgr.get_session(name)

        if not session or not session.tracks:
            self.placeholder.config(
                text=t("sfx.placeholder.no_tracks")
            )
            self.placeholder.pack()
            return

        valid = [trk for trk in session.tracks
                 if os.path.isfile(trk.get('file_path', ''))]
        if not valid:
            self.placeholder.config(text=t("audio.placeholder.no_valid_files"))
            self.placeholder.pack()
            return

        self.placeholder.pack_forget()
        self._pending_track_data = valid
        self._pending_index = 0
        if len(valid) > self._batch_size:
            self._batch_loading_label.config(
                text=t("audio.loading_progress", current=0, total=len(valid))
            )
        self._load_next_batch()

    def _load_next_batch(self):
        start = self._pending_index
        total = len(self._pending_track_data)
        end = min(start + self._batch_size, total)

        new_tracks = []
        for i in range(start, end):
            item = self._pending_track_data[i]
            try:
                track = self.audio_manager.add_track(item['file_path'])
                track.set_volume(item.get('volume', 0.7))
                widget = self._add_track_widget(track)
                if self._search_text and self._search_text not in track.file_name.lower():
                    widget.pack_forget()
                if not track.metadata_loaded:
                    new_tracks.append(track)
            except Exception as e:
                print(f"[DM] Erro ao carregar '{item.get('file_path', '')}': {e}")

        self._pending_index = end
        if new_tracks:
            self._start_metadata_loading(new_tracks)

        if self._pending_index < total:
            self._batch_loading_label.config(
                text=t("audio.loading_progress", current=end, total=total)
            )
            self.after(10, self._load_next_batch)
        else:
            self._batch_loading_label.config(text="")
            self._pending_track_data = []

    def _clear_all_tracks(self):
        for widget in self.track_widgets.values():
            widget.destroy()
        self.track_widgets.clear()
        self.audio_manager.clear_all()

    def save_current_session(self):
        if not self.current_session_name or not self.audio_session_mgr:
            return
        tracks_data = []
        for track in self.audio_manager.tracks.values():
            tracks_data.append({
                "file_path": track.file_path,
                "volume": track.volume
            })
        self.audio_session_mgr.save_session_tracks(
            self.current_session_name, tracks_data
        )

    # ═══════════════════════════════════════
    # Busca / Filtro
    # ═══════════════════════════════════════

    def _on_search_changed(self, *_args):
        self._search_text = self.search_var.get().strip().lower()
        self._apply_search_filter()

    def _apply_search_filter(self):
        for tid, widget in self.track_widgets.items():
            if not self._search_text or self._search_text in widget.track.file_name.lower():
                widget.pack(fill="x", pady=2)
            else:
                widget.pack_forget()

    # ═══════════════════════════════════════
    # Operações de Faixas
    # ═══════════════════════════════════════

    def _add_tracks(self):
        if not self.current_session_name:
            messagebox.showwarning(t("audio.warning.title"), t("audio.select_session_first"))
            return
        files = filedialog.askopenfilenames(
            title=t("sfx.toolbar.add"),
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
                messagebox.showerror(t("audio.error.title"), str(e))
        if new_tracks:
            self._start_metadata_loading(new_tracks)
            self.save_current_session()

    def _start_metadata_loading(self, tracks: list[AudioTrack]):
        def on_ready(track):
            self._metadata_queue.put(track.track_id)

        self.audio_manager.load_metadata_async(tracks, on_track_ready=on_ready)
        self._poll_metadata()

    def _poll_metadata(self):
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

    def _add_track_widget(self, track: AudioTrack) -> TrackWidget:
        if self.placeholder.winfo_ismapped():
            self.placeholder.pack_forget()
        widget = TrackWidget(self.tracks_frame, track, on_remove=self._remove_track)
        widget.pack(fill="x", pady=2)
        self.track_widgets[track.track_id] = widget
        return widget

    def _remove_track(self, track_id: int):
        if track_id in self.track_widgets:
            self.track_widgets[track_id].destroy()
            del self.track_widgets[track_id]
        self.audio_manager.remove_track(track_id)
        if not self.track_widgets:
            self.placeholder.pack()
        self.save_current_session()

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
