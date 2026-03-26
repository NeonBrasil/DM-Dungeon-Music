"""
DM - Dungeon Music
Tema visual — suporta múltiplos temas.
"""

import tkinter as tk
from tkinter import ttk


# ═══════════════════════════════════════
# Paletas de cores por tema
# ═══════════════════════════════════════

THEMES: dict[str, dict] = {
    "transylvania": {
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
    },
    "abyssal": {
        "bg":            "#0a0a0a",
        "bg_alt":        "#050505",
        "surface":       "#161616",
        "surface_hover": "#1f1f1f",
        "card":          "#1a1a1a",
        "border":        "#2a2a2a",
        "primary":       "#3b82f6",
        "primary_hover": "#2563eb",
        "primary_light": "#93c5fd",
        "accent":        "#06b6d4",
        "success":       "#22c55e",
        "warning":       "#f59e0b",
        "danger":        "#ef4444",
        "text":          "#e5e5e5",
        "text_muted":    "#737373",
        "text_dim":      "#404040",
    },
    "fog": {
        "bg":            "#1e2028",
        "bg_alt":        "#181a21",
        "surface":       "#2a2d3a",
        "surface_hover": "#333647",
        "card":          "#252830",
        "border":        "#3a3d4a",
        "primary":       "#64748b",
        "primary_hover": "#475569",
        "primary_light": "#94a3b8",
        "accent":        "#22d3ee",
        "success":       "#22c55e",
        "warning":       "#f59e0b",
        "danger":        "#ef4444",
        "text":          "#cbd5e1",
        "text_muted":    "#64748b",
        "text_dim":      "#475569",
    },
    "forest": {
        "bg":            "#0d1f17",
        "bg_alt":        "#091510",
        "surface":       "#162a20",
        "surface_hover": "#1f3a2c",
        "card":          "#132418",
        "border":        "#254d35",
        "primary":       "#059669",
        "primary_hover": "#047857",
        "primary_light": "#6ee7b7",
        "accent":        "#84cc16",
        "success":       "#22c55e",
        "warning":       "#f59e0b",
        "danger":        "#ef4444",
        "text":          "#d1fae5",
        "text_muted":    "#6ee7b7",
        "text_dim":      "#34d399",
    },
    "amber": {
        "bg":            "#1c1612",
        "bg_alt":        "#14110d",
        "surface":       "#2a2017",
        "surface_hover": "#352a1e",
        "card":          "#241c13",
        "border":        "#4a3820",
        "primary":       "#d97706",
        "primary_hover": "#b45309",
        "primary_light": "#fcd34d",
        "accent":        "#f97316",
        "success":       "#22c55e",
        "warning":       "#f59e0b",
        "danger":        "#ef4444",
        "text":          "#fef3c7",
        "text_muted":    "#d97706",
        "text_dim":      "#92400e",
    },
    "light": {
        "bg":            "#f1f5f9",
        "bg_alt":        "#e2e8f0",
        "surface":       "#ffffff",
        "surface_hover": "#f8fafc",
        "card":          "#ffffff",
        "border":        "#cbd5e1",
        "primary":       "#7c3aed",
        "primary_hover": "#6d28d9",
        "primary_light": "#7c3aed",
        "accent":        "#0891b2",
        "success":       "#16a34a",
        "warning":       "#d97706",
        "danger":        "#dc2626",
        "text":          "#0f172a",
        "text_muted":    "#475569",
        "text_dim":      "#94a3b8",
    },
}

SUPPORTED_THEMES: dict[str, str] = {
    "transylvania": "🧛 Transilvânia",
    "abyssal":      "⬛ Abissal",
    "fog":          "🌫️ Névoa",
    "forest":       "🌲 Floresta",
    "amber":        "🔥 Âmbar",
    "light":        "☀️ Claro",
}

# Tema corrente (pode ser alterado via set_theme antes do apply_theme)
_current_theme: str = "transylvania"

# COLORS é o dict mutável usado pelo resto da aplicação
COLORS: dict = dict(THEMES["transylvania"])


def set_theme(name: str) -> None:
    """Define qual tema será aplicado na próxima chamada a apply_theme."""
    global _current_theme
    _current_theme = name if name in THEMES else "transylvania"


def current_theme() -> str:
    return _current_theme


def apply_theme(root: tk.Tk) -> None:
    """Aplica o tema visual atual a toda a aplicação."""
    COLORS.update(THEMES.get(_current_theme, THEMES["transylvania"]))

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
