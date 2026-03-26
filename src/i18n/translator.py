"""
DM - Dungeon Music
Módulo de internacionalização (i18n).
Fornece t() para traduzir strings, load_locale() para carregar idioma,
e current_locale() para saber o idioma ativo.
"""

import json
import os
from pathlib import Path

SUPPORTED_LOCALES: dict[str, str] = {
    "pt_BR": "Português (BR)",
    "en_US": "English (US)",
    "es_ES": "Español (ES)",
}

_LOCALES_DIR = Path(__file__).parent / "locales"
_DEFAULT_LOCALE = "pt_BR"


class Translator:
    """Singleton que carrega e serve strings traduzidas."""

    def __init__(self):
        self._locale: str = _DEFAULT_LOCALE
        self._strings: dict[str, str] = {}
        self._fallback: dict[str, str] = {}

    def load(self, locale: str) -> None:
        """Carrega strings para o locale. Usa pt_BR como fallback."""
        fb_path = _LOCALES_DIR / f"{_DEFAULT_LOCALE}.json"
        try:
            with open(fb_path, encoding="utf-8") as f:
                self._fallback = json.load(f)
        except Exception:
            self._fallback = {}

        if locale == _DEFAULT_LOCALE:
            self._strings = self._fallback
        else:
            path = _LOCALES_DIR / f"{locale}.json"
            try:
                with open(path, encoding="utf-8") as f:
                    self._strings = json.load(f)
            except Exception:
                self._strings = self._fallback

        self._locale = locale

    def get(self, key: str, **kwargs) -> str:
        """Retorna string traduzida. Fallback: pt_BR → a própria key."""
        text = self._strings.get(key) or self._fallback.get(key) or key
        if kwargs:
            try:
                return text.format(**kwargs)
            except (KeyError, ValueError):
                return text
        return text

    @property
    def locale(self) -> str:
        return self._locale


# ── Singleton ──────────────────────────────────────────────────────────────────
_translator = Translator()

# Carrega pt_BR por padrão ao importar o módulo
_translator.load(_DEFAULT_LOCALE)


def t(key: str, **kwargs) -> str:
    """Retorna a string traduzida para a chave dada."""
    return _translator.get(key, **kwargs)


def load_locale(locale: str) -> None:
    """Carrega um novo locale. Deve ser chamado antes de construir qualquer UI."""
    if locale not in SUPPORTED_LOCALES:
        locale = _DEFAULT_LOCALE
    _translator.load(locale)


def current_locale() -> str:
    """Retorna o locale atualmente carregado."""
    return _translator.locale
