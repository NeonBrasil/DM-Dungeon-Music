"""
DM - Dungeon Music
Gerenciador de sistemas criados pelo usuário. Salva/carrega JSON em disco.
"""

import json
import os

_DATA_DIR = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "systems")


def _ensure():
    os.makedirs(_DATA_DIR, exist_ok=True)


def _default_system(name: str) -> dict:
    return {
        "name": name,
        "base_system": None,
        "current_step": 0,
        "completed": False,
        "answers": {},
        "sheet_config": {
            "title": name,
            "fields": [],
            "layout": "standard",
            "theme": "dark",
        },
        "exported": False,
    }


class SystemManager:
    """Cria, carrega, salva e remove sistemas persistidos em JSON."""

    def list_systems(self) -> list:
        _ensure()
        return sorted(f[:-5] for f in os.listdir(_DATA_DIR) if f.endswith(".json"))

    def create_system(self, name: str) -> dict:
        data = _default_system(name)
        self._write(name, data)
        return data

    def load_system(self, name: str) -> dict:
        path = os.path.join(_DATA_DIR, f"{name}.json")
        if not os.path.isfile(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[DM] Erro ao carregar sistema '{name}': {e}")
            return None

    def save_system(self, name: str, data: dict):
        _ensure()
        self._write(name, data)

    def delete_system(self, name: str):
        p = os.path.join(_DATA_DIR, f"{name}.json")
        if os.path.isfile(p):
            os.remove(p)

    def rename_system(self, old_name: str, new_name: str) -> bool:
        data = self.load_system(old_name)
        if data is None:
            return False
        data["name"] = new_name
        self._write(new_name, data)
        self.delete_system(old_name)
        return True

    def _write(self, name: str, data: dict):
        _ensure()
        with open(os.path.join(_DATA_DIR, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
