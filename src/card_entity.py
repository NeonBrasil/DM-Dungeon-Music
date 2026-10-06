"""
Entidade de carta para o sistema VTT.
Representa jogadores, NPCs e inimigos no tabuleiro virtual.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field

CARD_TYPES = ("player", "npc", "enemy")


@dataclass
class CardEntity:
    # ── Identidade ──────────────────────────────────────────────────────────
    card_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    owner_player_id: str = ""   # "" = mestre; player_id atribuído pelo servidor
    card_type: str = "npc"      # player | npc | enemy

    # ── Face pública (visível para todos após reveal) ────────────────────────
    name: str = "Sem Nome"
    image_path: str = ""        # path local — cada máquina carrega o seu
    level: int = 1
    current_hp: int = 10
    max_hp: int = 10

    # ── Stats ocultos (apenas mestre + dono) ────────────────────────────────
    # D&D 5e base
    strength: int = 10
    dexterity: int = 10
    constitution: int = 10
    intelligence: int = 10
    wisdom: int = 10
    charisma: int = 10
    armor_class: int = 10
    proficiency_bonus: int = 2

    # Stats customizados
    sanity: int = 10
    max_sanity: int = 10
    faith: int = 10
    max_faith: int = 10
    obscur: int = 0
    max_obscur: int = 10

    # Inventário: [{"name": str, "qty": int, "description": str}]
    inventory: list = field(default_factory=list)

    # ── Estado no canvas ────────────────────────────────────────────────────
    x: float = 0.0
    y: float = 0.0
    scale: float = 1.0
    z_order: int = 0

    # ── Controle de visibilidade ────────────────────────────────────────────
    revealed: bool = False  # False = virada de costas para jogadores
    visible: bool = True    # False = oculta do canvas (mestre ainda vê)

    # ── Métodos de serialização ─────────────────────────────────────────────
    def public_dict(self) -> dict:
        """Dados que todos podem ver (face da carta)."""
        return {
            "card_id": self.card_id,
            "card_type": self.card_type,
            "name": self.name,
            "image_path": self.image_path,
            "level": self.level,
            "current_hp": self.current_hp,
            "max_hp": self.max_hp,
            "revealed": self.revealed,
            "visible": self.visible,
            "x": self.x,
            "y": self.y,
            "scale": self.scale,
            "z_order": self.z_order,
        }

    def full_dict(self) -> dict:
        """Dados completos — mestre ou dono da carta."""
        return asdict(self)

    def is_dead(self) -> bool:
        return self.current_hp <= 0

    @staticmethod
    def from_dict(data: dict) -> "CardEntity":
        known = {f.name for f in CardEntity.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        return CardEntity(**{k: v for k, v in data.items() if k in known})
