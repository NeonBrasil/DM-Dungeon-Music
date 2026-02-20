"""
DM - Dungeon Music
Painel de gerenciamento de imagens e sessões.
"""

import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
from PIL import Image, ImageTk
from src.session_manager import SessionManager, Session, ImageItem
from src.ui.theme import COLORS


class ImagePreview(ttk.Frame):
    """Widget de preview de uma imagem com controles."""

    THUMB_SIZE = (120, 90)

    def __init__(self, parent, image_item: ImageItem, index: int,
                 on_toggle_visibility=None, on_edit_stats=None, on_remove=None):
        super().__init__(parent, padding=5, relief="groove", borderwidth=1)
        self.image_item = image_item
        self.index = index
        self.on_toggle_visibility = on_toggle_visibility
        self.on_edit_stats = on_edit_stats
        self.on_remove = on_remove
        self.photo = None
        self._build()

    def _build(self):
        # Thumbnail
        try:
            img = Image.open(self.image_item.file_path)
            img.thumbnail(self.THUMB_SIZE)
            self.photo = ImageTk.PhotoImage(img)
            thumb_label = ttk.Label(self, image=self.photo)
        except Exception:
            thumb_label = ttk.Label(self, text="[Sem\nPreview]", width=15,
                                   anchor="center", foreground="gray")
        thumb_label.grid(row=0, column=0, rowspan=3, padx=(0, 10))

        # Nome
        name_label = ttk.Label(self, text=self.image_item.name, font=("", 10, "bold"))
        name_label.grid(row=0, column=1, sticky="w")

        # Stats (se houver)
        if self.image_item.stats:
            stats_text = " | ".join(f"{k}: {v}" for k, v in self.image_item.stats.items())
            stats_label = ttk.Label(self, text=stats_text, foreground="gray")
            stats_label.grid(row=1, column=1, sticky="w")

        # Controles
        controls = ttk.Frame(self)
        controls.grid(row=2, column=1, sticky="w", pady=(5, 0))

        # Visibilidade
        vis_text = "👁 Visível" if self.image_item.visible else "👁‍🗨 Oculto"
        vis_color = "#2ecc71" if self.image_item.visible else "gray"
        self.vis_btn = ttk.Button(controls, text=vis_text,
                                  command=lambda: self.on_toggle_visibility(self.index)
                                  if self.on_toggle_visibility else None)
        self.vis_btn.pack(side="left", padx=2)

        # Editar Stats
        edit_btn = ttk.Button(controls, text="📊 Stats",
                              command=lambda: self.on_edit_stats(self.index)
                              if self.on_edit_stats else None)
        edit_btn.pack(side="left", padx=2)

        # Remover
        rem_btn = ttk.Button(controls, text="✕ Remover",
                             command=lambda: self.on_remove(self.index)
                             if self.on_remove else None)
        rem_btn.pack(side="left", padx=2)


class StatsDialog(tk.Toplevel):
    """Diálogo para editar stats de um item."""

    def __init__(self, parent, image_item: ImageItem):
        super().__init__(parent)
        self.title(f"Stats - {image_item.name}")
        self.geometry("400x350")
        self.configure(bg=COLORS["bg"])
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        self.image_item = image_item
        self.result = None
        self._build()

    def _build(self):
        main = ttk.Frame(self, padding=15)
        main.pack(fill="both", expand=True)

        ttk.Label(main, text="Editar Atributos do Item",
                  font=("", 12, "bold")).pack(pady=(0, 10))
        ttk.Label(main, text="Formato: Nome = Valor (um por linha)",
                  foreground="gray").pack()

        self.text = tk.Text(main, height=10, width=40, font=("Consolas", 10),
                            bg=COLORS["surface"], fg=COLORS["text"],
                            insertbackground=COLORS["text"],
                            selectbackground=COLORS["primary"])
        self.text.pack(fill="both", expand=True, pady=10)

        # Preenche com stats existentes
        for key, value in self.image_item.stats.items():
            self.text.insert("end", f"{key} = {value}\n")

        btn_frame = ttk.Frame(main)
        btn_frame.pack(fill="x")
        ttk.Button(btn_frame, text="Salvar", command=self._save).pack(side="right", padx=5)
        ttk.Button(btn_frame, text="Cancelar", command=self.destroy).pack(side="right")

    def _save(self):
        stats = {}
        content = self.text.get("1.0", "end").strip()
        for line in content.split("\n"):
            line = line.strip()
            if "=" in line:
                key, value = line.split("=", 1)
                stats[key.strip()] = value.strip()
        self.result = stats
        self.destroy()


