// Iluminação dinâmica no cliente: polígonos de visão dos tokens que o usuário controla,
// fontes de luz, visão no escuro e a máscara de escuridão (com memória do que já foi visto).
import type { Graphic, Page } from "../../../shared/types.ts";
import { blockingSegments, pointInPolygon, visibilityPolygon, type Seg } from "../../../shared/vision.ts";
import type { View } from "./render.ts";

export interface Viewer { x: number; y: number; dark: number; poly: number[] }
export interface LightSrc { x: number; y: number; bright: number; dim: number; color: string; poly: number[] }
export interface LightState { key: string; viewers: Viewer[]; lights: LightSrc[]; global: boolean }

const polyCache = new Map<string, number[]>();
let wallsKey = "";

const toPx = (units: number, page: Page) => (units / page.scale) * page.gridSize;

function poly(x: number, y: number, range: number, segs: Seg[], page: Page): number[] {
  const k = `${Math.round(x)},${Math.round(y)},${Math.round(range)}`;
  let p = polyCache.get(k);
  if (!p) {
    p = visibilityPolygon(x, y, segs, { x0: 0, y0: 0, x1: page.cols * page.gridSize, y1: page.rows * page.gridSize }, range);
    if (polyCache.size > 400) polyCache.clear();
    polyCache.set(k, p);
  }
  return p;
}

/** viewers: tokens cuja visão conta para este usuário. */
export function computeLighting(page: Page, graphics: Graphic[], viewers: Graphic[]): LightState {
  const wk = JSON.stringify([page.id, page.walls, page.doors?.map((d) => [d.x1, d.y1, d.x2, d.y2, d.open])]);
  if (wk !== wallsKey) {
    wallsKey = wk;
    polyCache.clear();
  }
  const segs = blockingSegments(page, true);
  const vs: Viewer[] = viewers.map((g) => {
    const x = g.x + g.w / 2;
    const y = g.y + g.h / 2;
    const range = g.vision?.range ? toPx(g.vision.range, page) : 0;
    return { x, y, dark: g.vision?.dark ? toPx(g.vision.dark, page) : 0, poly: poly(x, y, range, segs, page) };
  });
  const lights: LightSrc[] = [];
  for (const g of graphics) {
    const l = g.light;
    if (!l || l.bright + l.dim <= 0) continue;
    const x = g.x + g.w / 2;
    const y = g.y + g.h / 2;
    const bright = toPx(l.bright, page);
    const dim = toPx(l.dim, page);
    lights.push({ x, y, bright, dim, color: l.color, poly: poly(x, y, bright + dim, segs, page) });
  }
  const key = JSON.stringify([wk, vs.map((v) => [v.x, v.y, v.dark]), lights.map((l) => [l.x, l.y, l.bright, l.dim]), page.light?.global]);
  return { key, viewers: vs, lights, global: !!page.light?.global };
}

/** O ponto está visível e iluminado para algum observador? */
export function isLit(s: LightState, x: number, y: number): boolean {
  for (const v of s.viewers) {
    if (!pointInPolygon(x, y, v.poly)) continue;
    if (s.global) return true;
    if (v.dark && Math.hypot(x - v.x, y - v.y) <= v.dark) return true;
    for (const l of s.lights) if (Math.hypot(x - l.x, y - l.y) <= l.bright + l.dim && pointInPolygon(x, y, l.poly)) return true;
  }
  return false;
}

function clipPoly(ctx: CanvasRenderingContext2D, p: number[]) {
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 2) {
    if (i) ctx.lineTo(p[i], p[i + 1]);
    else ctx.moveTo(p[i], p[i + 1]);
  }
  ctx.closePath();
  ctx.clip();
}

