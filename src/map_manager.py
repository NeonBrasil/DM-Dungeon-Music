"""
DM - Dungeon Music
Gerenciador de sessoes de mapas. Salva/carrega JSON em disco.
"""

import json
import os

_DATA_DIR = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "maps")

_LAYER_ORDER = [
    "decoration", "continent", "country", "region",
    "water", "terrain", "road", "settlement", "poi", "note", "token"
]


def _ensure():
    os.makedirs(_DATA_DIR, exist_ok=True)


def _empty(name: str) -> dict:
    return {
        "name": name,
        "title": "",
        "bg_style": "dark",
        "bg_color": "#1a2d0e",
        "grid_type": "none",
        "grid_size": 50,
        "layers_visible": {layer: True for layer in _LAYER_ORDER},
        "items": [],
        "snapshots": [],
    }


class MapSessionManager:
    """Cria, carrega, salva e remove mapas persistidos em JSON."""

    def list_maps(self) -> list:
        _ensure()
        return sorted(f[:-5] for f in os.listdir(_DATA_DIR) if f.endswith(".json"))

    def create_map(self, name: str) -> dict:
        data = _empty(name)
        self._write(name, data)
        return data

    def load_map(self, name: str) -> dict:
        path = os.path.join(_DATA_DIR, f"{name}.json")
        if not os.path.isfile(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Migrar mapas antigos: garantir campos novos
            data.setdefault("title", "")
            data.setdefault("bg_style", "dark")
            data.setdefault("bg_color", "#1a2d0e")
            data.setdefault("layers_visible", {layer: True for layer in _LAYER_ORDER})
            # Migrar itens antigos sem campo 'layer'
            for item in data.get("items", []):
                _migrate_item(item)
            return data
        except Exception as e:
            print(f"[DM] Erro ao carregar mapa '{name}': {e}")
            return None

    def save_map(self, name: str, data: dict):
        _ensure()
        self._write(name, data)

    def delete_map(self, name: str):
        p = os.path.join(_DATA_DIR, f"{name}.json")
        if os.path.isfile(p):
            os.remove(p)

    def _write(self, name: str, data: dict):
        _ensure()
        with open(os.path.join(_DATA_DIR, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


def _migrate_item(item: dict):
    """Adiciona campo 'layer' a itens criados pela versao anterior."""
    if "layer" not in item:
        t = item.get("type", "")
        mapping = {
            "region": "region",
            "border": "note",
            "label":  "note",
            "icon":   "poi",
            "token":  "token",
        }
        item["layer"] = mapping.get(t, "note")
