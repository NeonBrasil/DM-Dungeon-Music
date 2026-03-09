"""
DM - Dungeon Music
Janela principal do aplicativo.
Integra o painel de áudio, painel de imagens e janela de apresentação.
"""

import tkinter as tk
from tkinter import ttk, messagebox
import sys
import os

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.audio_manager import AudioManager
from src.session_manager import SessionManager, AudioSessionManager
from src.ui.audio_panel import AudioPanel, SfxPanel
from src.ui.image_panel import ImagePanel
from src.ui.canvas_window import PresentationCanvas
from src.ui.theme import apply_theme, COLORS
from src.ui.systems_panel import SystemsPanel
from src.ui.map_panel import MapPanel as MapCreatorPanel
from src.ui.system_creator_panel import SystemCreatorPanel


class MainWindow:
    """Janela principal do DM - Dungeon Music."""

    APP_TITLE = "DM - Dungeon Music"
    APP_VERSION = "1.3.0"

    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"{self.APP_TITLE} v{self.APP_VERSION}")
        self.root.geometry("1100x750")
        self.root.minsize(900, 600)

        # Define ícone e tema
        self._setup_theme()

        # Gerenciadores
        self.audio_manager = AudioManager(channel_offset=0)
        self.sfx_manager = AudioManager(channel_offset=16)  # Canais 16-31 para SFX
        self.session_manager = SessionManager()

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
        file_menu.add_command(label="Sair", command=self._on_close, accelerator="Alt+F4")
        menubar.add_cascade(label="Arquivo", menu=file_menu)

        # Menu Áudio
        audio_menu = tk.Menu(menubar, tearoff=0, **_mc)
        audio_menu.add_command(label="Parar Todas as Músicas",
                               command=lambda: self.audio_manager.stop_all())
        audio_menu.add_command(label="Pausar Todas",
                               command=lambda: self.audio_manager.pause_all())
        menubar.add_cascade(label="Áudio", menu=audio_menu)

        # Menu Apresentação
        pres_menu = tk.Menu(menubar, tearoff=0, **_mc)
        pres_menu.add_command(label="Fundo Preto",
                              command=lambda: self._set_bg("#000000"))
        pres_menu.add_command(label="Fundo Escuro",
                              command=lambda: self._set_bg("#1a1a2e"))
        pres_menu.add_command(label="Fundo Cinza",
                              command=lambda: self._set_bg("#2d2d2d"))
        menubar.add_cascade(label="Apresentação", menu=pres_menu)

        # Menu Ajuda
        help_menu = tk.Menu(menubar, tearoff=0, **_mc)
        help_menu.add_command(label="Sobre", command=self._show_about)
        menubar.add_cascade(label="Ajuda", menu=help_menu)

        self.root.config(menu=menubar)

    def _build_ui(self):
        """Constrói a interface principal."""
        # Header
        header = ttk.Frame(self.root, padding=(15, 10))
        header.pack(fill="x")

        ttk.Label(header, text="⚔️ DM - Dungeon Music",
                  style="Title.TLabel").pack(side="left")

        # Separador
        ttk.Separator(self.root, orient="horizontal").pack(fill="x", padx=10)

        # Notebook (tabs)
        self.notebook = ttk.Notebook(self.root, padding=5)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=10)

        # Tab de Áudio
        audio_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(audio_tab, text=" 🎵 Áudio ")

        self.audio_panel = AudioPanel(audio_tab, self.audio_manager, self.music_session_mgr)
        self.audio_panel.pack(fill="both", expand=True)

        # Tab de Efeitos Sonoros
        sfx_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(sfx_tab, text=" 💥 Efeitos Sonoros ")

        self.sfx_panel = SfxPanel(sfx_tab, self.sfx_manager, self.sfx_session_mgr)
        self.sfx_panel.pack(fill="both", expand=True)

        # Tab de Imagens
        images_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(images_tab, text=" 🖼 Imagens & Sessões ")

        self.image_panel = ImagePanel(
            images_tab, self.session_manager,
            on_show_image=self._refresh_presentation
        )
        self.image_panel.pack(fill="both", expand=True)

        # Tab de Apresentação (canvas embutido)
        pres_tab = ttk.Frame(self.notebook, padding=0)
        self.notebook.add(pres_tab, text=" 🎬 Apresentação ")

        self.presentation_canvas = PresentationCanvas(pres_tab)
        self.presentation_canvas.pack(fill="both", expand=True)

        # Tab Criador de Mapas
        map_tab = ttk.Frame(self.notebook, padding=0)
        self.notebook.add(map_tab, text=" 🗺 Mapa ")
        MapCreatorPanel(map_tab).pack(fill="both", expand=True)

        # Tab de Sistemas
        systems_tab = ttk.Frame(self.notebook, padding=5)
        self.notebook.add(systems_tab, text=" ⚙ Sistemas ")
        SystemsPanel(systems_tab).pack(fill="both", expand=True)

        # Tab Crie seu Sistema
        create_tab = ttk.Frame(self.notebook, padding=0)
        self.notebook.add(create_tab, text=" 🛠 Crie seu Sistema ")
        SystemCreatorPanel(create_tab).pack(fill="both", expand=True)

        # Barra de status
        status_bar = ttk.Frame(self.root, padding=(10, 5))
        status_bar.pack(fill="x", side="bottom")

        self.status_label = ttk.Label(
            status_bar,
            text=f"DM - Dungeon Music v{self.APP_VERSION} | "
                 f"Pronto para a aventura!",
            foreground="gray"
        )
        self.status_label.pack(side="left")

        track_info = ttk.Label(status_bar, text="Faixas: 0", foreground="gray")
        track_info.pack(side="right")
        self._track_info_label = track_info

    def _refresh_presentation(self):
        """Atualiza o canvas de apresentação com as imagens visíveis."""
        session = self.image_panel.current_session
        self.presentation_canvas.display_session_images(session)

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
        self._track_info_label.config(text=f"Faixas: {count} | Tocando: {playing}")

        self.root.after(500, self._periodic_update)

    def _show_about(self):
        """Mostra diálogo Sobre."""
        messagebox.showinfo(
            "Sobre",
            f"⚔️ DM - Dungeon Music v{self.APP_VERSION}\n\n"
            "Software para Mestres de RPG.\n\n"
            "Funcionalidades:\n"
            "• Player de música com múltiplas faixas\n"
            "• Gerenciamento de imagens por sessão\n"
            "• Janela de apresentação com efeitos\n"
            "• Controle total do Mestre\n\n"
            "Compartilhe a janela de apresentação\n"
            "com seus jogadores via Discord, Zoom, etc."
        )

    def _on_close(self):
        """Limpeza ao fechar o aplicativo."""
        # Salva sessões de áudio atuais
        self.audio_panel.save_current_session()
        self.sfx_panel.save_current_session()
        # Salva cache de metadados
        from src.audio_manager import _save_cache
        _save_cache()
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
