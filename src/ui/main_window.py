"""
DM - Dungeon Music
Janela principal do aplicativo.
Integra o painel de áudio, painel de imagens e janela de apresentação.
"""

import tkinter as tk
from tkinter import ttk, messagebox
import sys
import os
import json

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.audio_manager import AudioManager
from src.session_manager import SessionManager, AudioSessionManager
from src.network_manager import NetworkManager
from src.ui.audio_panel import AudioPanel, SfxPanel
from src.ui.image_panel import ImagePanel
from src.ui.canvas_window import PresentationCanvas
from src.ui.battlemap import BattleMapPanel
from src.ui.theme import apply_theme, COLORS, SUPPORTED_THEMES, current_theme
from src.ui.systems_panel import SystemsPanel
from src.ui.map_launcher import MapLauncherPanel as MapCreatorPanel
from src.ui.system_creator_panel import SystemCreatorPanel
from src.ui.network_panel import NetworkPanel
from src.i18n.translator import t, current_locale, SUPPORTED_LOCALES


class MainWindow:
    """Janela principal do DM - Dungeon Music."""

    APP_TITLE = "DM - Dungeon Music"
    APP_VERSION = "2.0.0"

    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"{self.APP_TITLE} v{self.APP_VERSION}")
        self.root.geometry("1100x750")
        self.root.minsize(900, 600)

        # Define ícone e tema
        self._setup_theme()

        # Gerenciadores
        self.audio_manager = AudioManager(channel_offset=0)
        self.sfx_manager = AudioManager(channel_offset=16)   # Canais 16-31 para SFX
        self.session_manager = SessionManager()
        self.network_manager = NetworkManager()


        # Estado para diff de áudio (broadcast multiplayer)
        self._last_playing_music: set[int] = set()
        self._last_playing_sfx: set[int] = set()
        self._player_window = None

        # Listeners de rede
        self.network_manager.add_status_listener(self._on_network_status)
        self.network_manager.add_message_listener(self._on_network_message)
        self.network_manager.add_player_joined_listener(self._on_player_joined)

        # Sessões de áudio (músicas e efeitos sonoros)
        self.music_session_mgr = AudioSessionManager(subfolder="music")
        self.sfx_session_mgr = AudioSessionManager(subfolder="sfx")

        # Caminhos de persistência (para migração de formato antigo)
        self._data_dir = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music")
        self._music_save = os.path.join(self._data_dir, "tracks_music.json")
        self._sfx_save = os.path.join(self._data_dir, "tracks_sfx.json")

        # Migração: formato antigo (lista plana) → sessões
        self.music_session_mgr.migrate_from_flat_file(self._music_save, "Padrão")
        self.sfx_session_mgr.migrate_from_flat_file(self._sfx_save, "Padrão")

        # Build da UI (painéis auto-carregam a primeira sessão)
        self._build_menu()
        self._build_ui()

        # Atualização periódica
        self._periodic_update()

        # Cleanup ao fechar
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _setup_theme(self):
        """Configura o tema visual dark moderno."""
        apply_theme(self.root)
        # Ícone da janela
        self._set_app_icon()

    def _set_app_icon(self):
        """Define o ícone da janela a partir do PNG."""
        try:
            from PIL import Image, ImageTk
            # Tenta vários caminhos possíveis
            icon_candidates = [
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
                    os.path.abspath(__file__)))), "DM-dungeoun-music.ico"),
                os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])),
                             "DM-dungeoun-music.ico"),
                os.path.join(os.getcwd(), "DM-dungeoun-music.ico"),
            ]
            for path in icon_candidates:
                if os.path.isfile(path):
                    img = Image.open(path)
                    self._icon_photo = ImageTk.PhotoImage(img)
                    self.root.iconphoto(True, self._icon_photo)
                    break
        except Exception:
            pass

    def _build_menu(self):
        """Constrói a barra de menu."""
        _mc = {
            "bg": COLORS["surface"], "fg": COLORS["text"],
            "activebackground": COLORS["primary"],
            "activeforeground": "#ffffff", "borderwidth": 0,
        }
        menubar = tk.Menu(self.root, **_mc)

        # Menu Arquivo
        file_menu = tk.Menu(menubar, tearoff=0, **_mc)
        file_menu.add_command(label=t("menu.file.exit"), command=self._on_close, accelerator="Alt+F4")
        menubar.add_cascade(label=t("menu.file.label"), menu=file_menu)

        # Menu Áudio
        audio_menu = tk.Menu(menubar, tearoff=0, **_mc)
        audio_menu.add_command(label=t("menu.audio.stop_all"),
                               command=lambda: self.audio_manager.stop_all())
        audio_menu.add_command(label=t("menu.audio.pause_all"),
                               command=lambda: self.audio_manager.pause_all())
        menubar.add_cascade(label=t("menu.audio.label"), menu=audio_menu)

        # Menu Apresentação
        pres_menu = tk.Menu(menubar, tearoff=0, **_mc)
        pres_menu.add_command(label=t("menu.presentation.black_bg"),
                              command=lambda: self._set_bg("#000000"))
        pres_menu.add_command(label=t("menu.presentation.dark_bg"),
                              command=lambda: self._set_bg("#1a1a2e"))
        pres_menu.add_command(label=t("menu.presentation.gray_bg"),
                              command=lambda: self._set_bg("#2d2d2d"))
        menubar.add_cascade(label=t("menu.presentation.label"), menu=pres_menu)

        # Menu Idioma
        lang_menu = tk.Menu(menubar, tearoff=0, **_mc)
        self._lang_var = tk.StringVar(value=current_locale())
        for code, display_name in SUPPORTED_LOCALES.items():
            lang_menu.add_radiobutton(
                label=display_name,
                variable=self._lang_var,
                value=code,
                command=lambda c=code: self._on_language_change(c),
            )
        menubar.add_cascade(label=t("menu.language.label"), menu=lang_menu)

        # Menu Tema
        theme_menu = tk.Menu(menubar, tearoff=0, **_mc)
        self._theme_var = tk.StringVar(value=current_theme())
        for code, display_name in SUPPORTED_THEMES.items():
            theme_menu.add_radiobutton(
                label=display_name,
                variable=self._theme_var,
                value=code,
                command=lambda c=code: self._on_theme_change(c),
            )
        menubar.add_cascade(label="🎨 Tema", menu=theme_menu)

        # Menu Ajuda
        help_menu = tk.Menu(menubar, tearoff=0, **_mc)
        help_menu.add_command(label=t("menu.help.about"), command=self._show_about)
        menubar.add_cascade(label=t("menu.help.label"), menu=help_menu)

        self.root.config(menu=menubar)

    def _build_ui(self):
        """Constrói a interface principal."""
        # Header
        header = ttk.Frame(self.root, padding=(15, 10))
        header.pack(fill="x")

        ttk.Label(header, text="⚔️ DM - Dungeon Music",
                  style="Title.TLabel").pack(side="left")

        ttk.Button(
            header, text="📖 O que é RPG?",
            command=self._show_about_rpg,
        ).pack(side="right", padx=(0, 4))

        # Separador
        ttk.Separator(self.root, orient="horizontal").pack(fill="x", padx=10)

        # Notebook (tabs)
        self.notebook = ttk.Notebook(self.root, padding=5)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=10)

        # Tab de Áudio
        audio_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(audio_tab, text=t("main.tabs.audio"))

        self.audio_panel = AudioPanel(audio_tab, self.audio_manager, self.music_session_mgr)
        self.audio_panel.pack(fill="both", expand=True)

        # Tab de Efeitos Sonoros
        sfx_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(sfx_tab, text=t("main.tabs.sfx"))

        self.sfx_panel = SfxPanel(sfx_tab, self.sfx_manager, self.sfx_session_mgr)
        self.sfx_panel.pack(fill="both", expand=True)

        # Tab de Imagens
        images_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(images_tab, text=t("main.tabs.images"))

        self.image_panel = ImagePanel(
            images_tab, self.session_manager,
            on_show_image=self._refresh_presentation
        )
        self.image_panel.pack(fill="both", expand=True)

        # Tab de Apresentação (canvas embutido)
        pres_tab = ttk.Frame(self.notebook, padding=0)
        self.notebook.add(pres_tab, text=t("main.tabs.presentation"))

        self.presentation_canvas = PresentationCanvas(pres_tab)
        self.presentation_canvas.pack(fill="both", expand=True)
        self.presentation_canvas.set_network_manager(self.network_manager)

        # Tab BattleMap
        bmap_tab = ttk.Frame(self.notebook, padding=0)
        self.notebook.add(bmap_tab, text="⚔ BattleMap")
        self.battlemap = BattleMapPanel(bmap_tab)
        self.battlemap.pack(fill="both", expand=True)
        self.battlemap.set_network_manager(self.network_manager)

        # Tab Online / Multiplayer
        online_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(online_tab, text=t("main.tabs.online"))
        NetworkPanel(online_tab, self.network_manager).pack(fill="both", expand=True)

        # Tab Criador de Mapas
        map_tab = ttk.Frame(self.notebook, padding=0)
        self.notebook.add(map_tab, text=t("main.tabs.map"))
        MapCreatorPanel(map_tab).pack(fill="both", expand=True)

        # Tab de Sistemas
        systems_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(systems_tab, text=t("main.tabs.systems"))
        SystemsPanel(systems_tab).pack(fill="both", expand=True)

        # Tab Crie seu Sistema
        create_tab = ttk.Frame(self.notebook, padding=0)
        self.notebook.add(create_tab, text=t("main.tabs.creator"))
        SystemCreatorPanel(create_tab).pack(fill="both", expand=True)

        # Tab Bibliotecas Opcionais — Em breve
        library_tab = ttk.Frame(self.notebook, padding=40)
        self.notebook.add(library_tab, text=t("main.tabs.library"))
        ttk.Label(
            library_tab,
            text="📦 Bibliotecas de Conteúdo",
            style="Title.TLabel",
        ).pack(pady=(60, 12))
        ttk.Label(
            library_tab,
            text="🚧  Em breve",
            font=("Segoe UI", 22, "bold"),
            foreground=COLORS["text_muted"],
        ).pack()
        ttk.Label(
            library_tab,
            text="Downloads de ícones, tokens, mapas e outros pacotes de conteúdo\nestão sendo preparados e estarão disponíveis em uma versão futura.",
            font=("Segoe UI", 11),
            foreground=COLORS["text_dim"],
            justify="center",
        ).pack(pady=(12, 0))

        # Barra de status
        status_bar = ttk.Frame(self.root, padding=(10, 5))
        status_bar.pack(fill="x", side="bottom")

        self.status_label = ttk.Label(
            status_bar,
            text=f"DM - Dungeon Music v{self.APP_VERSION} | "
                 + t("main.status.ready"),
            foreground="gray"
        )
        self.status_label.pack(side="left")

        track_info = ttk.Label(status_bar, text=t("main.status.tracks", count=0, playing=0), foreground="gray")
        track_info.pack(side="right")
        self._track_info_label = track_info

    def _refresh_presentation(self):
        """Atualiza o canvas de apresentação com as imagens visíveis."""
        session = self.image_panel.current_session
        self.presentation_canvas.display_session_images(session)
        if self.network_manager.is_hosting:
            canvas_state = self.presentation_canvas._serialize_canvas()
            self.network_manager.broadcast("canvas_update", {"images": canvas_state})

    def _set_bg(self, color: str):
        """Altera o fundo da apresentação."""
        self.presentation_canvas.set_background_color(color)

    def _periodic_update(self):
        """Atualização periódica de estados."""
        self.audio_panel.periodic_update()
        self.sfx_panel.periodic_update()

        # Atualiza contador de faixas
        count = len(self.audio_manager.tracks) + len(self.sfx_manager.tracks)
        playing = (sum(1 for t in self.audio_manager.tracks.values() if t.is_active())
                   + sum(1 for t in self.sfx_manager.tracks.values() if t.is_active()))
        self._track_info_label.config(text=t("main.status.tracks", count=count, playing=playing))

        # Broadcast mudanças de áudio para jogadores
        if self.network_manager.is_hosting:
            self._check_audio_changes()

        self.root.after(500, self._periodic_update)

    def _check_audio_changes(self):
        """Detecta mudanças de reprodução, faz broadcast e atualiza dirs HTTP."""
        now_music = {tid for tid, tr in self.audio_manager.tracks.items() if tr.is_active()}
        for tid in now_music - self._last_playing_music:
            tr = self.audio_manager.tracks.get(tid)
            if tr:
                # Atualiza dirs do HTTP server dinamicamente
                self.network_manager.add_audio_dir(os.path.dirname(tr.file_path))
                self.network_manager.broadcast("play_track", {
                    "filename": os.path.basename(tr.file_path),
                    "loop": tr.is_looping,
                    "volume": tr.volume,
                })
        for tid in self._last_playing_music - now_music:
            tr = self.audio_manager.tracks.get(tid)
            if tr:
                self.network_manager.broadcast("stop_track", {
                    "filename": os.path.basename(tr.file_path),
                })
        self._last_playing_music = now_music

        now_sfx = {tid for tid, tr in self.sfx_manager.tracks.items() if tr.is_active()}
        for tid in now_sfx - self._last_playing_sfx:
            tr = self.sfx_manager.tracks.get(tid)
            if tr:
                # Atualiza dirs do HTTP server dinamicamente
                self.network_manager.add_audio_dir(os.path.dirname(tr.file_path))
                self.network_manager.broadcast("sfx_play", {
                    "filename": os.path.basename(tr.file_path),
                    "volume": tr.volume,
                })
        self._last_playing_sfx = now_sfx

    # ── Multiplayer handlers ────────────────────────────────────────────────
    def _on_network_status(self, message: str):
        """Reage ao status da rede (ex: servidor iniciado → HTTP server)."""
        if "Hospedando em" in message:
            dirs = list({
                os.path.dirname(tr.file_path)
                for tr in list(self.audio_manager.tracks.values()) + list(self.sfx_manager.tracks.values())
                if os.path.isfile(getattr(tr, "file_path", ""))
            })
            self.network_manager.start_http_server(dirs, port=8766)

    def _on_network_message(self, payload: dict):
        """Processa mensagens recebidas pela rede."""
        event = payload.get("type")
        if event == "welcome":
            # Jogador se conectou com sucesso — abre visão de jogador
            self.root.after(0, self._open_player_window)
        elif event == "dice_roll" and self.network_manager.is_hosting:
            # Host re-transmite resultado para todos e exibe localmente
            self.network_manager.broadcast("dice_result", payload)
            self.root.after(0, lambda p=payload: self._handle_dice_result(p))
        elif event == "dice_result":
            # Resultado de dado recebido (quando jogando como cliente)
            self.root.after(0, lambda p=payload: self._handle_dice_result(p))

    def _on_player_joined(self, _player_id: str):
        """Envia estado atual ao jogador que acabou de entrar."""
        canvas_state = self.presentation_canvas._serialize_canvas()
        self.network_manager.broadcast("canvas_full_sync", {"images": canvas_state})
        # Envia estado do battlemap
        bmap_state = self.battlemap.serialize_state()
        self.network_manager.broadcast("battlemap_full_sync", bmap_state)
        # Broadcast de faixas atualmente tocando
        for tr in self.audio_manager.tracks.values():
            if tr.is_active():
                self.network_manager.broadcast("play_track", {
                    "filename": os.path.basename(tr.file_path),
                    "loop": tr.is_looping,
                    "volume": tr.volume,
                })

    def _open_player_window(self):
        """Abre janela de jogador após conexão bem-sucedida."""
        if self._player_window and self._player_window.winfo_exists():
            return
        from src.ui.player_window import PlayerWindow
        self._player_window = PlayerWindow(
            self.root,
            self.network_manager,
            AudioManager(channel_offset=32),
        )

    def _handle_dice_result(self, payload: dict):
        """Exibe resultado de dado no battlemap e adiciona ao histórico."""
        die = payload.get("die", "D20")
        mod = payload.get("modifier", 0)
        rolled = payload.get("rolled", 0)
        total = payload.get("total", 0)
        player = payload.get("player", "")
        self.battlemap.show_dice_overlay(die, mod, rolled, total, player)

    def _show_about_rpg(self):
        """Exibe popup explicativo sobre RPG e a história do projeto."""
        win = tk.Toplevel(self.root)
        win.title(t("rpg.dialog.title"))
        win.geometry("620x600")
        win.resizable(False, False)
        win.grab_set()

        frame = ttk.Frame(win, padding=20)
        frame.pack(fill="both", expand=True)

        ttk.Label(frame, text=t("rpg.dialog.title"), style="Title.TLabel").pack(anchor="w", pady=(0, 10))

        text = tk.Text(
            frame, wrap="word", height=26,
            font=("Segoe UI", 10), relief="flat",
            padx=10, pady=8,
        )
        text.pack(fill="both", expand=True)

        text.tag_configure("h", font=("Segoe UI", 11, "bold"), foreground=COLORS["primary_light"],
                           spacing1=10, spacing3=3)
        text.tag_configure("b", font=("Segoe UI", 10, "bold"))
        text.tag_configure("n", font=("Segoe UI", 10))

        content = [
            (t("rpg.what.title") + "\n", "h"),
            (t("rpg.what.body") + "\n\n", "n"),

            (t("rpg.how.title") + "\n", "h"),
            (t("rpg.how.1.label"), "b"), (t("rpg.how.1.text") + "\n", "n"),
            (t("rpg.how.2.label"), "b"), (t("rpg.how.2.text") + "\n", "n"),
            (t("rpg.how.3.label"), "b"), (t("rpg.how.3.text") + "\n", "n"),
            (t("rpg.how.4.label"), "b"), (t("rpg.how.4.text") + "\n", "n"),
            (t("rpg.how.5.label"), "b"), (t("rpg.how.5.text") + "\n\n", "n"),

            (t("rpg.vsvp.title") + "\n", "h"),
            (t("rpg.vsvp.physical.label"), "b"),
            (t("rpg.vsvp.physical.text") + "\n\n", "n"),
            (t("rpg.vsvp.virtual.label"), "b"),
            (t("rpg.vsvp.virtual.text") + "\n\n", "n"),

            (t("rpg.story.title") + "\n", "h"),
            (t("rpg.story.part1"), "n"),
            (t("rpg.story.mrpg"), "b"),
            (t("rpg.story.part2") + "\n", "n"),
        ]

        for chunk in content:
            text.insert("end", chunk[0], chunk[1])

        text.config(state="disabled")
        ttk.Button(frame, text=t("rpg.close"), command=win.destroy, style="Accent.TButton").pack(pady=(10, 0))

    def _show_about(self):
        """Mostra diálogo Sobre."""
        messagebox.showinfo(
            t("main.about.title"),
            t("main.about.body", version=self.APP_VERSION)
        )

    def _on_language_change(self, locale_code: str):
        """Salva preferência de idioma e avisa sobre reinício."""
        self._save_language_preference(locale_code)
        messagebox.showinfo(
            t("lang.restart_title"),
            t("lang.restart_body")
        )

    def _save_language_preference(self, locale_code: str):
        self._save_config_key("language", locale_code)

    def _on_theme_change(self, theme_code: str):
        """Salva preferência de tema e avisa sobre reinício."""
        self._save_config_key("theme", theme_code)
        messagebox.showinfo(
            t("theme.restart_title"),
            t("theme.restart_body"),
        )

    def _save_config_key(self, key: str, value: str):
        """Persiste uma chave genérica em config.json."""
        cfg_path = os.path.join(self._data_dir, "config.json")
        try:
            with open(cfg_path, encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
        cfg[key] = value
        os.makedirs(self._data_dir, exist_ok=True)
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

    def _on_close(self):
        """Limpeza ao fechar o aplicativo."""
        # Salva sessões de áudio atuais
        self.audio_panel.save_current_session()
        self.sfx_panel.save_current_session()
        # Salva cache de metadados
        from src.audio_manager import _save_cache
        _save_cache()
        # Encerra rede, se ativa
        try:
            self.network_manager.stop()
        except Exception:
            pass
        # Para todo o áudio de uma vez e fecha imediatamente
        try:
            import pygame
            pygame.mixer.stop()
        except Exception:
            pass
        self.root.destroy()

    def run(self):
        """Inicia o loop principal."""
        self.root.mainloop()
