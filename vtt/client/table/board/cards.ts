// Cartas: baralhos prontos e desenho das faces/verso (gerados no navegador, sem imagens).
import type { Card, Deck } from "../../../shared/types.ts";
import { newId } from "../../../shared/util.ts";
import { getImage } from "./render.ts";

const W = 250;
const H = 350;
const SUITS = [["♠", "Espadas", "#1d1d1d"], ["♥", "Copas", "#c0392b"], ["♦", "Ouros", "#c0392b"], ["♣", "Paus", "#1d1d1d"]] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_NAME: Record<string, string> = { A: "Ás", J: "Valete", Q: "Dama", K: "Rei" };

const TAROT: [string, string][] = [
  ["O Louco", "☀"], ["O Mago", "✦"], ["A Sacerdotisa", "☾"], ["A Imperatriz", "♀"], ["O Imperador", "♔"], ["O Hierofante", "✚"],
  ["Os Enamorados", "♡"], ["O Carro", "⚔"], ["A Força", "∞"], ["O Eremita", "✧"], ["A Roda da Fortuna", "☸"], ["A Justiça", "⚖"],
  ["O Enforcado", "⚓"], ["A Morte", "☠"], ["A Temperança", "☯"], ["O Diabo", "♄"], ["A Torre", "⚡"], ["A Estrela", "★"],
  ["A Lua", "☽"], ["O Sol", "☼"], ["O Julgamento", "♪"], ["O Mundo", "◎"],
];
const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

export function standardDeck(): Deck {
  const cards: Card[] = [];
  for (const [sym, suitName] of SUITS) {
    for (const r of RANKS) cards.push({ id: newId(8), name: `${RANK_NAME[r] ?? r} de ${suitName}`, suit: sym, rank: r });
  }
  cards.push({ id: newId(8), name: "Coringa", rank: "JOKER", suit: "★" }, { id: newId(8), name: "Coringa", rank: "JOKER", suit: "☆" });
  return { id: newId(), name: "Baralho comum", kind: "standard", cards, pile: cards.map((c) => c.id), discard: [], hands: {} };
}

export function tarotDeck(): Deck {
  const cards: Card[] = TAROT.map(([name, sym], i) => ({ id: newId(8), name, suit: sym, rank: ROMAN[i] }));
  return { id: newId(), name: "Tarô (Arcanos Maiores)", kind: "tarot", cards, pile: cards.map((c) => c.id), discard: [], hands: {} };
}

export function customDeck(name: string, cards: Omit<Card, "id">[]): Deck {
  const list = cards.map((c) => ({ ...c, id: newId(8) }));
  return { id: newId(), name, kind: "custom", cards: list, pile: list.map((c) => c.id), discard: [], hands: {} };
}

const faces = new Map<string, HTMLCanvasElement>();

function base(bg: string, border: string): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  c.fillStyle = bg;
  c.beginPath();
  c.roundRect(2, 2, W - 4, H - 4, 18);
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = border;
  c.stroke();
  return [cv, c];
}

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = "";
  let n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width > maxW && line) {
      c.fillText(line, x, y + n * lh);
      line = w;
      if (++n >= maxLines) return;
    } else line = t;
  }
  if (line) c.fillText(line, x, y + n * lh);
}