/** Pinta as áreas iluminadas visíveis (em coordenadas do mundo) com opacidade total. */
function paintLit(ctx: CanvasRenderingContext2D, s: LightState, page: Page) {
  const pw = page.cols * page.gridSize;
  const ph = page.rows * page.gridSize;
  for (const v of s.viewers) {
    ctx.save();
    clipPoly(ctx, v.poly);
    if (s.global) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, pw, ph);
    } else {
      for (const l of s.lights) {
        const r = l.bright + l.dim;
        ctx.save();
        clipPoly(ctx, l.poly);
        const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
        const b = r > 0 ? l.bright / r : 1;
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(Math.min(0.999, b), "rgba(0,0,0,1)");
        g.addColorStop(Math.min(1, b + 0.03), "rgba(0,0,0,0.62)");
        g.addColorStop(0.94, "rgba(0,0,0,0.55)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
        ctx.restore();
      }
      if (v.dark) {
        const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.dark);
        g.addColorStop(0, "rgba(0,0,0,0.78)");
        g.addColorStop(0.85, "rgba(0,0,0,0.7)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(v.x - v.dark, v.y - v.dark, v.dark * 2, v.dark * 2);
      }
    }
    ctx.restore();
  }
}

// ─── Memória do explorado (por página, neste navegador) ─────────────────────

const EXP_PX = 8; // px por célula
const explored = new Map<string, { canvas: HTMLCanvasElement; dirty: boolean; key: string; saved: number }>();

export function exploredCanvas(storeKey: string, page: Page): HTMLCanvasElement {
  let e = explored.get(storeKey);
  if (!e || e.canvas.width !== page.cols * EXP_PX || e.canvas.height !== page.rows * EXP_PX) {
    const canvas = document.createElement("canvas");
    canvas.width = page.cols * EXP_PX;
    canvas.height = page.rows * EXP_PX;
    e = { canvas, dirty: false, key: "", saved: 0 };
    explored.set(storeKey, e);
    try {
      const url = localStorage.getItem(storeKey);
      if (url) {
        const img = new Image();
        img.onload = () => canvas.getContext("2d")!.drawImage(img, 0, 0);
        img.src = url;
      }
    } catch {
      /* sem armazenamento */
    }
  }
  return e.canvas;
}

/** Acrescenta à memória o que está visível agora (só quando a cena de luz muda). */
export function rememberLit(storeKey: string, page: Page, s: LightState) {
  const e = explored.get(storeKey);
  if (!e || e.key === s.key) return;
  e.key = s.key;
  const ctx = e.canvas.getContext("2d")!;
  ctx.save();
  ctx.scale(EXP_PX / page.gridSize, EXP_PX / page.gridSize);
  paintLit(ctx, s, page);
  ctx.restore();
  const now = performance.now();
  if (now - e.saved > 2000) {
    e.saved = now;
    try {
      localStorage.setItem(storeKey, e.canvas.toDataURL("image/png"));
    } catch {
      /* cota cheia */
    }
  }
}

/**
 * Máscara de escuridão em pixels de tela: preto onde não se vê; áreas exploradas ficam
 * na penumbra. alpha < 1 = prévia do mestre (ainda enxerga um pouco).
 */
export function drawDarkness(
  mask: HTMLCanvasElement, w: number, h: number, dpr: number, view: View, page: Page, s: LightState,
  exploredMap: HTMLCanvasElement | null, alpha: number,
) {
  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  if (mask.width !== W || mask.height !== H) {
    mask.width = W;
    mask.height = H;
  }
  const m = mask.getContext("2d")!;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.globalCompositeOperation = "source-over";
  m.clearRect(0, 0, W, H);
  m.fillStyle = `rgba(4,4,6,${alpha})`;
  m.fillRect(0, 0, W, H);
  m.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y);
  m.globalCompositeOperation = "destination-out";
  if (exploredMap) {
    m.globalAlpha = 0.42;
    m.imageSmoothingEnabled = true;
    m.drawImage(exploredMap, 0, 0, page.cols * page.gridSize, page.rows * page.gridSize);
    m.globalAlpha = 1;
  }
  paintLit(m, s, page);
  m.globalCompositeOperation = "source-over";
}

/** Brilho colorido das luzes (por baixo da máscara). */
export function drawGlow(ctx: CanvasRenderingContext2D, s: LightState) {
  for (const l of s.lights) {
    if (!l.color || l.color === "#ffffff") continue;
    const r = l.bright + l.dim;
    ctx.save();
    clipPoly(ctx, l.poly);
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, hexA(l.color, 0.22));
    g.addColorStop(1, hexA(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    ctx.restore();
  }
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
