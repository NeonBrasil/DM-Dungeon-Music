"""
DM - Dungeon Music
Map Editor — constantes e dados (sem dependências Qt).
"""

import os
import math

# ─── Directories ──────────────────────────────────────────────────────────────

DATA_DIR  = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "maps")
ICONS_DIR = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "map_icons")

os.makedirs(DATA_DIR,  exist_ok=True)
os.makedirs(ICONS_DIR, exist_ok=True)

# ─── Layers ───────────────────────────────────────────────────────────────────

LAYER_ORDER = [
    "decoration", "continent", "country", "region",
    "water", "terrain", "road", "settlement", "poi", "note", "token",
]

LAYER_Z = {layer: (i + 1) * 10 for i, layer in enumerate(LAYER_ORDER)}
FOG_Z   = 200   # above all map items

LAYER_LABELS = {
    "decoration":  "Decoração",
    "continent":   "Continente",
    "country":     "País",
    "region":      "Região",
    "water":       "Água",
    "terrain":     "Terreno",
    "road":        "Estrada",
    "settlement":  "Assentamento",
    "poi":         "PDI",
    "note":        "Nota",
    "token":       "Token",
}

LAYER_DEFAULTS = {
    "continent":  {"fill": "#c8b87a", "outline": "#5a3d1e", "outline_width": 4, "text_color": "#2a1a0a"},
    "country":    {"fill": "#d4c090", "outline": "#7a5030", "outline_width": 2, "text_color": "#3a2010", "border_style": "dashed"},
    "region":     {"fill": "#3a6b35", "outline": "#111111", "outline_width": 2, "text_color": "#ffffff"},
    "water":      {"fill": "#4a7ab0", "outline": "#2050a0", "outline_width": 1, "text_color": "#c8e0ff"},
    "terrain":    {"color": "#6b5030", "size": 36},
    "road":       {"color": "#8b6030", "width": 3},
    "settlement": {"color": "#ffffff", "size": 18, "label_color": "#1a0a00"},
    "poi":        {"color": "#8030c0", "size": 14},
    "note":       {"color": "#ffffff", "size": 13},
    "token":      {"color": "#c0392b", "size": 16},
    "decoration": {"size": 70},
}

# ─── Sub-types ────────────────────────────────────────────────────────────────

SETTLEMENT_TYPES = [
    ("capital",    "Capital",    "★"),
    ("city",       "Cidade",     "⊙"),
    ("town",       "Vila",       "○"),
    ("village",    "Aldeia",     "•"),
    ("castle",     "Castelo",    "⌂"),
    ("fortress",   "Fortaleza",  "▣"),
    ("port",       "Porto",      "⚓"),
    ("ruins",      "Ruínas",     "⌖"),
    ("lighthouse", "Farol",      "⚡"),
    ("mine",       "Mina",       "⛏"),
    ("chapel",     "Capela",     "✝"),
]

TERRAIN_TYPES = [
    ("mountain", "Montanha", "▲"),
    ("forest",   "Floresta", "♣"),
    ("hill",     "Colina",   "∩"),
    ("volcano",  "Vulcão",   "🔺"),
    ("swamp",    "Pântano",  "≈"),
    ("desert",   "Deserto",  "∴"),
    ("jungle",   "Selva",    "🌴"),
    ("snow",     "Neve",     "❄"),
    ("plains",   "Planície", "≡"),
    ("cave",     "Caverna",  "◐"),
]

POI_TYPES = [
    ("dungeon", "Dungeon",  "D"),
    ("temple",  "Templo",   "+"),
    ("magical", "Mágico",   "✦"),
    ("danger",  "Perigo",   "☠"),
    ("tavern",  "Taverna",  "T"),
    ("market",  "Mercado",  "◆"),
    ("custom",  "Custom",   "?"),
]

ROAD_TYPES = [
    ("road",        "Estrada",        {"dash": [],              "width": 3}),
    ("path",        "Caminho",        {"dash": [8, 4],          "width": 2}),
    ("trade_route", "Rota Comercial", {"dash": [12, 4, 4, 4],   "width": 4}),
]

WATER_TYPES = [
    ("sea",   "Mar / Oceano"),
    ("lake",  "Lago"),
    ("river", "Rio"),
]

BG_STYLES = {
    "dark":      "#1a2d0e",
    "parchment": "#c8a870",
    "ocean":     "#1a3a5e",
}

COUNTRY_COLORS = [
    "#e8c57a", "#a8d5a2", "#f4a460", "#b0c4de", "#dda0dd",
    "#f0e68c", "#98d8c8", "#ffb6c1", "#c8a2c8", "#b8d4e8",
    "#d4b896", "#aec6cf", "#77dd77", "#fdfd96", "#cb99c9",
    "#b5ead7", "#ffdac1", "#e2cbb8", "#c9b1d0", "#d4e6c3",
]

