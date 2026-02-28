"""
DM - Dungeon Music
Gerenciador de Imagens e Sessões.
Permite organizar imagens por sessões (pastas) e exibir na tela de apresentação.
"""

import os
import json
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class ImageItem:
    """Representa uma imagem com metadados."""
    file_path: str
    name: str = ""
    description: str = ""
    stats: dict = field(default_factory=dict)  # Ex: {"Dano": "2d6", "Peso": "1.5kg"}
    effects: list[str] = field(default_factory=list)  # Ex: ["poeira", "brilho"]
    position_x: int = 0
    position_y: int = 0
    scale: float = 1.0
    visible: bool = False  # Só mostra quando o mestre quiser

    def __post_init__(self):
        if not self.name:
            self.name = os.path.splitext(os.path.basename(self.file_path))[0]


@dataclass
class Session:
    """Representa uma sessão de RPG com suas imagens organizadas."""
    name: str
    folder_path: str
    images: list[ImageItem] = field(default_factory=list)
    display_order: list[int] = field(default_factory=list)  # Ordem de slide show

    def add_image(self, file_path: str, **kwargs) -> ImageItem:
        """Adiciona uma imagem à sessão."""
        img = ImageItem(file_path=file_path, **kwargs)
        self.images.append(img)
        self.display_order.append(len(self.images) - 1)
        return img

    def remove_image(self, index: int):
        """Remove uma imagem da sessão."""
        if 0 <= index < len(self.images):
            self.images.pop(index)
            self.display_order = [i for i in self.display_order if i != index]
            # Re-index
            self.display_order = [i if i < index else i - 1 for i in self.display_order]

    def reorder(self, old_index: int, new_index: int):
        """Reordena uma imagem no slide show."""
        if 0 <= old_index < len(self.display_order) and 0 <= new_index < len(self.display_order):
            item = self.display_order.pop(old_index)
            self.display_order.insert(new_index, item)


class SessionManager:
    """Gerencia sessões de RPG com imagens."""

    def __init__(self, data_dir: str = ""):
        self.data_dir = data_dir or os.path.join(os.path.expanduser("~"), ".dm_dungeon_music")
        self.sessions_dir = os.path.join(self.data_dir, "sessions")
        self.sessions: dict[str, Session] = {}
        self._ensure_dirs()
        self._load_sessions()

    def _ensure_dirs(self):
        """Cria diretórios necessários."""
        os.makedirs(self.sessions_dir, exist_ok=True)

    def create_session(self, name: str) -> Session:
        """Cria uma nova sessão."""
        folder_path = os.path.join(self.sessions_dir, name)
        os.makedirs(folder_path, exist_ok=True)
        session = Session(name=name, folder_path=folder_path)
        self.sessions[name] = session
        self._save_session(session)
        return session

    def delete_session(self, name: str):
        """Remove uma sessão (mantém os arquivos de imagem)."""
        if name in self.sessions:
            # Remove apenas o arquivo de metadados
            meta_path = os.path.join(self.sessions_dir, name, "_session.json")
            if os.path.isfile(meta_path):
                os.remove(meta_path)
            del self.sessions[name]

    def get_session(self, name: str) -> Optional[Session]:
        """Retorna uma sessão pelo nome."""
        return self.sessions.get(name)

    def list_sessions(self) -> list[str]:
        """Lista nomes de todas as sessões."""
        return list(self.sessions.keys())

    def add_image_to_session(self, session_name: str, file_path: str, **kwargs) -> Optional[ImageItem]:
        """Adiciona uma imagem a uma sessão."""
        session = self.sessions.get(session_name)
        if session is None:
            return None
        img = session.add_image(file_path, **kwargs)
        self._save_session(session)
        return img

    def update_image_stats(self, session_name: str, image_index: int, stats: dict):
        """Atualiza os stats de uma imagem (para itens de RPG)."""
        session = self.sessions.get(session_name)
        if session and 0 <= image_index < len(session.images):
            session.images[image_index].stats = stats
            self._save_session(session)

    def set_image_visibility(self, session_name: str, image_index: int, visible: bool):
        """Controla se uma imagem é visível na apresentação."""
        session = self.sessions.get(session_name)
        if session and 0 <= image_index < len(session.images):
            session.images[image_index].visible = visible
            self._save_session(session)

    def set_image_effects(self, session_name: str, image_index: int, effects: list[str]):
        """Define efeitos visuais para uma imagem."""
        session = self.sessions.get(session_name)
        if session and 0 <= image_index < len(session.images):
            session.images[image_index].effects = effects
            self._save_session(session)

    def _save_session(self, session: Session):
        """Salva metadados da sessão em JSON."""
        meta_path = os.path.join(session.folder_path, "_session.json")
        data = {
            "name": session.name,
            "folder_path": session.folder_path,
            "images": [asdict(img) for img in session.images],
            "display_order": session.display_order,
        }
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _load_sessions(self):
        """Carrega todas as sessões existentes."""
        if not os.path.isdir(self.sessions_dir):
            return
        for entry in os.listdir(self.sessions_dir):
            folder = os.path.join(self.sessions_dir, entry)
            meta_path = os.path.join(folder, "_session.json")
            if os.path.isdir(folder) and os.path.isfile(meta_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    session = Session(
                        name=data["name"],
                        folder_path=data["folder_path"],
                        images=[ImageItem(**img) for img in data.get("images", [])],
                        display_order=data.get("display_order", []),
                    )
                    self.sessions[session.name] = session
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass  # Ignora sessões corrompidas

    def scan_folder_for_images(self, folder_path: str) -> list[str]:
        """Escaneia uma pasta por arquivos de imagem."""
        supported = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}
        images = []
        if os.path.isdir(folder_path):
            for f in sorted(os.listdir(folder_path)):
                ext = os.path.splitext(f)[1].lower()
                if ext in supported:
                    images.append(os.path.join(folder_path, f))
        return images

    def import_folder_as_session(self, folder_path: str, session_name: str = "") -> Session:
        """Importa uma pasta inteira como uma sessão."""
        if not session_name:
            session_name = os.path.basename(folder_path)
        session = self.create_session(session_name)
        for img_path in self.scan_folder_for_images(folder_path):
            session.add_image(img_path)
        self._save_session(session)
        return session


