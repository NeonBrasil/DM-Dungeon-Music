"""
DM - Dungeon Music
Painel de Bibliotecas Opcionais.
Permite baixar e instalar pacotes de conteúdo (ícones, tokens, mapas).
"""

import tkinter as tk
from tkinter import ttk, messagebox

from src.ui.theme import COLORS
from src.i18n.translator import t
from src.library_manager import LibraryManager, PackInfo


class _PackCard(ttk.Frame):
    """Card visual para um pacote de conteúdo."""

    def __init__(self, parent, pack: PackInfo, is_installed: bool,
                 on_install, on_uninstall, **kwargs):
        super().__init__(parent, padding=10, **kwargs)
        self._pack = pack
        self._on_install = on_install
        self._on_uninstall = on_uninstall
        self._progress_var = tk.IntVar(value=0)
        self._build(is_installed)

    def _build(self, is_installed: bool):
        # Borda visual
        self.configure(style="Card.TFrame")

        # Layout: thumbnail à esquerda, info à direita
        left = ttk.Frame(self, padding=(0, 0, 12, 0))
        left.pack(side="left", fill="y")

        right = ttk.Frame(self)
        right.pack(side="left", fill="both", expand=True)

        # Thumbnail placeholder (colorido por categoria)
        _cat_colors = {
            "icons": "#6a4c93",
            "tokens": "#1982c4",
            "maps": "#2dc653",
            "misc": "#ff595e",
        }
        color = _cat_colors.get(self._pack.category, COLORS["primary"])
        try:
            from PIL import Image, ImageTk
            if self._pack.thumbnail_url:
                raise NotImplementedError  # sem download de thumb por ora
            img = Image.new("RGB", (72, 72), color)
            self._thumb = ImageTk.PhotoImage(img)
            ttk.Label(left, image=self._thumb).pack()
        except Exception:
            ttk.Label(
                left, text="📦", font=("Segoe UI", 28),
                foreground=color, background=COLORS["bg"]
            ).pack(pady=8)

        # Nome
        ttk.Label(
            right, text=self._pack.name,
            font=("Segoe UI", 11, "bold"),
        ).pack(anchor="w")

        # Meta: categoria · tamanho · licença
        meta = f"{self._pack.category.capitalize()}  ·  " \
               f"{t('library.card.size', size_mb=self._pack.size_mb)}  ·  " \
               f"{t('library.card.license', license=self._pack.license)}"
        ttk.Label(
            right, text=meta,
            foreground=COLORS["text_muted"],
            font=("Segoe UI", 9),
        ).pack(anchor="w")

        if self._pack.image_count:
            ttk.Label(
                right,
                text=f"{self._pack.image_count} imagens",
                foreground=COLORS["text_muted"],
                font=("Segoe UI", 9),
            ).pack(anchor="w")

        # Descrição
        ttk.Label(
            right, text=self._pack.description,
            wraplength=420, justify="left",
            font=("Segoe UI", 10),
        ).pack(anchor="w", pady=(4, 6))

        # Progress bar (oculta por padrão)
        self._progress_frame = ttk.Frame(right)
        self._progress_frame.pack(fill="x", pady=(0, 4))

        self._progress_bar = ttk.Progressbar(
            self._progress_frame,
            variable=self._progress_var,
            maximum=100,
            length=300,
        )
        self._progress_label = ttk.Label(
            self._progress_frame,
            text="",
            foreground=COLORS["text_muted"],
            font=("Segoe UI", 9),
        )
        # Oculto inicialmente
        self._hide_progress()

        # Botões
        self._btn_frame = ttk.Frame(right)
        self._btn_frame.pack(anchor="w")

        self._btn_install = ttk.Button(
            self._btn_frame,
            text=t("library.card.btn_install"),
            style="Accent.TButton",
            command=lambda: self._on_install(self._pack, self),
        )
        self._badge_installed = ttk.Label(
            self._btn_frame,
            text=t("library.card.installed_badge"),
            foreground=COLORS["success"],
            font=("Segoe UI", 10, "bold"),
        )
        self._btn_uninstall = ttk.Button(
            self._btn_frame,
            text=t("library.card.btn_uninstall"),
            style="Danger.TButton",
            command=lambda: self._on_uninstall(self._pack, self),
        )

        if is_installed:
            self.mark_installed()
        else:
            self.mark_uninstalled()

    # ------------------------------------------------------------------ #
    #  Estado visual                                                        #
    # ------------------------------------------------------------------ #

    def mark_installed(self):
        self._btn_install.pack_forget()
        self._badge_installed.pack(side="left", padx=(0, 8))
        self._btn_uninstall.pack(side="left")
        self._hide_progress()

    def mark_uninstalled(self):
        self._badge_installed.pack_forget()
        self._btn_uninstall.pack_forget()
        self._btn_install.pack(side="left")
        self._btn_install.configure(state="normal")
        self._hide_progress()

    def reset_to_install_state(self):
        self.mark_uninstalled()

    def set_progress(self, percent: int):
        self._progress_var.set(percent)
        self._progress_label.configure(text=f"{percent}%")

    def start_progress(self):
        self._btn_install.configure(state="disabled")
        self._progress_bar.pack(fill="x")
        self._progress_label.pack(anchor="w")

    def _hide_progress(self):
        self._progress_bar.pack_forget()
        self._progress_label.pack_forget()


