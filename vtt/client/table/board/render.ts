// Desenho do tabuleiro em Canvas 2D: página, camadas, grade, desenhos, moldes, cartas,
// condições, auras, névoa, escuridão, portas, réguas e pings.
import type { Deck, DoorSeg, Graphic, Layer, Page, Player } from "../../../shared/types.ts";
import { CONDITION_BY_ID } from "../conditions.ts";
import { cardBack, cardFace } from "./cards.ts";
import { drawGlow, hexA, type LightState } from "./lighting.ts";
import { graphicShape, shapeCells, tplLabel, type TplShape } from "./templates.ts";

export interface View { x: number; y: number; zoom: number } // tela = mundo * zoom + (x, y)
export interface Ruler { pts: number[]; color: string; label: string }
export interface Ping { x: number; y: number; color: string; t0: number }

export interface Scene {
  page: Page;
  graphics: Graphic[];             // já filtrados e ordenados (camada, z)
  gm: boolean;
  playerId: string | null;
  players: Record<string, Player>;
  selected: Set<string>;
  activeLayer: Layer;
  fogCells: Uint8Array | null;     // null = névoa desligada
  fogCanvas: HTMLCanvasElement | null;
  rulers: Ruler[];
  pings: Ping[];
  fogPreview: { x: number; y: number; w: number; h: number; hide: boolean } | null; // em células
  turnId: string | null;           // token da vez na iniciativa
  decks: Record<string, Deck>;
  hidden: Set<string> | null;      // gráficos que o jogador não enxerga (escuro)
  darkness: HTMLCanvasElement | null; // máscara já pronta, em pixels de tela
  light: LightState | null;
  doorVisible: ((d: DoorSeg) => boolean) | null; // null = todas
  showWalls: boolean;
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  draft: Graphic | null;           // desenho/molde sendo criado
  wallDraft: number[] | null;      // polilinha de paredes em andamento (mundo)
}

const LAYER_ORDER: Record<Layer, number> = { map: 0, tokens: 1, gm: 2 };
export const VOID = "#0c0d10";
const ACCENT = "#d4a73a";
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

export function sortGraphics(list: Graphic[]): Graphic[] {
  return list.sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] || a.z - b.z);
}

// ─── Imagens ─────────────────────────────────────────────────────────────────

const images = new Map<string, HTMLImageElement>();
let onImageLoad: () => void = () => {};
export function setImageListener(fn: () => void) {
  onImageLoad = fn;
}
export function getImage(src: string): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.onload = () => onImageLoad();
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// ─── Névoa ───────────────────────────────────────────────────────────────────

const FOG_PX = 8; // px por célula na máscara

/** Máscara (preto = escondido) com borda suave; inclui 1 célula de margem escondida em volta. */
export function buildFogCanvas(cells: Uint8Array, cols: number, rows: number): HTMLCanvasElement {
  const mask = document.createElement("canvas");
  mask.width = (cols + 2) * FOG_PX;
  mask.height = (rows + 2) * FOG_PX;
  const m = mask.getContext("2d")!;
  m.fillStyle = "#000";
  m.fillRect(0, 0, mask.width, mask.height);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (cells[y * cols + x]) m.clearRect((x + 1) * FOG_PX, (y + 1) * FOG_PX, FOG_PX, FOG_PX);
    }
  }
  const out = document.createElement("canvas");
  out.width = mask.width;
  out.height = mask.height;
  const o = out.getContext("2d")!;
  o.filter = `blur(${FOG_PX * 0.3}px)`;
  o.drawImage(mask, 0, 0);
  return out;
}

// ─── Peças ───────────────────────────────────────────────────────────────────

function initials(name?: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function controlled(g: Graphic, playerId: string | null): boolean {
  return g.controlledBy.includes("all") || (!!playerId && g.controlledBy.includes(playerId));
}

function cellRevealed(scene: Scene, g: Graphic): boolean {
  if (!scene.fogCells) return true;
  const gs = scene.page.gridSize;
  const cx = Math.floor((g.x + g.w / 2) / gs);
  const cy = Math.floor((g.y + g.h / 2) / gs);
  if (cx < 0 || cy < 0 || cx >= scene.page.cols || cy >= scene.page.rows) return false;
  return scene.fogCells[cy * scene.page.cols + cx] === 1;
}

function tracePath(ctx: CanvasRenderingContext2D, pts: number[], ox: number, oy: number) {
  ctx.moveTo(ox + pts[0], oy + pts[1]);
  if (pts.length <= 4) {
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(ox + pts[i], oy + pts[i + 1]);
    return;
  }
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2;
    const my = (pts[i + 1] + pts[i + 3]) / 2;
    ctx.quadraticCurveTo(ox + pts[i], oy + pts[i + 1], ox + mx, oy + my);
  }
  ctx.lineTo(ox + pts[pts.length - 2], oy + pts[pts.length - 1]);
}