# ═══════════════════════════════════════════════
# Sessões de Áudio
# ═══════════════════════════════════════════════

@dataclass
class AudioSession:
    """Representa uma sessão de áudio com faixas organizadas."""
    name: str
    tracks: list[dict] = field(default_factory=list)  # [{file_path, volume}, ...]


class AudioSessionManager:
    """Gerencia sessões de áudio (músicas ou efeitos sonoros)."""

    def __init__(self, data_dir: str = "", subfolder: str = "music"):
        self.data_dir = data_dir or os.path.join(os.path.expanduser("~"), ".dm_dungeon_music")
        self.sessions_dir = os.path.join(self.data_dir, "audio_sessions", subfolder)
        self.sessions: dict[str, AudioSession] = {}
        self._ensure_dirs()
        self._load_sessions()

    def _ensure_dirs(self):
        os.makedirs(self.sessions_dir, exist_ok=True)

    def create_session(self, name: str) -> AudioSession:
        """Cria uma nova sessão de áudio."""
        session = AudioSession(name=name)
        self.sessions[name] = session
        self._save_session(session)
        return session

    def delete_session(self, name: str):
        """Remove uma sessão de áudio."""
        if name in self.sessions:
            safe_name = self._safe_filename(name)
            path = os.path.join(self.sessions_dir, f"{safe_name}.json")
            if os.path.isfile(path):
                os.remove(path)
            del self.sessions[name]

    def get_session(self, name: str) -> Optional[AudioSession]:
        return self.sessions.get(name)

    def list_sessions(self) -> list[str]:
        return list(self.sessions.keys())

    def save_session_tracks(self, session_name: str, tracks_data: list[dict]):
        """Salva (sobrescreve) a lista de faixas de uma sessão."""
        session = self.sessions.get(session_name)
        if session:
            session.tracks = tracks_data
            self._save_session(session)

    def import_folder(self, folder_path: str, session_name: str = "") -> Optional[AudioSession]:
        """Importa todos os arquivos de áudio de uma pasta como sessão."""
        if not os.path.isdir(folder_path):
            return None
        if not session_name:
            session_name = os.path.basename(folder_path)

        supported = {'.mp3', '.wav', '.ogg', '.flac', '.opus', '.webm', '.m4a'}
        tracks = []
        for f in sorted(os.listdir(folder_path)):
            ext = os.path.splitext(f)[1].lower()
            if ext in supported:
                tracks.append({
                    "file_path": os.path.join(folder_path, f),
                    "volume": 0.7
                })

        if not tracks:
            return None

        session = self.create_session(session_name)
        session.tracks = tracks
        self._save_session(session)
        return session

    def migrate_from_flat_file(self, flat_file: str, session_name: str = "Padrão") -> bool:
        """Importa faixas de formato antigo (JSON plano) para uma sessão.
        Retorna True se a migração ocorreu."""
        if not os.path.isfile(flat_file):
            return False
        if session_name in self.sessions:
            return False  # Já migrado
        try:
            with open(flat_file, 'r', encoding='utf-8') as f:
                tracks = json.load(f)
            if tracks and isinstance(tracks, list):
                session = self.create_session(session_name)
                session.tracks = tracks
                self._save_session(session)
                return True
        except Exception:
            pass
        return False

    @staticmethod
    def _safe_filename(name: str) -> str:
        """Converte nome para nome de arquivo seguro."""
        return name.replace('/', '_').replace('\\', '_').replace(':', '_')

    def _save_session(self, session: AudioSession):
        safe_name = self._safe_filename(session.name)
        path = os.path.join(self.sessions_dir, f"{safe_name}.json")
        data = {"name": session.name, "tracks": session.tracks}
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _load_sessions(self):
        if not os.path.isdir(self.sessions_dir):
            return
        for fname in sorted(os.listdir(self.sessions_dir)):
            if fname.endswith('.json') and not fname.startswith('_'):
                try:
                    path = os.path.join(self.sessions_dir, fname)
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    session = AudioSession(
                        name=data["name"],
                        tracks=data.get("tracks", [])
                    )
                    self.sessions[session.name] = session
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass
