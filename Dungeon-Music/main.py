"""
DM - Dungeon Music
Entry point do aplicativo.
"""

import sys
import os

# Garante que o diretório raiz está no path
root_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, root_dir)

from src.ui.main_window import MainWindow


def main():
    app = MainWindow()
    app.run()


if __name__ == "__main__":
    main()
