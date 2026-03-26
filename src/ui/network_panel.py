"""
Painel de conexão online (host/join) para DM - Dungeon Music.
"""

import tkinter as tk
from tkinter import ttk
from tkinter import scrolledtext

from src.i18n.translator import t
from src.network_manager import NetworkManager


class NetworkPanel(ttk.Frame):
    def __init__(self, master, network_manager: NetworkManager, **kwargs):
        super().__init__(master, **kwargs)
        self.network = network_manager
        self._build_ui()
        self.network.add_status_listener(self._on_status)
        self.network.add_message_listener(self._on_message)
        self._poll_player_count()

    def _build_ui(self):
        title_row = ttk.Frame(self)
        title_row.pack(fill="x", pady=(0, 8))
        ttk.Label(title_row, text=t("network.title"), style="Title.TLabel").pack(side="left")
        ttk.Button(
            title_row, text="❓ Como funciona?",
            command=self._show_tutorial
        ).pack(side="right", padx=(0, 4))

        top = ttk.Frame(self)
        top.pack(fill="x")

        # ── Coluna esquerda: controles de host ──────────────────────────────
        host_frame = ttk.LabelFrame(top, text=t("network.host.title"), padding=10)
        host_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 6))

        self.host_entry = self._labeled_entry(host_frame, t("network.host.label"), "0.0.0.0")
        self.port_entry = self._labeled_entry(host_frame, t("network.port.label"), "8765")
        ttk.Button(host_frame, text=t("network.host.button"), command=self._on_host).pack(fill="x", pady=(6, 2))
        ttk.Button(host_frame, text=t("network.host.stop"), command=self._on_stop).pack(fill="x")

        # ── Painel de sessão ativa (oculto até hospedar) ────────────────────
        self._session_info_frame = ttk.LabelFrame(top, text="Sessão Ativa", padding=10)
        self._session_info_frame.grid(row=0, column=1, sticky="nsew", padx=(0, 6))
        self._session_info_frame.grid_remove()  # hidden initially

        ttk.Label(self._session_info_frame, text="Código:", foreground="gray").pack(anchor="w")
        self._session_code_label = ttk.Label(
            self._session_info_frame, text="—",
            font=("Consolas", 14, "bold"), foreground="#3498db"
        )
        self._session_code_label.pack(anchor="w", pady=(0, 4))

        ttk.Label(self._session_info_frame, text="PIN:", foreground="gray").pack(anchor="w")
        self._pin_label = ttk.Label(
            self._session_info_frame, text="—",
            font=("Consolas", 18, "bold"), foreground="#2ecc71"
        )
        self._pin_label.pack(anchor="w", pady=(0, 4))

        ttk.Button(
            self._session_info_frame, text="Copiar Código",
            command=self._copy_code
        ).pack(fill="x", pady=(2, 4))

        self._player_count_label = ttk.Label(
            self._session_info_frame, text="Jogadores: 0", foreground="gray"
        )
        self._player_count_label.pack(anchor="w")

        # ── Coluna direita: controles de join ───────────────────────────────
        join_frame = ttk.LabelFrame(top, text=t("network.join.title"), padding=10)
        join_frame.grid(row=0, column=2, sticky="nsew")

        self.join_host_entry = self._labeled_entry(join_frame, t("network.host.label"), "127.0.0.1")
        self.join_port_entry = self._labeled_entry(join_frame, t("network.port.label"), "8765")
        self.session_entry = self._labeled_entry(join_frame, t("network.session.label"), "")
        self.pin_entry = self._labeled_entry(join_frame, t("network.pin.label"), "")
        self.player_entry = self._labeled_entry(join_frame, t("network.player.label"), "player-1")
        ttk.Button(join_frame, text=t("network.join.button"), command=self._on_join).pack(fill="x", pady=(6, 2))
        ttk.Button(join_frame, text=t("network.join.disconnect"), command=self._on_stop).pack(fill="x")

        top.columnconfigure(0, weight=1)
        top.columnconfigure(1, weight=1)
        top.columnconfigure(2, weight=1)

        # ── Status geral ────────────────────────────────────────────────────
        self.host_status = ttk.Label(self, text=t("network.status.offline"), foreground="gray")
        self.host_status.pack(anchor="w", pady=(8, 0))

        # ── Log ─────────────────────────────────────────────────────────────
        log_frame = ttk.LabelFrame(self, text=t("network.log.title"), padding=10)
        log_frame.pack(fill="both", expand=True, pady=(10, 0))
        self.log_box = scrolledtext.ScrolledText(log_frame, height=8, state="disabled", wrap="word")
        self.log_box.pack(fill="both", expand=True)

    def _show_tutorial(self):
        """Exibe popup com tutorial de como usar o multiplayer."""
        win = tk.Toplevel(self)
        win.title("❓ Como funciona o Multiplayer?")
        win.geometry("560x520")
        win.resizable(False, False)
        win.grab_set()

        frame = ttk.Frame(win, padding=20)
        frame.pack(fill="both", expand=True)

        ttk.Label(frame, text="🌐 Multiplayer — Tutorial", style="Title.TLabel").pack(anchor="w", pady=(0, 12))

        text = tk.Text(
            frame, wrap="word", height=22,
            font=("Segoe UI", 10), relief="flat",
            padx=10, pady=8,
        )
        text.pack(fill="both", expand=True)

        sections = [
            ("🎲  PARA O MESTRE (Host)\n", "heading"),
            ("1. Vá na aba Online / Multiplayer.\n", "normal"),
            ("2. Clique em Hospedar. O app gera um Código de Sessão e um PIN de 6 dígitos.\n", "normal"),
            ("3. Compartilhe com seus jogadores:\n", "normal"),
            ("   • Seu IP local (ex: 192.168.1.50) — veja em Configurações de Rede do Windows.\n", "normal"),
            ("   • O Código de Sessão (botão Copiar Código).\n", "normal"),
            ("   • O PIN.\n\n", "normal"),

            ("👤  PARA O JOGADOR\n", "heading"),
            ("1. Vá na aba Online / Multiplayer.\n", "normal"),
            ("2. Preencha: IP do Mestre, Código, PIN e seu Nome.\n", "normal"),
            ("3. Clique em Entrar — a janela do jogador abre automaticamente.\n\n", "normal"),

            ("🎵  MÚSICAS E ÁUDIO\n", "heading"),
            ("As músicas do Mestre são enviadas automaticamente para os jogadores durante a sessão. "
             "Quando o Mestre tocar uma faixa, ela será baixada em segundo plano no PC do jogador "
             "(pasta ~/.dm_dungeon_music/player_cache). O jogador não precisa ter os arquivos antes.\n\n", "normal"),

            ("🌍  LAN vs INTERNET\n", "heading"),
            ("Por padrão, funciona apenas na mesma rede (Wi-Fi ou cabo). "
             "Para jogar pela internet, use uma VPN virtual gratuita como "
             "Radmin VPN ou ZeroTier — elas criam uma rede local virtual, "
             "como se todos estivessem no mesmo Wi-Fi.\n", "normal"),
        ]

        text.tag_configure("heading", font=("Segoe UI", 11, "bold"), foreground="#a78bfa", spacing1=8, spacing3=2)
        text.tag_configure("normal", font=("Segoe UI", 10))

        for content, tag in sections:
            text.insert("end", content, tag)

        text.config(state="disabled")

        ttk.Button(frame, text="Entendido ✓", command=win.destroy, style="Accent.TButton").pack(pady=(12, 0))

    def _labeled_entry(self, parent, label: str, default: str) -> ttk.Entry:
        frame = ttk.Frame(parent)
        frame.pack(fill="x", pady=2)
        ttk.Label(frame, text=label, width=12).pack(side="left")
        entry = ttk.Entry(frame)
        entry.pack(side="left", fill="x", expand=True)
        entry.insert(0, default)
        return entry

    # ── Event handlers ──────────────────────────────────────────────────────
    def _on_host(self):
        try:
            host = self.host_entry.get().strip() or "0.0.0.0"
            port = int(self.port_entry.get() or 8765)
        except ValueError:
            self._append_log("Porta inválida")
            return
        self.network.host(host=host, port=port)
        # Exibe painel de sessão depois que o servidor inicializar (~200ms)
        self.after(300, self._update_session_display)

    def _on_join(self):
        try:
            host = self.join_host_entry.get().strip() or "127.0.0.1"
            port = int(self.join_port_entry.get() or 8765)
        except ValueError:
            self._append_log("Porta inválida")
            return
        session_id = self.session_entry.get().strip()
        pin = self.pin_entry.get().strip()
        player_id = self.player_entry.get().strip() or "player"
        if not session_id or not pin:
            self._append_log(t("network.error.missing_fields"))
            return
        self.network.join(host=host, port=port, session_id=session_id, pin=pin, player_id=player_id)

    def _on_stop(self):
        self.network.stop()
        self.host_status.config(text=t("network.status.offline"))
        self._session_info_frame.grid_remove()

    def _update_session_display(self):
        if self.network.is_hosting and self.network.session_id:
            self._session_code_label.config(text=self.network.session_id)
            self._pin_label.config(text=self.network.pin or "—")
            self._session_info_frame.grid()

    def _copy_code(self):
        code = self.network.session_id or ""
        pin = self.network.pin or ""
        self.clipboard_clear()
        self.clipboard_append(f"{code} PIN:{pin}")

    def _poll_player_count(self):
        if self.network.is_hosting:
            count = self.network.get_connected_count()
            self._player_count_label.config(text=f"Jogadores: {count}")
        self.after(1000, self._poll_player_count)

    def _on_status(self, message: str):
        self.after(0, lambda: self._append_log(message))
        self.after(0, lambda: self.host_status.config(text=message))

    def _on_message(self, payload: dict):
        text = f"← {payload.get('type', '?')}"
        self.after(0, lambda: self._append_log(text))

    def _append_log(self, text: str):
        self.log_box.config(state="normal")
        self.log_box.insert("end", text + "\n")
        self.log_box.see("end")
        self.log_box.config(state="disabled")
