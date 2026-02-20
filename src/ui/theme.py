"""
DM - Dungeon Music
Tema visual moderno (Dark Mode).
"""

import tkinter as tk
from tkinter import ttk


# ═══════════════════════════════════════
# Paleta de cores
# ═══════════════════════════════════════

COLORS = {
    "bg":            "#1a1b2e",
    "bg_alt":        "#141525",
    "surface":       "#252641",
    "surface_hover": "#2f3055",
    "card":          "#2a2b47",
    "border":        "#3d3e5c",

    "primary":       "#7c3aed",
    "primary_hover": "#6d28d9",
    "primary_light": "#a78bfa",

    "accent":        "#06b6d4",

    "success":       "#22c55e",
    "warning":       "#f59e0b",
    "danger":        "#ef4444",

    "text":          "#e2e8f0",
    "text_muted":    "#94a3b8",
    "text_dim":      "#64748b",
}


def apply_theme(root: tk.Tk):
    """Aplica tema dark moderno a toda a aplicação."""

    root.configure(bg=COLORS["bg"])

    style = ttk.Style()
    style.theme_use("clam")

    # ── Base global ──
    style.configure(".",
        background=COLORS["bg"],
        foreground=COLORS["text"],
        fieldbackground=COLORS["surface"],
        bordercolor=COLORS["border"],
        darkcolor=COLORS["bg_alt"],
        lightcolor=COLORS["surface"],
        troughcolor=COLORS["bg_alt"],
        selectbackground=COLORS["primary"],
        selectforeground=COLORS["text"],
        font=("Segoe UI", 10),
        focuscolor=COLORS["primary"],
        insertcolor=COLORS["text"],
    )

    # ── Frame ──
    style.configure("TFrame", background=COLORS["bg"])
    style.configure("Card.TFrame", background=COLORS["card"])

    # ── Label ──
    style.configure("TLabel",
        background=COLORS["bg"], foreground=COLORS["text"])
    style.configure("Title.TLabel",
        font=("Segoe UI", 18, "bold"), foreground=COLORS["primary_light"])
    style.configure("Subtitle.TLabel",
        font=("Segoe UI", 14, "bold"))
    style.configure("Heading.TLabel",
        font=("Segoe UI", 12, "bold"))

    # ── Button ──
    style.configure("TButton",
        background=COLORS["surface"],
        foreground=COLORS["text"],
        bordercolor=COLORS["border"],
        padding=(12, 6),
    )
    style.map("TButton",
        background=[("active", COLORS["surface_hover"]),
                    ("pressed", COLORS["primary"])],
    )

    style.configure("Accent.TButton",
        background=COLORS["primary"],
        foreground="#ffffff",
        bordercolor=COLORS["primary"],
    )
    style.map("Accent.TButton",
        background=[("active", COLORS["primary_hover"])],
    )

    style.configure("Success.TButton",
        background=COLORS["success"],
        foreground="#ffffff",
    )
    style.map("Success.TButton",
        background=[("active", "#16a34a")],
    )

    style.configure("Danger.TButton",
        background=COLORS["danger"],
        foreground="#ffffff",
    )
    style.map("Danger.TButton",
        background=[("active", "#dc2626")],
    )

    # ── LabelFrame ──
    style.configure("TLabelframe",
        background=COLORS["bg"],
        bordercolor=COLORS["border"],
    )
    style.configure("TLabelframe.Label",
        background=COLORS["bg"],
        foreground=COLORS["primary_light"],
        font=("Segoe UI", 11, "bold"),
    )

    # ── Notebook (Tabs) ──
    style.configure("TNotebook",
        background=COLORS["bg"],
        bordercolor=COLORS["border"],
        tabmargins=[2, 5, 2, 0],
    )
    style.configure("TNotebook.Tab",
        background=COLORS["surface"],
        foreground=COLORS["text_muted"],
        padding=(16, 8),
        bordercolor=COLORS["border"],
    )
    style.map("TNotebook.Tab",
        background=[("selected", COLORS["bg"]),
                    ("active", COLORS["surface_hover"])],
        foreground=[("selected", COLORS["primary_light"]),
                    ("active", COLORS["text"])],
    )

    # ── Scale / Slider ──
    style.configure("Horizontal.TScale",
        background=COLORS["bg"],
        troughcolor=COLORS["surface"],
    )

    # ── Scrollbar ──
    style.configure("TScrollbar",
        background=COLORS["surface"],
        troughcolor=COLORS["bg_alt"],
        bordercolor=COLORS["bg_alt"],
        arrowcolor=COLORS["text_muted"],
    )
    style.map("TScrollbar",
        background=[("active", COLORS["surface_hover"])],
    )

    # ── Combobox ──
    style.configure("TCombobox",
        fieldbackground=COLORS["surface"],
        foreground=COLORS["text"],
        bordercolor=COLORS["border"],
        arrowcolor=COLORS["text_muted"],
    )
    style.map("TCombobox",
        fieldbackground=[("readonly", COLORS["surface"])],
        foreground=[("readonly", COLORS["text"])],
    )

    # ── Checkbutton ──
    style.configure("TCheckbutton",
        background=COLORS["bg"],
        foreground=COLORS["text"],
    )
    style.map("TCheckbutton",
        background=[("active", COLORS["bg"])],
    )

    # ── Separator ──
    style.configure("TSeparator", background=COLORS["border"])

    # ── Entry / Spinbox ──
    style.configure("TEntry",
        fieldbackground=COLORS["surface"],
        foreground=COLORS["text"],
        bordercolor=COLORS["border"],
        insertcolor=COLORS["text"],
    )
    style.configure("TSpinbox",
        fieldbackground=COLORS["surface"],
        foreground=COLORS["text"],
        bordercolor=COLORS["border"],
        arrowcolor=COLORS["text_muted"],
    )

    # ── Progressbar ──
    style.configure("Horizontal.TProgressbar",
        background=COLORS["primary"],
        troughcolor=COLORS["surface"],
    )

    # ── tk.Menu (não-ttk) ──
    root.option_add("*Menu.background", COLORS["surface"])
    root.option_add("*Menu.foreground", COLORS["text"])
    root.option_add("*Menu.activeBackground", COLORS["primary"])
    root.option_add("*Menu.activeForeground", "#ffffff")
    root.option_add("*Menu.selectColor", COLORS["primary"])
    root.option_add("*Menu.borderWidth", "0")
