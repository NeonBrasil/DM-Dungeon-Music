"""
DM - Dungeon Music
Gerenciador de Bibliotecas Opcionais.
Permite baixar e instalar pacotes de conteúdo (ícones, tokens, mapas) diretamente no app.
"""

import os
import json
import shutil
import zipfile
import threading
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Callable, Optional

try:
    import requests
    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False

# Catálogo fallback (bundled com o app)
_BUNDLE_CATALOG = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "data", "library_catalog.json"
)

CATALOG_URL = "https://raw.githubusercontent.com/USER/dm-dungeon-music-libs/main/catalog.json"


@dataclass
class PackInfo:
    """Informações de um pacote de conteúdo disponível para download."""
    id: str
    name: str
    description: str
    url: str
    size_mb: float
    category: str
    license: str
    thumbnail_url: str = ""
    version: str = "1.0"
    image_count: int = 0
    tags: list = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []


@dataclass
class InstalledPack:
    """Registro de um pacote instalado."""
    id: str
    name: str
    install_path: str
    installed_at: str
    version: str


class LibraryManager:
    """Gerencia o download, instalação e remoção de bibliotecas opcionais."""

    def __init__(self, data_dir: str = ""):
        self.data_dir = data_dir or os.path.join(os.path.expanduser("~"), ".dm_dungeon_music")
        self.libraries_dir = os.path.join(self.data_dir, "libraries")
        self.registry_path = os.path.join(self.libraries_dir, "installed.json")
        self._installed: dict[str, InstalledPack] = {}
        os.makedirs(self.libraries_dir, exist_ok=True)
        self._load_registry()

    # ------------------------------------------------------------------ #
    #  Catálogo                                                            #
    # ------------------------------------------------------------------ #

    def load_catalog(self, on_done: Callable[[list, bool], None]) -> None:
        """Carrega o catálogo de pacotes disponíveis.

        Tenta buscar online; usa catálogo bundled como fallback.
        on_done(packs: list[PackInfo], is_online: bool) é chamado do worker thread.
        A UI deve envolver o callback com .after(0, ...) para thread-safety.
        """
        def _worker():
            if _REQUESTS_AVAILABLE:
                try:
                    resp = requests.get(CATALOG_URL, timeout=8)
                    resp.raise_for_status()
                    data = resp.json()
                    packs = _parse_catalog(data)
                    on_done(packs, True)
                    return
                except Exception:
                    pass
            # Fallback para catálogo bundled
            packs = self._load_fallback_catalog()
            on_done(packs, False)

        threading.Thread(target=_worker, daemon=True).start()

    def _load_fallback_catalog(self) -> list:
        """Carrega o catálogo bundled offline."""
        try:
            with open(_BUNDLE_CATALOG, encoding="utf-8") as f:
                data = json.load(f)
            return _parse_catalog(data)
        except Exception:
            return []

    # ------------------------------------------------------------------ #
    #  Instalação                                                          #
    # ------------------------------------------------------------------ #

    def install_pack(
        self,
        pack: PackInfo,
        on_progress: Callable[[int], None],
        on_done: Callable[[bool, str], None],
    ) -> None:
        """Baixa e instala um pacote em background.

        on_progress(percent: int) — 0 a 100
        on_done(success: bool, error_msg: str)
        Ambos são chamados do worker thread; UI deve usar .after(0, ...).
        """
        def _worker():
            dest_dir = os.path.join(self.libraries_dir, pack.id)
            zip_path = os.path.join(dest_dir, "_download.zip")
            try:
                os.makedirs(dest_dir, exist_ok=True)

                if not _REQUESTS_AVAILABLE:
                    raise RuntimeError("Biblioteca 'requests' não está instalada.\nExecute: pip install requests")

                # Download com progresso
                resp = requests.get(pack.url, stream=True, timeout=30)
                resp.raise_for_status()

                total = int(resp.headers.get("content-length", 0))
                downloaded = 0
                on_progress(0)

                with open(zip_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total > 0:
                                pct = int(downloaded * 100 / total)
                                on_progress(min(pct, 99))

                on_progress(99)

                # Extração
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(dest_dir)

                os.remove(zip_path)
                on_progress(100)

                # Registra instalação
                installed = InstalledPack(
                    id=pack.id,
                    name=pack.name,
                    install_path=dest_dir,
                    installed_at=datetime.now().isoformat(),
                    version=pack.version,
                )
                self._installed[pack.id] = installed
                self._save_registry()

                on_done(True, "")

            except Exception as exc:
                # Limpeza parcial
                if os.path.isfile(zip_path):
                    try:
                        os.remove(zip_path)
                    except Exception:
                        pass
                on_done(False, str(exc))

        threading.Thread(target=_worker, daemon=True).start()

    # ------------------------------------------------------------------ #
    #  Desinstalação                                                       #
    # ------------------------------------------------------------------ #

    def uninstall_pack(self, pack_id: str) -> bool:
        """Remove um pacote instalado. Retorna True em caso de sucesso."""
        installed = self._installed.get(pack_id)
        if not installed:
            return False
        try:
            shutil.rmtree(installed.install_path, ignore_errors=True)
        except Exception:
            pass
        del self._installed[pack_id]
        self._save_registry()
        return True

    # ------------------------------------------------------------------ #
    #  Consultas                                                           #
    # ------------------------------------------------------------------ #

    def is_installed(self, pack_id: str) -> bool:
        return pack_id in self._installed

    def get_install_path(self, pack_id: str) -> Optional[str]:
        installed = self._installed.get(pack_id)
        return installed.install_path if installed else None

    # ------------------------------------------------------------------ #
    #  Registro (persistência)                                             #
    # ------------------------------------------------------------------ #

    def _load_registry(self) -> None:
        try:
            with open(self.registry_path, encoding="utf-8") as f:
                data = json.load(f)
            for entry in data.get("installed", []):
                p = InstalledPack(**entry)
                self._installed[p.id] = p
        except Exception:
            pass

    def _save_registry(self) -> None:
        data = {"installed": [asdict(p) for p in self._installed.values()]}
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


# ------------------------------------------------------------------ #
#  Helpers                                                             #
# ------------------------------------------------------------------ #

def _parse_catalog(data: dict) -> list:
    """Converte dict do catalog.json em lista de PackInfo."""
    packs = []
    for entry in data.get("packs", []):
        try:
            packs.append(PackInfo(
                id=entry["id"],
                name=entry.get("name", entry["id"]),
                description=entry.get("description", ""),
                url=entry.get("url", ""),
                size_mb=float(entry.get("size_mb", 0)),
                category=entry.get("category", "misc"),
                license=entry.get("license", ""),
                thumbnail_url=entry.get("thumbnail_url", ""),
                version=entry.get("version", "1.0"),
                image_count=int(entry.get("image_count", 0)),
                tags=entry.get("tags", []),
            ))
        except (KeyError, TypeError, ValueError):
            pass
    return packs
