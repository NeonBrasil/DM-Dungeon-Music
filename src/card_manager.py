"""
Gerenciamento e persistência de cartas VTT.
Mestre salva todas as cartas; jogadores salvam apenas as próprias.
"""

from __future__ import annotations

import json
import os
from typing import Iterator

from src.card_entity import CardEntity

_DATA_DIR = os.path.join(os.path.expanduser("~"), ".dm_dungeon_music", "vtt")


class CardManager:
    """CRUD de CardEntity com persistência JSON local."""

    def __init__(self, data_dir: str = _DATA_DIR):
        self._dir = data_dir
        os.makedirs(self._dir, exist_ok=True)
        self._cards: dict[str, CardEntity] = {}

    # ── Persistência ────────────────────────────────────────────────────────

    def load(self, filename: str) -> None:
        path = os.path.join(self._dir, filename)
        if not os.path.isfile(path):
            return
        try:
            with open(path, encoding="utf-8") as f:
                raw: list[dict] = json.load(f)
            self._cards = {d["card_id"]: CardEntity.from_dict(d) for d in raw}
        except Exception:
            pass

    def save(self, filename: str) -> None:
        path = os.path.join(self._dir, filename)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump([c.full_dict() for c in self._cards.values()], f,
                          ensure_ascii=False, indent=2)
        except Exception:
            pass

    # ── CRUD ─────────────────────────────────────────────────────────────────

    def add_card(self, card: CardEntity) -> None:
        self._cards[card.card_id] = card

    def remove_card(self, card_id: str) -> None:
        self._cards.pop(card_id, None)

    def get_card(self, card_id: str) -> CardEntity | None:
        return self._cards.get(card_id)

    def update_card(self, card_id: str, **fields) -> CardEntity | None:
        card = self._cards.get(card_id)
        if card is None:
            return None
        for k, v in fields.items():
            if hasattr(card, k):
                setattr(card, k, v)
        return card

    def all_cards(self) -> list[CardEntity]:
        return list(self._cards.values())

    def visible_cards(self) -> list[CardEntity]:
        return [c for c in self._cards.values() if c.visible]

    def cards_for_player(self, player_id: str) -> list[CardEntity]:
        return [c for c in self._cards.values() if c.owner_player_id == player_id]

    def __iter__(self) -> Iterator[CardEntity]:
        return iter(self._cards.values())

    def __len__(self) -> int:
        return len(self._cards)

    # ── Sync helpers ─────────────────────────────────────────────────────────

    def apply_public_update(self, data: dict) -> CardEntity | None:
        """Aplica update de dados públicos recebido via rede."""
        card_id = data.get("card_id")
        if not card_id:
            return None
        card = self._cards.get(card_id)
        if card is None:
            card = CardEntity.from_dict(data)
            self._cards[card_id] = card
        else:
            for k in ("name", "image_path", "level", "current_hp", "max_hp",
                      "revealed", "visible", "x", "y", "scale", "z_order"):
                if k in data:
                    setattr(card, k, data[k])
        return card

    def apply_full_sync(self, cards_data: list[dict]) -> None:
        """Substitui estado completo (usado em vtt_full_sync)."""
        self._cards = {}
        for d in cards_data:
            card = CardEntity.from_dict(d)
            self._cards[card.card_id] = card