class LibraryPanel(ttk.Frame):
    """Painel de Bibliotecas Opcionais."""

    def __init__(self, parent, library_manager: LibraryManager,
                 session_manager, on_session_added=None, **kwargs):
        super().__init__(parent, **kwargs)
        self._mgr = library_manager
        self._session_mgr = session_manager
        self._on_session_added = on_session_added
        self._all_packs: list[PackInfo] = []
        self._cards: list[_PackCard] = []
        self._build()
        # Carrega catálogo automaticamente ao abrir
        self.after(100, self._refresh_catalog)

    # ------------------------------------------------------------------ #
    #  Construção do layout                                                #
    # ------------------------------------------------------------------ #

    def _build(self):
        # Canvas scrollável (mesmo padrão de SystemsPanel)
        canvas = tk.Canvas(self, bg=COLORS["bg"], highlightthickness=0)
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)

        self._scroll_frame = ttk.Frame(canvas)
        frame_id = canvas.create_window((0, 0), window=self._scroll_frame, anchor="nw")

        def _on_frame_configure(e):
            canvas.configure(scrollregion=canvas.bbox("all"))

        def _on_canvas_configure(e):
            canvas.itemconfig(frame_id, width=e.width)

        self._scroll_frame.bind("<Configure>", _on_frame_configure)
        canvas.bind("<Configure>", _on_canvas_configure)
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.bind("<Enter>", lambda _e: canvas.bind_all(
            "<MouseWheel>",
            lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units")
        ))
        canvas.bind("<Leave>", lambda _e: canvas.unbind_all("<MouseWheel>"))

        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        f = self._scroll_frame
        self._build_header(f)
        self._build_filter_bar(f)
        ttk.Separator(f, orient="horizontal").pack(fill="x", padx=20, pady=(0, 10))
        self._cards_container = ttk.Frame(f, padding=(20, 0))
        self._cards_container.pack(fill="both", expand=True)

    def _build_header(self, parent):
        header = ttk.Frame(parent, padding=(20, 20, 20, 8))
        header.pack(fill="x")

        ttk.Label(
            header,
            text=t("library.header.title"),
            font=("Segoe UI", 18, "bold"),
            foreground=COLORS["accent"],
        ).pack(side="left")

        self._status_label = ttk.Label(
            header,
            text="",
            foreground=COLORS["text_muted"],
            font=("Segoe UI", 9),
        )
        self._status_label.pack(side="right", padx=(0, 4))

        ttk.Label(
            parent,
            text=t("library.header.subtitle"),
            foreground=COLORS["text_muted"],
            font=("Segoe UI", 10),
            padding=(20, 0, 20, 10),
        ).pack(anchor="w")

    def _build_filter_bar(self, parent):
        bar = ttk.Frame(parent, padding=(20, 0, 20, 10))
        bar.pack(fill="x")

        ttk.Label(bar, text=t("library.filter.label")).pack(side="left", padx=(0, 6))

        self._filter_var = tk.StringVar(value="all")
        categories = ["all", "icons", "tokens", "maps", "misc"]
        display = [t(f"library.filter.{c}") for c in categories]
        self._cat_map = dict(zip(display, categories))

        self._filter_combo = ttk.Combobox(
            bar,
            values=display,
            textvariable=tk.StringVar(value=display[0]),
            state="readonly",
            width=14,
        )
        self._filter_combo.current(0)
        self._filter_combo.pack(side="left", padx=(0, 10))
        self._filter_combo.bind("<<ComboboxSelected>>", lambda _e: self._apply_filter())

        ttk.Button(
            bar,
            text=t("library.btn.refresh"),
            command=self._refresh_catalog,
        ).pack(side="left")

    # ------------------------------------------------------------------ #
    #  Catálogo                                                            #
    # ------------------------------------------------------------------ #

    def _refresh_catalog(self):
        self._status_label.configure(text=t("library.status.loading"))
        self._mgr.load_catalog(self._on_catalog_loaded)

    def _on_catalog_loaded(self, packs: list, is_online: bool):
        # Precisa voltar para a main thread
        self.after(0, lambda: self._apply_catalog(packs, is_online))

    def _apply_catalog(self, packs: list, is_online: bool):
        self._all_packs = packs
        count = len(packs)
        if is_online:
            self._status_label.configure(
                text=t("library.status.online", count=count)
            )
        else:
            self._status_label.configure(text=t("library.status.offline"))
        self._apply_filter()

    def _apply_filter(self):
        selected_display = self._filter_combo.get()
        cat = self._cat_map.get(selected_display, "all")

        if cat == "all":
            filtered = self._all_packs
        else:
            filtered = [p for p in self._all_packs if p.category == cat]

        # Remove cards antigos
        for card in self._cards:
            card.destroy()
        self._cards.clear()

        if not filtered:
            ttk.Label(
                self._cards_container,
                text=t("library.catalog.no_packs"),
                foreground=COLORS["text_muted"],
                font=("Segoe UI", 10),
            ).pack(pady=20)
            return

        for pack in filtered:
            sep = ttk.Separator(self._cards_container, orient="horizontal")
            sep.pack(fill="x", pady=(0, 6))
            card = _PackCard(
                self._cards_container,
                pack=pack,
                is_installed=self._mgr.is_installed(pack.id),
                on_install=self._on_install,
                on_uninstall=self._on_uninstall,
            )
            card.pack(fill="x", pady=(0, 4))
            self._cards.append(card)

        # Separador final
        ttk.Separator(self._cards_container, orient="horizontal").pack(fill="x", pady=(0, 20))

    # ------------------------------------------------------------------ #
    #  Instalação                                                          #
    # ------------------------------------------------------------------ #

    def _on_install(self, pack: PackInfo, card: _PackCard):
        card.start_progress()

        def _progress(pct):
            self.after(0, lambda p=pct: card.set_progress(p))

        def _done(ok, err):
            self.after(0, lambda: self._on_install_done(pack, card, ok, err))

        self._mgr.install_pack(pack, _progress, _done)

    def _on_install_done(self, pack: PackInfo, card: _PackCard, ok: bool, err: str):
        if ok:
            card.mark_installed()
            self._register_session(pack)
            if self._on_session_added:
                try:
                    self._on_session_added()
                except Exception:
                    pass
        else:
            card.reset_to_install_state()
            messagebox.showerror(
                t("library.install.error_title"),
                t("library.install.error_body", name=pack.name, error=err),
            )

    # ------------------------------------------------------------------ #
    #  Desinstalação                                                       #
    # ------------------------------------------------------------------ #

    def _on_uninstall(self, pack: PackInfo, card: _PackCard):
        if not messagebox.askyesno(
            t("library.uninstall.confirm_title"),
            t("library.uninstall.confirm_body", name=pack.name),
        ):
            return

        # Remove sessão de imagens se existir
        if self._session_mgr.get_session(pack.name):
            self._session_mgr.delete_session(pack.name)
            if self._on_session_added:
                try:
                    self._on_session_added()
                except Exception:
                    pass

        self._mgr.uninstall_pack(pack.id)
        card.mark_uninstalled()

    # ------------------------------------------------------------------ #
    #  Integração com SessionManager                                       #
    # ------------------------------------------------------------------ #

    def _register_session(self, pack: PackInfo):
        """Importa conteúdo instalado como sessão de imagens."""
        install_path = self._mgr.get_install_path(pack.id)
        if not install_path:
            return
        try:
            self._session_mgr.import_folder_as_session(install_path, pack.name)
        except Exception:
            pass