function drawTemplate(ctx: CanvasRenderingContext2D, s: TplShape, color: string, page: Page, z: number) {
  const gs = page.gridSize;
  ctx.save();
  ctx.fillStyle = hexA(color, 0.13);
  for (const [cx, cy] of shapeCells(s, page)) ctx.fillRect(cx * gs + 1 / z, cy * gs + 1 / z, gs - 2 / z, gs - 2 / z);
  ctx.beginPath();
  if (s.circle) ctx.arc(s.circle.x, s.circle.y, s.circle.r, 0, Math.PI * 2);
  else {
    const p = s.poly!;
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
  }
  ctx.fillStyle = hexA(color, 0.2);
  ctx.fill();
  ctx.strokeStyle = hexA(color, 0.9);
  ctx.lineWidth = 2 / z;
  ctx.stroke();
  ctx.restore();
}

function drawCard(ctx: CanvasRenderingContext2D, g: Graphic, scene: Scene, z: number) {
  const deck = g.card ? scene.decks[g.card.deckId] : undefined;
  const card = deck?.cards.find((c) => c.id === g.card!.cardId);
  const mine = scene.gm || controlled(g, scene.playerId);
  const showFace = !!card && (g.card!.faceUp || mine);
  const img = deck ? (showFace ? cardFace(deck, card!) : cardBack(deck)) : null;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 8 / z;
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.w, g.h, Math.min(g.w, g.h) * 0.07);
  ctx.fillStyle = "#222";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.clip();
  if (img) {
    if (showFace && !g.card!.faceUp) ctx.globalAlpha = 0.75;
    ctx.drawImage(img, g.x, g.y, g.w, g.h);
  }
  ctx.restore();
  if (showFace && !g.card!.faceUp) {
    const s = Math.min(g.w, g.h) * 0.22;
    ctx.font = `${s}px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🙈", g.x + g.w - s * 0.7, g.y + s * 0.7);
  }
}

function drawGraphic(ctx: CanvasRenderingContext2D, g: Graphic, scene: Scene, z: number) {
  const gs = scene.page.gridSize;
  switch (g.kind) {
    case "text": {
      ctx.fillStyle = g.color ?? "#ffffff";
      ctx.font = `700 ${Math.max(8, g.h * 0.7)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, g.h * 0.12);
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(g.text ?? "", g.x + g.w / 2, g.y + g.h / 2);
      ctx.fillText(g.text ?? "", g.x + g.w / 2, g.y + g.h / 2);
      if (g.link && scene.gm) {
        ctx.font = `${Math.max(8, g.h * 0.5)}px ${EMOJI_FONT}`;
        ctx.fillText("🔗", g.x + g.w / 2, g.y - g.h * 0.2);
      }
      return;
    }
    case "path": {
      if (!g.pts || g.pts.length < 4) return;
      ctx.save();
      ctx.beginPath();
      tracePath(ctx, g.pts, g.x, g.y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = g.stroke ?? "#e74c3c";
      ctx.lineWidth = g.strokeWidth ?? 4;
      if (g.fill) {
        ctx.closePath();
        ctx.fillStyle = hexA(g.fill, 0.3);
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "shape": {
      ctx.save();
      ctx.beginPath();
      if (g.shape === "ellipse") ctx.ellipse(g.x + g.w / 2, g.y + g.h / 2, g.w / 2, g.h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(g.x, g.y, g.w, g.h);
      if (g.fill) {
        ctx.fillStyle = hexA(g.fill, 0.3);
        ctx.fill();
      }
      ctx.strokeStyle = g.stroke ?? "#e74c3c";
      ctx.lineWidth = g.strokeWidth ?? 4;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "template": {
      const s = graphicShape(g, gs);
      if (s) drawTemplate(ctx, s, g.color ?? ACCENT, scene.page, z);
      if (scene.selected.has(g.id) && g.tpl) label(ctx, tplLabel(g.tpl, scene.page), g.x + g.tpl.ox, g.y + g.tpl.oy, z);
      return;
    }
    case "card":
      drawCard(ctx, g, scene, z);
      return;
  }
  const img = g.src ? getImage(g.src) : null;
  if (img) {
    ctx.drawImage(img, g.x, g.y, g.w, g.h);
  } else if (g.kind === "token") {
    const r = Math.min(g.w, g.h) / 2;
    ctx.beginPath();
    ctx.arc(g.x + g.w / 2, g.y + g.h / 2, r * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = g.color ?? "#c0392b";
    ctx.fill();
    ctx.lineWidth = r * 0.1;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${r * 0.8}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(g.name), g.x + g.w / 2, g.y + g.h / 2 + r * 0.04);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(g.x, g.y, g.w, g.h);
  }
  if (g.kind === "token") drawTokenExtras(ctx, g, scene, z);
}

function drawTokenExtras(ctx: CanvasRenderingContext2D, g: Graphic, scene: Scene, z: number) {
  const gs = scene.page.gridSize;
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  // Anel com a cor do jogador que controla o token
  const owner = g.controlledBy.find((id) => scene.players[id]);
  if (owner) {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(g.w, g.h) / 2, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2 / z, gs * 0.04);
    ctx.strokeStyle = scene.players[owner].color;
    ctx.stroke();
  }
  const markers = g.markers ?? [];
  if (markers.includes("dead")) {
    ctx.save();
    ctx.fillStyle = "rgba(20,20,20,0.45)";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(g.w, g.h) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e5484d";
    ctx.lineWidth = Math.max(3 / z, gs * 0.08);
    ctx.lineCap = "round";
    const k = Math.min(g.w, g.h) * 0.32;
    ctx.beginPath();
    ctx.moveTo(cx - k, cy - k);
    ctx.lineTo(cx + k, cy + k);
    ctx.moveTo(cx + k, cy - k);
    ctx.lineTo(cx - k, cy + k);
    ctx.stroke();
    ctx.restore();
  }
  if (g.bar && g.bar.max > 0) {
    const ratio = Math.max(0, Math.min(1, g.bar.value / g.bar.max));
    const bh = Math.max(5 / z, gs * 0.08);
    const by = g.y - bh - 3 / z;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(g.x, by, g.w, bh);
    ctx.fillStyle = ratio > 0.5 ? "#3dd68c" : ratio > 0.25 ? "#f5c542" : "#e5484d";
    ctx.fillRect(g.x, by, g.w * ratio, bh);
  }
  const icons = markers.filter((m) => m !== "dead").map((m) => CONDITION_BY_ID.get(m)?.icon ?? "•");
  if (icons.length) {
    const s = Math.max(12 / z, Math.min(g.w, g.h) * 0.26);
    const max = Math.max(1, Math.floor(g.w / (s * 0.9)));
    icons.slice(0, max).forEach((ic, i) => {
      const x = g.x + g.w - s / 2 - i * s * 0.9;
      const y = g.y + s / 2;
      ctx.beginPath();
      ctx.arc(x, y, s / 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15,16,20,0.85)";
      ctx.fill();
      ctx.font = `${s * 0.66}px ${EMOJI_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(i === max - 1 && icons.length > max ? `+${icons.length - max + 1}` : ic, x, y + s * 0.04);
    });
  }
  if (g.showName && g.name) {
    const fs = 12 / z;
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(g.name).width;
    const px = 5 / z;
    const ty = g.y + g.h + 3 / z;
    ctx.fillStyle = "rgba(15,16,20,0.82)";
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - px, ty, tw + px * 2, fs * 1.45, 4 / z);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(g.name, cx, ty + fs * 0.2);
  }
}

function drawAura(ctx: CanvasRenderingContext2D, g: Graphic, page: Page) {
  if (!g.aura || g.aura.radius <= 0) return;
  const r = Math.min(g.w, g.h) / 2 + (g.aura.radius / page.scale) * page.gridSize;
  ctx.save();
  ctx.beginPath();
  ctx.arc(g.x + g.w / 2, g.y + g.h / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = hexA(g.aura.color, 0.16);
  ctx.fill();
  ctx.strokeStyle = hexA(g.aura.color, 0.55);
  ctx.lineWidth = Math.max(1, page.gridSize * 0.03);
  ctx.stroke();
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, z: number) {
  const fs = 14 / z;
  ctx.save();
  ctx.font = `700 ${fs}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(15,16,20,0.9)";
  ctx.beginPath();
  ctx.roundRect(x + 10 / z, y - fs * 1.6, tw + 14 / z, fs * 1.6, 5 / z);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 17 / z, y - fs * 0.8);
  ctx.restore();
}

function drawDoors(ctx: CanvasRenderingContext2D, scene: Scene, z: number) {
  for (const d of scene.page.doors ?? []) {
    const mx = (d.x1 + d.x2) / 2;
    const my = (d.y1 + d.y2) / 2;
    if (scene.doorVisible && !scene.doorVisible(d)) continue;
    const ang = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    // segmento da porta
    ctx.strokeStyle = d.open ? "rgba(61,214,140,0.55)" : d.secret ? "#9b59b6" : d.locked ? "#e5484d" : "#e0902f";
    ctx.lineWidth = Math.max(3 / z, scene.page.gridSize * 0.06);
    ctx.setLineDash(d.open ? [6 / z, 6 / z] : []);
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(len / 2, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    // ícone clicável
    ctx.rotate(-ang);
    const r = 9 / z;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15,16,20,0.9)";
    ctx.fill();
    ctx.lineWidth = 2 / z;
    ctx.stroke();
    ctx.font = `${r * 1.15}px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(d.locked && !d.open ? "🔒" : d.open ? "🚪" : d.secret ? "❔" : "🚪", 0, r * 0.08);
    ctx.restore();
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, scene: Scene, z: number) {
  const w = scene.page.walls ?? [];
  ctx.save();
  ctx.strokeStyle = "rgba(90,170,255,0.85)";
  ctx.lineWidth = 3 / z;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i + 3 < w.length; i += 4) {
    ctx.moveTo(w[i], w[i + 1]);
    ctx.lineTo(w[i + 2], w[i + 3]);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(90,170,255,0.95)";
  for (let i = 0; i + 3 < w.length; i += 4) {
    ctx.fillRect(w[i] - 2.5 / z, w[i + 1] - 2.5 / z, 5 / z, 5 / z);
    ctx.fillRect(w[i + 2] - 2.5 / z, w[i + 3] - 2.5 / z, 5 / z, 5 / z);
  }
  ctx.restore();
}

/** Desenha a cena. Retorna true se há animação em andamento (pings, token da vez). */
export function drawScene(
  ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number, view: View, scene: Scene, now: number,
): boolean {
  const { page } = scene;
  const gs = page.gridSize;
  const pw = page.cols * gs;
  const ph = page.rows * gs;
  const z = view.zoom;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, width * dpr, height * dpr);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.x, dpr * view.y);
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = page.bg;
  ctx.fillRect(0, 0, pw, ph);

  const visible = (g: Graphic) => !scene.hidden?.has(g.id);
  const byLayer = (layer: Layer) => scene.graphics.filter((g) => g.layer === layer);

  for (const g of byLayer("map")) drawGraphic(ctx, g, scene, z);

  // Grade
  if (page.grid === "square" && gs * z >= 6 && page.gridOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = page.gridOpacity;
    ctx.strokeStyle = page.gridColor;
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (let x = 0; x <= page.cols; x++) {
      ctx.moveTo(x * gs, 0);
      ctx.lineTo(x * gs, ph);
    }
    for (let y = 0; y <= page.rows; y++) {
      ctx.moveTo(0, y * gs);
      ctx.lineTo(pw, y * gs);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Névoa: opaca para jogadores, translúcida para o mestre
  if (scene.fogCells && scene.fogCanvas) {
    ctx.save();
    ctx.globalAlpha = scene.gm ? 0.5 : 1;
    ctx.drawImage(scene.fogCanvas, -gs, -gs, pw + gs * 2, ph + gs * 2);
    ctx.restore();
  }

  const tokenLayer = byLayer("tokens");
  const showOnTable = (g: Graphic) => {
    if (scene.gm) return true;
    if (controlled(g, scene.playerId)) return true;
    if (g.kind === "token" || g.kind === "card") return cellRevealed(scene, g) && visible(g);
    return true;
  };
  for (const g of tokenLayer) if (g.kind === "token" && showOnTable(g)) drawAura(ctx, g, page);
  if (scene.gm) for (const g of byLayer("gm")) if (g.kind === "token") drawAura(ctx, g, page);
  if (scene.light) drawGlow(ctx, scene.light);
  for (const g of tokenLayer) if (showOnTable(g)) drawGraphic(ctx, g, scene, z);
  if (scene.gm) {
    ctx.save();
    ctx.globalAlpha = scene.activeLayer === "gm" ? 1 : 0.55;
    for (const g of byLayer("gm")) drawGraphic(ctx, g, scene, z);
    ctx.restore();
  }

  // Token da vez (anel dourado pulsando)
  let animating = false;
  const turn = scene.turnId ? scene.graphics.find((g) => g.id === scene.turnId) : undefined;
  if (turn && (scene.gm || (turn.layer !== "gm" && showOnTable(turn)))) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.lineWidth = (3 + pulse * 2) / z;
    ctx.beginPath();
    ctx.arc(turn.x + turn.w / 2, turn.y + turn.h / 2, Math.max(turn.w, turn.h) / 2 + 6 / z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    animating = true;
  }

  // Escuridão (iluminação dinâmica)
  if (scene.darkness) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scene.darkness, 0, 0);
    ctx.restore();
  }
  if (page.light?.on && page.doors?.length) drawDoors(ctx, scene, z);
  if (scene.showWalls) drawWalls(ctx, scene, z);

  // Seleção
  for (const g of scene.graphics) {
    if (!scene.selected.has(g.id)) continue;
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.strokeRect(g.x - 2 / z, g.y - 2 / z, g.w + 4 / z, g.h + 4 / z);
    ctx.setLineDash([]);
    if (scene.gm && scene.selected.size === 1 && g.kind !== "template") {
      const hs = 10 / z;
      ctx.fillStyle = ACCENT;
      ctx.fillRect(g.x + g.w - hs / 2, g.y + g.h - hs / 2, hs, hs);
    }
    ctx.restore();
  }

  // Rascunhos: desenho/molde em criação, paredes, retângulo de seleção
  if (scene.draft) {
    drawGraphic(ctx, scene.draft, { ...scene, selected: new Set([scene.draft.id]) }, z);
  }
  if (scene.wallDraft && scene.wallDraft.length >= 4) {
    ctx.save();
    ctx.strokeStyle = "rgba(90,170,255,0.95)";
    ctx.setLineDash([8 / z, 5 / z]);
    ctx.lineWidth = 3 / z;
    ctx.beginPath();
    const p = scene.wallDraft;
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
    ctx.restore();
  }
  if (scene.marquee) {
    const m = scene.marquee;
    ctx.save();
    ctx.fillStyle = "rgba(212,167,58,0.08)";
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.fillRect(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    ctx.strokeRect(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1), Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    ctx.restore();
  }

  // Prévia da névoa (retângulo / pincel)
  if (scene.fogPreview) {
    const f = scene.fogPreview;
    ctx.save();
    ctx.fillStyle = f.hide ? "rgba(0,0,0,0.35)" : "rgba(212,167,58,0.18)";
    ctx.strokeStyle = f.hide ? "#000" : ACCENT;
    ctx.lineWidth = 2 / z;
    ctx.fillRect(f.x * gs, f.y * gs, f.w * gs, f.h * gs);
    ctx.strokeRect(f.x * gs, f.y * gs, f.w * gs, f.h * gs);
    ctx.restore();
  }

  // Réguas
  for (const r of scene.rulers) {
    if (r.pts.length < 4) continue;
    ctx.save();
    ctx.strokeStyle = r.color;
    ctx.fillStyle = r.color;
    ctx.lineWidth = 3 / z;
    ctx.setLineDash([10 / z, 6 / z]);
    ctx.beginPath();
    ctx.moveTo(r.pts[0], r.pts[1]);
    for (let i = 2; i < r.pts.length; i += 2) ctx.lineTo(r.pts[i], r.pts[i + 1]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < r.pts.length; i += 2) {
      ctx.beginPath();
      ctx.arc(r.pts[i], r.pts[i + 1], 5 / z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    label(ctx, r.label, r.pts[r.pts.length - 2], r.pts[r.pts.length - 1], z);
  }

  // Pings
  for (const p of scene.pings) {
    const t = (now - p.t0) / 1600;
    if (t < 0 || t > 1) continue;
    animating = true;
    ctx.save();
    for (let k = 0; k < 2; k++) {
      const tt = (t + k * 0.3) % 1;
      ctx.globalAlpha = 1 - tt;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4 / z;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (8 + tt * 60) / z, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  return animating;
}
