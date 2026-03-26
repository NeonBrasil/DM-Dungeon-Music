"""
DM - Dungeon Music
Entry point do aplicativo.
"""

import sys
import os
import json

# Garante que o diretório raiz está no path
root_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, root_dir)

# Carrega locale e tema ANTES de qualquer import de UI
from src.i18n.translator import load_locale
from src.ui.theme import set_theme

_cfg_path = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "config.json")
try:
    with open(_cfg_path, encoding="utf-8") as _f:
        _cfg = json.load(_f)
except Exception:
    _cfg = {}

load_locale(_cfg.get("language", "pt_BR"))
set_theme(_cfg.get("theme", "transylvania"))

from src.ui.main_window import MainWindow


def main():
    app = MainWindow()
    app.run()


if __name__ == "__main__":
    main()
