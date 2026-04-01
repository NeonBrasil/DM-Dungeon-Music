"""
DM - Dungeon Music
Map Editor — ponto de entrada independente (processo separado).

Uso:
    python -m src.ui.map_editor.launch [map_name]
    launch_editor(map_name)   ← chamado pelo painel Tkinter
"""

import sys
import os
import subprocess


def _project_root() -> str:
    """Raiz do projeto (4 níveis acima deste arquivo: map_editor/ui/src/root)."""
    return os.path.dirname(
        os.path.dirname(
            os.path.dirname(
                os.path.dirname(os.path.abspath(__file__))
            )
        )
    )


def launch_editor(map_name: str = ""):
    """Lança o editor de mapas PySide6 como processo separado."""
    if getattr(sys, "frozen", False):
        # Rodando como .exe (PyInstaller) — relança o próprio exe com flag especial
        args = [sys.executable, "--map-editor"]
        if map_name:
            args.append(map_name)
        subprocess.Popen(args)
    else:
        # Rodando como script Python normal
        root = _project_root()
        args = [sys.executable, "-m", "src.ui.map_editor.launch"]
        if map_name:
            args.append(map_name)
        subprocess.Popen(args, cwd=root)


def _run(map_name: str = ""):
    """Inicializa e exibe a janela principal."""
    from PySide6.QtWidgets import QApplication
    from PySide6.QtCore    import Qt

    app = QApplication.instance() or QApplication(sys.argv)

    try:
        app.setAttribute(Qt.ApplicationAttribute.AA_UseHighDpiPixmaps)
    except AttributeError:
        pass

    # Importação absoluta para funcionar tanto com -m quanto como __main__
    try:
        from src.ui.map_editor.window import MapEditorWindow
    except ImportError:
        from window import MapEditorWindow  # fallback se executado direto

    win = MapEditorWindow(map_name)
    win.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    # Quando rodado com -m, adiciona a raiz do projeto ao path
    root = _project_root()
    if root not in sys.path:
        sys.path.insert(0, root)

    name = sys.argv[1] if len(sys.argv) > 1 else ""
    _run(name)
