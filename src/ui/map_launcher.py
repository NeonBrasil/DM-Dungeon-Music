"""
DM - Dungeon Music
Painel lançador do Editor de Mapas — interface limpa para o tab Mapa.
"""

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import os
import json

from src.ui.theme import COLORS
from src.i18n.translator import t

_DATA_DIR = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "maps")


class MapLauncherPanel(ttk.Frame):
    """
    Painel do tab Mapa: lista mapas existentes e abre o editor avançado (PySide6)
    ou o editor clássico (Tkinter) com um clique.
    """

    def __init__(self, parent, **kwargs):
        super().__init__(parent, **kwargs)
        os.makedirs(_DATA_DIR, exist_ok=True)
        self._classic_panel = None   # lazy-loaded
        self._build()
        self._refresh()

    # ── Build ─────────────────────────────────────────────────────────────────

    def _build(self):
        # ── Header ────────────────────────────────────────────────────────────
        header = ttk.Frame(self)
        header.pack(fill="x", padx=20, pady=(18, 6))

        ttk.Label(
            header,
            text=t("map_launcher.header_title"),
            font=("Segoe UI", 18, "bold"),
            foreground=COLORS.get("accent", "#a78bfa"),
        ).pack(anchor="w")

        ttk.Label(
            header,
            text=t("map_launcher.header_desc"),
            font=("Segoe UI", 9),
            foreground=COLORS.get("text_muted", "#94a3b8"),
            wraplength=600,
        ).pack(anchor="w", pady=(2, 0))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=20, pady=10)

        # ── Content: two columns ──────────────────────────────────────────────
        content = ttk.Frame(self)
        content.pack(fill="both", expand=True, padx=20, pady=4)
        content.columnconfigure(0, weight=1)
        content.columnconfigure(1, weight=2)

        # ── Left: map list ─────────────────────────────────────────────────
        left = ttk.Frame(content)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 16))

        ttk.Label(left, text=t("map_launcher.your_maps"),
                  font=("Segoe UI", 10, "bold"),
                  foreground=COLORS.get("accent", "#a78bfa")).pack(anchor="w")

        list_frame = ttk.Frame(left)
        list_frame.pack(fill="both", expand=True, pady=(4, 0))

        self._listbox = tk.Listbox(
            list_frame,
            selectmode="single",
            font=("Segoe UI", 10),
            bg=COLORS.get("surface", "#252641"),
            fg=COLORS.get("text", "#e2e8f0"),
            selectbackground=COLORS.get("accent", "#7c3aed"),
            selectforeground="#ffffff",
            relief="flat",
            borderwidth=0,
            activestyle="none",
            height=14,
        )
        self._listbox.pack(side="left", fill="both", expand=True)
        sb = ttk.Scrollbar(list_frame, orient="vertical",
                           command=self._listbox.yview)
        sb.pack(side="right", fill="y")
        self._listbox.configure(yscrollcommand=sb.set)
        self._listbox.bind("<<ListboxSelect>>", self._on_select)
        self._listbox.bind("<Double-Button-1>", lambda e: self._open_qt())

        btn_row = ttk.Frame(left)
        btn_row.pack(fill="x", pady=(6, 0))
        ttk.Button(btn_row, text=t("map_launcher.new_map_btn"),   command=self._new_map).pack(side="left", padx=(0, 4))
        ttk.Button(btn_row, text=t("map_launcher.refresh_btn"),   command=self._refresh).pack(side="left")
        ttk.Button(btn_row, text=t("map_launcher.delete_btn"),     command=self._delete_map).pack(side="right")

        # ── Right: open buttons + feature cards ───────────────────────────
        right = ttk.Frame(content)
        right.grid(row=0, column=1, sticky="nsew")

        self._selected_label = ttk.Label(
            right,
            text=t("map_launcher.select_prompt"),
            font=("Segoe UI", 10),
            foreground=COLORS.get("text_muted", "#94a3b8"),
        )
        self._selected_label.pack(anchor="w", pady=(0, 10))

        # Big primary button
        self._btn_qt = tk.Button(
            right,
            text=t("map_launcher.open_advanced"),
            font=("Segoe UI", 13, "bold"),
            bg=COLORS.get("accent", "#7c3aed"),
            fg="#ffffff",
            activebackground=COLORS.get("accent_hover", "#6d28d9"),
            activeforeground="#ffffff",
            relief="flat",
            cursor="hand2",
            padx=20, pady=12,
            state="disabled",
            command=self._open_qt,
        )
        self._btn_qt.pack(fill="x", pady=(0, 8))

        # Secondary button
        self._btn_classic = tk.Button(
            right,
            text=t("map_launcher.open_classic"),
            font=("Segoe UI", 9),
            bg=COLORS.get("surface", "#252641"),
            fg=COLORS.get("text_muted", "#94a3b8"),
            activebackground=COLORS.get("surface_hover", "#2f3055"),
            activeforeground=COLORS.get("text", "#e2e8f0"),
            relief="flat",
            cursor="hand2",
            padx=10, pady=6,
            state="disabled",
            command=self._open_classic,
        )
        self._btn_classic.pack(fill="x", pady=(0, 16))

        ttk.Separator(right, orient="horizontal").pack(fill="x", pady=(0, 12))

        # Feature cards
        ttk.Label(right, text=t("map_launcher.features_title"),
                  font=("Segoe UI", 9, "bold"),
                  foreground=COLORS.get("accent", "#a78bfa")).pack(anchor="w")

        features = [
            (t("map_launcher.feat_fog"),    t("map_launcher.feat_fog_desc")),
            (t("map_launcher.feat_levels"), t("map_launcher.feat_levels_desc")),
            (t("map_launcher.feat_opengl"), t("map_launcher.feat_opengl_desc")),
            (t("map_launcher.feat_undo"),   t("map_launcher.feat_undo_desc")),
            (t("map_launcher.feat_rotate"), t("map_launcher.feat_rotate_desc")),
            (t("map_launcher.feat_icons"),  t("map_launcher.feat_icons_desc")),
            (t("map_launcher.feat_ruler"),  t("map_launcher.feat_ruler_desc")),
        ]
        for icon_text, desc in features:
            row = ttk.Frame(right)
            row.pack(fill="x", pady=2)
            ttk.Label(row, text=icon_text, font=("Segoe UI", 9, "bold"),
                      foreground=COLORS.get("text", "#e2e8f0"), width=22).pack(side="left")
            ttk.Label(row, text=desc, font=("Segoe UI", 8),
                      foreground=COLORS.get("text_muted", "#94a3b8"),
                      wraplength=360).pack(side="left", padx=(4, 0))

    # ── Map list management ───────────────────────────────────────────────────

    def _refresh(self):
        self._listbox.delete(0, "end")
        maps = self._list_maps()
        for m in maps:
            self._listbox.insert("end", m)

    def _list_maps(self) -> list[str]:
        try:
            return sorted(
                os.path.splitext(f)[0]
                for f in os.listdir(_DATA_DIR)
                if f.endswith(".json")
            )
        except Exception:
            return []

    def _on_select(self, _event=None):
        sel = self._listbox.curselection()
        name = self._listbox.get(sel[0]) if sel else None
        if name:
            self._selected_label.config(
                text=t("map_launcher.selected", name=name),
                foreground=COLORS.get("accent", "#a78bfa"),
            )
            self._btn_qt["state"]      = "normal"
            self._btn_classic["state"] = "normal"
        else:
            self._selected_label.config(
                text=t("map_launcher.select_prompt"),
                foreground=COLORS.get("text_muted", "#94a3b8"),
            )
            self._btn_qt["state"]      = "disabled"
            self._btn_classic["state"] = "disabled"

    def _selected_name(self) -> str | None:
        sel = self._listbox.curselection()
        return self._listbox.get(sel[0]) if sel else None

    # ── Actions ───────────────────────────────────────────────────────────────

    def _new_map(self):
        name = simpledialog.askstring(t("map_launcher.new_map_title"), t("map_launcher.new_map_prompt"), parent=self)
        if not name or not name.strip():
            return
        name = name.strip().replace(" ", "_")
        path = os.path.join(_DATA_DIR, name + ".json")
        if not os.path.exists(path):
            data = {
                "name": name, "version": 1,
                "levels": [{"name": "Mundo", "items": [], "fog": [],
                             "bg_style": "dark",
                             "bg_color": "#1a2d0e",
                             "grid_type": "none", "grid_size": 50,
                             "layers_visible": {}}],
                "level_idx": 0,
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        self._refresh()
        # Select the new map
        maps = self._list_maps()
        if name in maps:
            idx = maps.index(name)
            self._listbox.selection_clear(0, "end")
            self._listbox.selection_set(idx)
            self._listbox.see(idx)
            self._on_select()

    def _delete_map(self):
        name = self._selected_name()
        if not name:
            return
        ok = messagebox.askyesno(t("map_launcher.delete_title"),
                                  t("map_launcher.delete_confirm", name=name), parent=self)
        if ok:
            path = os.path.join(_DATA_DIR, name + ".json")
            try:
                os.remove(path)
            except Exception:
                pass
            self._refresh()
            self._on_select()

    def _open_qt(self):
        name = self._selected_name()
        if not name:
            return
        try:
            from src.ui.map_editor.launch import launch_editor
            launch_editor(name)
        except ImportError:
            messagebox.showerror(
                t("map_launcher.pyside6_error_title"),
                t("map_launcher.pyside6_error_body"),
                parent=self,
            )
        except Exception as e:
            messagebox.showerror(t("map_launcher.error_title"), str(e), parent=self)

    def _open_classic(self):
        """Abre o editor clássico Tkinter em uma janela separada."""
        name = self._selected_name()
        if not name:
            return
        # Lazy import to avoid loading all of map_panel at startup
        try:
            from src.ui.map_panel import MapPanel
        except Exception as e:
            messagebox.showerror(t("map_launcher.error_title"), str(e), parent=self)
            return

        top = tk.Toplevel(self)
        top.title(t("map_launcher.classic_window_title", name=name))
        top.geometry("1150x750")
        panel = MapPanel(top)
        panel.pack(fill="both", expand=True)
        # Try to load the map
        try:
            panel._map_var.set(name)
            panel._on_map_selected()
        except Exception:
            pass