TERRAIN_SYMBOLS    = {k: s for k, _, s in TERRAIN_TYPES}
SETTLEMENT_SYMBOLS = {k: s for k, _, s in SETTLEMENT_TYPES}
POI_SYMBOLS        = {k: s for k, _, s in POI_TYPES}

# ─── Scene geometry ───────────────────────────────────────────────────────────

SCENE_RECT = (-5000.0, -5000.0, 10000.0, 10000.0)   # x, y, w, h

# ─── Qt stylesheet (dark RPG theme) ──────────────────────────────────────────

APP_QSS = """
QMainWindow, QDialog { background: #1a1b2e; }
* { color: #e2e8f0; font-family: "Segoe UI"; font-size: 10pt; }
QWidget { background: #1a1b2e; }
QFrame  { background: #1a1b2e; }

QPushButton {
    background: #252641; color: #e2e8f0;
    border: 1px solid #3d3e5c; border-radius: 4px; padding: 5px 10px; min-height: 22px;
}
QPushButton:hover   { background: #2f3055; }
QPushButton:pressed { background: #5b21b6; }
QPushButton:checked { background: #7c3aed; border-color: #a78bfa; }
QPushButton[accent="true"]   { background: #7c3aed; color: #fff; border-color: #6d28d9; }
QPushButton[accent="true"]:hover { background: #6d28d9; }
QPushButton[danger="true"]   { background: #ef4444; color: #fff; border-color: #dc2626; }
QPushButton[danger="true"]:hover { background: #dc2626; }
QPushButton[success="true"]  { background: #22c55e; color: #fff; }
QPushButton[success="true"]:hover { background: #16a34a; }

QToolButton { background: transparent; border: none; padding: 3px; border-radius: 3px; }
QToolButton:hover   { background: #2f3055; }
QToolButton:pressed { background: #5b21b6; }
QToolButton:checked { background: #7c3aed; }

QComboBox, QSpinBox, QDoubleSpinBox, QLineEdit, QTextEdit {
    background: #252641; color: #e2e8f0;
    border: 1px solid #3d3e5c; border-radius: 4px; padding: 3px 6px;
}
QComboBox::drop-down   { border: none; width: 18px; }
QComboBox QAbstractItemView { background: #252641; border: 1px solid #3d3e5c; selection-background-color: #7c3aed; }

QScrollBar:vertical   { background: #141525; width: 8px;  border-radius: 4px; margin: 0; }
QScrollBar:horizontal { background: #141525; height: 8px; border-radius: 4px; margin: 0; }
QScrollBar::handle:vertical, QScrollBar::handle:horizontal { background: #3d3e5c; border-radius: 4px; min-height: 20px; min-width: 20px; }
QScrollBar::handle:vertical:hover, QScrollBar::handle:horizontal:hover { background: #7c3aed; }
QScrollBar::add-line, QScrollBar::sub-line { width: 0; height: 0; }

QGroupBox {
    border: 1px solid #3d3e5c; border-radius: 4px; margin-top: 10px;
    padding: 6px 4px 4px; font-weight: bold; color: #a78bfa;
}
QGroupBox::title { subcontrol-origin: margin; left: 8px; padding: 0 4px; }

QMenuBar           { background: #141525; }
QMenuBar::item:selected { background: #7c3aed; }
QMenu              { background: #252641; border: 1px solid #3d3e5c; }
QMenu::item:selected   { background: #7c3aed; }
QMenu::separator   { height: 1px; background: #3d3e5c; margin: 2px 8px; }

QStatusBar { background: #141525; color: #94a3b8; font-size: 9pt; }
QStatusBar::item { border: none; }

QDockWidget { titlebar-close-icon: url(none); }
QDockWidget::title { background: #252641; color: #a78bfa; font-weight: bold; padding: 5px 8px; }

QToolBar { background: #141525; border: none; spacing: 2px; padding: 2px; }
QToolBar::separator { background: #3d3e5c; width: 1px; margin: 3px 2px; }

QLabel[muted="true"]  { color: #94a3b8; }
QLabel[accent="true"] { color: #a78bfa; font-weight: bold; }
QLabel[heading="true"] { font-weight: bold; font-size: 11pt; color: #a78bfa; }

QCheckBox { color: #e2e8f0; }
QCheckBox::indicator {
    width: 14px; height: 14px;
    border: 1px solid #3d3e5c; border-radius: 3px; background: #252641;
}
QCheckBox::indicator:checked { background: #7c3aed; border-color: #a78bfa; }

QSlider::groove:horizontal { background: #252641; height: 4px; border-radius: 2px; }
QSlider::handle:horizontal {
    background: #7c3aed; width: 14px; height: 14px;
    margin: -5px 0; border-radius: 7px;
}
QSplitter::handle { background: #3d3e5c; }

QHeaderView::section { background: #252641; border: 1px solid #3d3e5c; padding: 3px; }
QTableWidget { gridline-color: #3d3e5c; }
"""