class ImagePanel(ttk.LabelFrame):
    """Painel principal de gerenciamento de imagens."""

    def __init__(self, parent, session_manager: SessionManager, on_show_image=None):
        super().__init__(parent, text=" 🖼 Imagens & Sessões ", padding=10)
        self.session_manager = session_manager
        self.on_show_image = on_show_image  # Callback para mostrar imagem no canvas
        self.current_session: Session | None = None
        self.image_widgets: list[ImagePreview] = []
        self._build()

    def _build(self):
        # Toolbar de sessões
        session_toolbar = ttk.Frame(self)
        session_toolbar.pack(fill="x", pady=(0, 5))

        ttk.Label(session_toolbar, text="Sessão:").pack(side="left", padx=(0, 5))

        self.session_var = tk.StringVar()
        self.session_combo = ttk.Combobox(
            session_toolbar, textvariable=self.session_var,
            state="readonly", width=25
        )
        self.session_combo.pack(side="left", padx=2)
        self.session_combo.bind("<<ComboboxSelected>>", self._on_session_selected)

        ttk.Button(session_toolbar, text="➕ Nova",
                   command=self._new_session).pack(side="left", padx=2)
        ttk.Button(session_toolbar, text="📁 Importar Pasta",
                   command=self._import_folder).pack(side="left", padx=2)
        ttk.Button(session_toolbar, text="🗑 Excluir",
                   command=self._delete_session).pack(side="left", padx=2)

        # Toolbar de imagens
        img_toolbar = ttk.Frame(self)
        img_toolbar.pack(fill="x", pady=(0, 5))

        ttk.Button(img_toolbar, text="➕ Adicionar Imagens",
                   command=self._add_images, style="Accent.TButton").pack(side="left", padx=2)
        ttk.Button(img_toolbar, text="👁 Mostrar Selecionada",
                   command=self._show_selected).pack(side="left", padx=2)

        # Container scrollável para imagens
        container = ttk.Frame(self)
        container.pack(fill="both", expand=True)

        self.canvas = tk.Canvas(container, highlightthickness=0, bg=COLORS["bg"])
        scrollbar = ttk.Scrollbar(container, orient="vertical", command=self.canvas.yview)
        self.images_frame = ttk.Frame(self.canvas)

        self.images_frame.bind("<Configure>",
                               lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.create_window((0, 0), window=self.images_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Placeholder
        self.placeholder = ttk.Label(
            self.images_frame,
            text="Crie ou selecione uma sessão para gerenciar imagens.",
            foreground="gray", justify="center", padding=30
        )
        self.placeholder.pack()

        self._refresh_sessions_list()

    def _refresh_sessions_list(self):
        """Atualiza a lista de sessões no combo."""
        sessions = self.session_manager.list_sessions()
        self.session_combo["values"] = sessions
        if sessions and not self.session_var.get():
            self.session_var.set(sessions[0])
            self._load_session(sessions[0])

    def _on_session_selected(self, _=None):
        name = self.session_var.get()
        if name:
            self._load_session(name)

    def _load_session(self, name: str):
        """Carrega uma sessão e exibe suas imagens."""
        self.current_session = self.session_manager.get_session(name)
        self._refresh_images()

    def _refresh_images(self):
        """Reconstrói a lista de imagens."""
        # Limpa widgets anteriores
        for w in self.image_widgets:
            w.destroy()
        self.image_widgets.clear()

        if self.current_session is None or not self.current_session.images:
            self.placeholder.pack()
            if self.current_session and not self.current_session.images:
                self.placeholder.config(text="Nenhuma imagem nesta sessão.\n"
                                            "Clique em '➕ Adicionar Imagens'.")
            return

        self.placeholder.pack_forget()

        for i, img_item in enumerate(self.current_session.images):
            widget = ImagePreview(
                self.images_frame, img_item, i,
                on_toggle_visibility=self._toggle_visibility,
                on_edit_stats=self._edit_stats,
                on_remove=self._remove_image
            )
            widget.pack(fill="x", pady=2, padx=2)
            self.image_widgets.append(widget)

    def _new_session(self):
        name = simpledialog.askstring("Nova Sessão", "Nome da sessão:",
                                      parent=self)
        if name:
            self.session_manager.create_session(name)
            self._refresh_sessions_list()
            self.session_var.set(name)
            self._load_session(name)

    def _delete_session(self):
        name = self.session_var.get()
        if name:
            if messagebox.askyesno("Confirmar", f"Excluir sessão '{name}'?"):
                self.session_manager.delete_session(name)
                self.session_var.set("")
                self.current_session = None
                self._refresh_sessions_list()
                self._refresh_images()

    def _import_folder(self):
        folder = filedialog.askdirectory(title="Selecionar Pasta de Imagens")
        if folder:
            name = simpledialog.askstring("Nome da Sessão",
                                          "Nome para a sessão importada:",
                                          initialvalue=os.path.basename(folder),
                                          parent=self)
            if name:
                self.session_manager.import_folder_as_session(folder, name)
                self._refresh_sessions_list()
                self.session_var.set(name)
                self._load_session(name)

    def _add_images(self):
        if self.current_session is None:
            messagebox.showwarning("Aviso", "Selecione ou crie uma sessão primeiro.")
            return

        files = filedialog.askopenfilenames(
            title="Selecionar Imagens",
            filetypes=[
                ("Imagens", "*.png *.jpg *.jpeg *.gif *.bmp *.webp"),
                ("Todos", "*.*"),
            ]
        )
        for f in files:
            self.session_manager.add_image_to_session(self.current_session.name, f)
        if files:
            self._load_session(self.current_session.name)

    def _toggle_visibility(self, index: int):
        if self.current_session:
            img = self.current_session.images[index]
            new_vis = not img.visible
            self.session_manager.set_image_visibility(
                self.current_session.name, index, new_vis
            )
            self._refresh_images()
            # Notifica a janela de apresentação
            if self.on_show_image:
                self.on_show_image()

    def _edit_stats(self, index: int):
        if self.current_session:
            img = self.current_session.images[index]
            dialog = StatsDialog(self, img)
            self.wait_window(dialog)
            if dialog.result is not None:
                self.session_manager.update_image_stats(
                    self.current_session.name, index, dialog.result
                )
                self._refresh_images()

    def _remove_image(self, index: int):
        if self.current_session:
            if messagebox.askyesno("Confirmar", "Remover esta imagem da sessão?"):
                self.current_session.remove_image(index)
                self.session_manager._save_session(self.current_session)
                self._refresh_images()

    def _show_selected(self):
        """Mostra a imagem na janela de apresentação."""
        if self.on_show_image:
            self.on_show_image()
