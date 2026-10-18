"""
Painel da sala online (mestre). Jogadores entram pelo navegador com o link.
"""

import tkinter as tk
from tkinter import ttk

from src.i18n.translator import t
from src.room_server import RoomServer, local_ips
from src.ui.theme import COLORS


def _ip_label(ip: str) -> str:
    if ip.startswith("25."):
        return "Hamachi"
    if ip.startswith("26."):
        return "Radmin VPN"
    return t("network.room.lan")


class NetworkPanel(ttk.Frame):
    def __init__(self, master, room: RoomServer, on_open=None, **kwargs):
        super().__init__(master, **kwargs)
        self.room = room
        self._on_open = on_open  # callback após abrir a sala (publica estado inicial)
        self._build_ui()
        self._poll_players()

    def _build_ui(self):
        title_row = ttk.Frame(self)
        title_row.pack(fill="x", pady=(0, 8))
        ttk.Label(title_row, text=t("network.title"), style="Title.TLabel").pack(side="left")
        ttk.Button(
            title_row, text=t("network.room.help"),
            command=self._show_tutorial
        ).pack(side="right", padx=(0, 4))

        controls = ttk.Frame(self)
        controls.pack(fill="x")
        ttk.Label(controls, text=t("network.port.label")).pack(side="left")
        self.port_entry = ttk.Entry(controls, width=7)
        self.port_entry.insert(0, "8765")
        self.port_entry.pack(side="left", padx=(6, 10))
        self._open_btn = ttk.Button(controls, text=t("network.room.open"),
                                    style="Accent.TButton", command=self._on_open_room)
        self._open_btn.pack(side="left", padx=(0, 4))
        self._close_btn = ttk.Button(controls, text=t("network.room.close"),
                                     command=self._on_close_room, state="disabled")
        self._close_btn.pack(side="left")

        self.status = ttk.Label(self, text=t("network.status.offline"), foreground=COLORS["text_muted"])
        self.status.pack(anchor="w", pady=(10, 4))

        self._links_frame = ttk.Frame(self)
        self._links_frame.pack(fill="x")

        self._players_label = ttk.Label(self, text="", foreground=COLORS["text_muted"])
        self._players_label.pack(anchor="w", pady=(10, 0))

    def _show_tutorial(self):
        """Exibe popup com tutorial da sala online."""
        win = tk.Toplevel(self)
        win.title("❓ Como funciona a Sala Online?")
        win.geometry("580x560")
        win.resizable(False, False)
        win.grab_set()

        frame = ttk.Frame(win, padding=20)
        frame.pack(fill="both", expand=True)

        ttk.Label(frame, text="🌐 Sala Online — Tutorial", style="Title.TLabel").pack(anchor="w", pady=(0, 12))

        text = tk.Text(
            frame, wrap="word", height=24,
            font=("Segoe UI", 10), relief="flat",
            padx=10, pady=8,
            bg=COLORS["surface"], fg=COLORS["text"],
            insertbackground=COLORS["text"],
            selectbackground=COLORS["primary"],
        )
        text.pack(fill="both", expand=True)

        sections = [
            ("🎲  PARA O MESTRE\n", "heading"),
            ("1. Clique em Criar sala. Se o Windows perguntar sobre o firewall, permita "
             "(marque redes privadas e públicas).\n", "normal"),
            ("2. Copie um dos links e mande para os jogadores (ex.: no chat do Discord).\n", "normal"),
            ("3. Use o app normalmente: o que tocar e o que mostrar chega para eles.\n\n", "normal"),

            ("👤  PARA O JOGADOR\n", "heading"),
            ("Abra o link no navegador (Chrome, Edge ou Firefox), digite o nome e clique em "
             "Entrar. Não precisa instalar nada.\n\n", "normal"),

            ("🖼️  LOUSA\n", "heading"),
            ("Os jogadores veem exatamente o que a câmera da aba Apresentação mostra: "
             "imagens visíveis, posição, zoom e movimento.\n\n", "normal"),

            ("🗺️  MAPA\n", "heading"),
            ("No Editor de Mapas, clique em 📡 Mostrar aos jogadores. Eles navegam livremente "
             "pelo mapa enviado. Itens marcados como 'Oculto para jogadores' e áreas cobertas "
             "pela névoa não aparecem. Revele pontos aos poucos e envie de novo.\n\n", "normal"),

            ("🎵  MÚSICA E EFEITOS\n", "heading"),
            ("O que você tocar toca para todos, com o volume de cada faixa definido por você. "
             "Cada jogador ajusta só o próprio volume de música e de efeitos. "
             "Eles não veem suas listas de músicas, só ouvem o que está tocando.\n\n", "normal"),

            ("🌍  LAN vs INTERNET\n", "heading"),
            ("Na mesma rede (Wi-Fi/cabo) funciona direto. Pela internet, todos instalam uma VPN "
             "gratuita como Radmin VPN, Hamachi ou ZeroTier e entram na mesma rede — "
             "use o link com o IP dessa VPN.\n", "normal"),
        ]

        text.tag_configure("heading", font=("Segoe UI", 11, "bold"), foreground=COLORS["primary_light"], spacing1=8, spacing3=2)
        text.tag_configure("normal", font=("Segoe UI", 10))

        for content, tag in sections:
            text.insert("end", content, tag)

        text.config(state="disabled")

        ttk.Button(frame, text="Entendido ✓", command=win.destroy, style="Accent.TButton").pack(pady=(12, 0))

    # ── Event handlers ──────────────────────────────────────────────────────
    def _on_open_room(self):
        try:
            port = int(self.port_entry.get())
            self.room.open(port)
        except (ValueError, OSError) as exc:
            self.status.config(text=t("network.room.open_error", error=exc))
            return
        self._open_btn.config(state="disabled")
        self._close_btn.config(state="normal")
        self.port_entry.config(state="disabled")
        self.status.config(text=t("network.room.links"))
        for ip in local_ips() or ["127.0.0.1"]:
            self._add_link_row(_ip_label(ip), f"http://{ip}:{port}/?k={self.room.key}")
        if self._on_open:
            self._on_open()

    def _on_close_room(self):
        self.room.close()
        self._open_btn.config(state="normal")
        self._close_btn.config(state="disabled")
        self.port_entry.config(state="normal")
        self.status.config(text=t("network.status.offline"))
        for child in self._links_frame.winfo_children():
            child.destroy()

    def _add_link_row(self, label: str, url: str):
        row = ttk.Frame(self._links_frame)
        row.pack(fill="x", pady=2)
        ttk.Label(row, text=label, width=14, foreground=COLORS["text_muted"]).pack(side="left")
        entry = ttk.Entry(row, font=("Consolas", 11))
        entry.insert(0, url)
        entry.config(state="readonly")
        entry.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ttk.Button(row, text=t("network.room.copy"),
                   command=lambda: self._copy(url)).pack(side="left")

    def _copy(self, url: str):
        self.clipboard_clear()
        self.clipboard_append(url)

    def _poll_players(self):
        if self.room.is_open:
            names = self.room.players()
            self._players_label.config(
                text=t("network.room.players", count=len(names), names=", ".join(names)))
        else:
            self._players_label.config(text="")
        self.after(1000, self._poll_players)