/** Face da carta (imagem enviada ou desenho gerado). */
export function cardFace(deck: Deck, card: Card): CanvasImageSource | null {
  if (card.image) return getImage(card.image);
  const key = `${deck.id}:${card.id}`;
  let cv = faces.get(key);
  if (cv) return cv;
  let c: CanvasRenderingContext2D;
  if (deck.kind === "standard") {
    [cv, c] = base("#fbfaf6", "#2b2b2b");
    const red = card.suit === "♥" || card.suit === "♦";
    c.fillStyle = card.rank === "JOKER" ? (card.suit === "★" ? "#c0392b" : "#1d1d1d") : red ? "#c0392b" : "#1d1d1d";
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (card.rank === "JOKER") {
      c.font = "700 34px Georgia, serif";
      c.fillText("CORINGA", W / 2, 60);
      c.font = "150px Georgia, serif";
      c.fillText(card.suit ?? "★", W / 2, H / 2 + 20);
    } else {
      c.font = "700 40px Georgia, serif";
      c.fillText(card.rank ?? "", 34, 40);
      c.font = "34px Georgia, serif";
      c.fillText(card.suit ?? "", 34, 80);
      c.save();
      c.translate(W - 34, H - 40);
      c.rotate(Math.PI);
      c.font = "700 40px Georgia, serif";
      c.fillText(card.rank ?? "", 0, 0);
      c.font = "34px Georgia, serif";
      c.fillText(card.suit ?? "", 0, -40);
      c.restore();
      const face = ["J", "Q", "K"].includes(card.rank ?? "");
      c.font = face ? "700 120px Georgia, serif" : "140px Georgia, serif";
      c.fillText(face ? card.rank! : card.suit ?? "", W / 2, H / 2 + 6);
      if (face) {
        c.font = "54px Georgia, serif";
        c.fillText(card.suit ?? "", W / 2, H / 2 + 96);
      }
    }
  } else if (deck.kind === "tarot") {
    [cv, c] = base("#2a1f3d", "#d4a73a");
    c.strokeStyle = "rgba(212,167,58,0.6)";
    c.lineWidth = 2;
    c.strokeRect(16, 16, W - 32, H - 32);
    c.fillStyle = "#e8c15a";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "700 30px Georgia, serif";
    c.fillText(card.rank ?? "", W / 2, 46);
    c.font = "130px Georgia, serif";
    c.fillText(card.suit ?? "✦", W / 2, H / 2 + 4);
    c.font = "600 22px Georgia, serif";
    wrap(c, card.name.toUpperCase(), W / 2, H - 58, W - 40, 24, 2);
  } else {
    [cv, c] = base("#f1e6c8", "#5b4630");
    c.fillStyle = "#2c2116";
    c.textAlign = "center";
    c.textBaseline = "top";
    c.font = "700 26px Georgia, serif";
    wrap(c, card.name, W / 2, 26, W - 36, 28, 3);
    c.font = "18px Georgia, serif";
    c.textAlign = "left";
    if (card.text) wrap(c, card.text, 22, 120, W - 44, 22, 9);
  }
  faces.set(key, cv);
  return cv;
}

const urls = new Map<string, string>();
/** URL da face (ou do verso, sem carta) para mostrar fora do tabuleiro: mão e chat. */
export function cardUrl(deck: Deck, card?: Card): string {
  if (card?.image) return card.image;
  if (!card && deck.back) return deck.back;
  const key = card ? `${deck.id}:${card.id}` : "";
  let u = urls.get(key);
  if (u === undefined) {
    const src = card ? cardFace(deck, card) : cardBack(deck);
    u = src instanceof HTMLCanvasElement ? src.toDataURL("image/png") : "";
    urls.set(key, u);
  }
  return u;
}

let backCanvas: HTMLCanvasElement | null = null;
export function cardBack(deck: Deck): CanvasImageSource | null {
  if (deck.back) return getImage(deck.back);
  if (backCanvas) return backCanvas;
  const [cv, c] = base("#5b1f24", "#d4a73a");
  c.save();
  c.beginPath();
  c.roundRect(8, 8, W - 16, H - 16, 14);
  c.clip();
  c.strokeStyle = "rgba(212,167,58,0.55)";
  c.lineWidth = 2;
  for (let i = -H; i < W + H; i += 18) {
    c.beginPath();
    c.moveTo(i, 0);
    c.lineTo(i + H, H);
    c.moveTo(i + H, 0);
    c.lineTo(i, H);
    c.stroke();
  }
  c.restore();
  c.fillStyle = "#5b1f24";
  c.beginPath();
  c.arc(W / 2, H / 2, 46, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#d4a73a";
  c.lineWidth = 4;
  c.stroke();
  c.fillStyle = "#e8c15a";
  c.font = "56px Georgia, serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("✦", W / 2, H / 2 + 2);
  backCanvas = cv;
  return cv;
}
