"""
DM - Dungeon Music
Ícones vetoriais simples desenhados via Pillow — substituem emojis por
glifos monocromáticos consistentes, tingíveis conforme o tema ativo.
"""

import math
from PIL import Image, ImageDraw, ImageTk

_SUPERSAMPLE = 4          # desenha em resolução maior e reduz (antialiasing)
_cache: dict = {}         # (name, size, color) -> ImageTk.PhotoImage


def _new_canvas(size: int):
    s = size * _SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img), s


def _finish(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def _draw_palette(draw: ImageDraw.ImageDraw, s: int, color: str):
    m = s * 0.08
    draw.ellipse([m, m, s - m, s - m], outline=color, width=max(1, int(s * 0.07)))
    for cx, cy in [(0.34, 0.36), (0.66, 0.36), (0.30, 0.63), (0.70, 0.63)]:
        r = s * 0.085
        draw.ellipse([s * cx - r, s * cy - r, s * cx + r, s * cy + r], fill=color)


def _draw_swatch(draw: ImageDraw.ImageDraw, s: int, color: str):
    m = s * 0.12
    r = s * 0.22
    draw.rounded_rectangle([m, m, s - m, s - m], radius=r, fill=color)


def _draw_sword(draw: ImageDraw.ImageDraw, s: int, color: str):
    w = max(1, int(s * 0.09))
    # Lâmina (diagonal)
    draw.line([(s * 0.22, s * 0.82), (s * 0.80, s * 0.20)], fill=color, width=w)
    draw.polygon([
        (s * 0.80, s * 0.20), (s * 0.92, s * 0.08),
        (s * 0.80, s * 0.20), (s * 0.92, s * 0.32),
    ], fill=color)
    # Guarda (perpendicular à lâmina)
    draw.line([(s * 0.34, s * 0.56), (s * 0.56, s * 0.78)], fill=color, width=w)
    # Cabo
    draw.line([(s * 0.22, s * 0.82), (s * 0.12, s * 0.92)], fill=color, width=int(w * 1.4))


def _draw_book(draw: ImageDraw.ImageDraw, s: int, color: str):
    w = max(1, int(s * 0.07))
    m = s * 0.16
    draw.rounded_rectangle([m, m, s - m, s - m], radius=s * 0.06, outline=color, width=w)
    draw.line([(s * 0.5, m), (s * 0.5, s - m)], fill=color, width=w)
    for frac in (0.38, 0.55):
        draw.line([(m + s * 0.10, s * frac), (s * 0.46, s * frac)], fill=color, width=max(1, int(w * 0.6)))
        draw.line([(s * 0.54, s * frac), (s - m - s * 0.10, s * frac)], fill=color, width=max(1, int(w * 0.6)))


def _draw_speaker(draw: ImageDraw.ImageDraw, s: int, color: str):
    w = max(1, int(s * 0.08))
    draw.rectangle([s * 0.14, s * 0.38, s * 0.36, s * 0.62], fill=color)
    draw.polygon([
        (s * 0.36, s * 0.38), (s * 0.60, s * 0.18),
        (s * 0.60, s * 0.82), (s * 0.36, s * 0.62),
    ], fill=color)
    for i, r in enumerate((0.12, 0.22)):
        bbox = [s * 0.5 - s * r, s * 0.5 - s * r, s * 0.5 + s * r, s * 0.5 + s * r]
        draw.arc(bbox, start=-40, end=40, fill=color, width=w)


def _draw_globe(draw: ImageDraw.ImageDraw, s: int, color: str):
    w = max(1, int(s * 0.06))
    m = s * 0.12
    draw.ellipse([m, m, s - m, s - m], outline=color, width=w)
    draw.line([(m, s * 0.5), (s - m, s * 0.5)], fill=color, width=w)
    draw.ellipse([s * 0.5 - (s * 0.5 - m) * 0.42, m, s * 0.5 + (s * 0.5 - m) * 0.42, s - m],
                 outline=color, width=w)


def _draw_dice(draw: ImageDraw.ImageDraw, s: int, color: str):
    w = max(1, int(s * 0.07))
    m = s * 0.14
    draw.rounded_rectangle([m, m, s - m, s - m], radius=s * 0.16, outline=color, width=w)
    for cx, cy in [(0.32, 0.32), (0.68, 0.32), (0.5, 0.5), (0.32, 0.68), (0.68, 0.68)]:
        r = s * 0.06
        draw.ellipse([s * cx - r, s * cy - r, s * cx + r, s * cy + r], fill=color)


_DRAW_FUNCS = {
    "palette": _draw_palette,
    "swatch":  _draw_swatch,
    "sword":   _draw_sword,
    "book":    _draw_book,
    "speaker": _draw_speaker,
    "globe":   _draw_globe,
    "dice":    _draw_dice,
}


def icon(name: str, size: int = 16, color: str = "#e2e8f0") -> ImageTk.PhotoImage:
    """Retorna um ícone monocromático renderizado via Pillow, com cache.

    `name` deve ser uma das chaves em `_DRAW_FUNCS`. O resultado é cacheado
    por (nome, tamanho, cor) — chame de novo se o tema/cor mudar.
    """
    key = (name, size, color)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    draw_func = _DRAW_FUNCS.get(name)
    if draw_func is None:
        raise ValueError(f"Ícone desconhecido: {name!r}")

    img, draw, s = _new_canvas(size)
    draw_func(draw, s, color)
    photo = ImageTk.PhotoImage(_finish(img, size))
    _cache[key] = photo
    return photo
