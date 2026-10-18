// Visibilidade 2D para a iluminação dinâmica: polígono de visão a partir de um ponto,
// bloqueado por paredes e portas fechadas; e teste de movimento atravessando parede.
import type { Page } from "./types.ts";

export type Seg = [number, number, number, number];

/** Segmentos que bloqueiam. sight=true: portas "grade" (seeThrough) não bloqueiam a visão. */
export function blockingSegments(page: Pick<Page, "walls" | "doors">, sight: boolean): Seg[] {
  const out: Seg[] = [];
  const w = page.walls ?? [];
  for (let i = 0; i + 3 < w.length; i += 4) out.push([w[i], w[i + 1], w[i + 2], w[i + 3]]);
  for (const d of page.doors ?? []) {
    if (d.open || (sight && d.seeThrough)) continue;
    out.push([d.x1, d.y1, d.x2, d.y2]);
  }
  return out;
}

/** Distância do ponto ao segmento. */
export function segDist(px: number, py: number, s: Seg): number {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Parâmetro t do raio (o + d·t) ao cruzar o segmento, ou Infinity. */
function raySeg(ox: number, oy: number, dx: number, dy: number, s: Seg): number {
  const sx = s[2] - s[0];
  const sy = s[3] - s[1];
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-12) return Infinity;
  const qx = s[0] - ox;
  const qy = s[1] - oy;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * dy - qy * dx) / den;
  return t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
}

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

/**
 * Polígono de visibilidade (pontos x,y achatados), lançando raios para as pontas
 * dos segmentos. range > 0 limita a área (descarta paredes distantes).
 */
export function visibilityPolygon(ox: number, oy: number, segs: Seg[], bounds: Bounds, range = 0): number[] {
  let b = bounds;
  let list = segs;
  if (range > 0) {
    b = { x0: Math.max(bounds.x0, ox - range), y0: Math.max(bounds.y0, oy - range), x1: Math.min(bounds.x1, ox + range), y1: Math.min(bounds.y1, oy + range) };
    list = segs.filter((s) => segDist(ox, oy, s) <= range);
  }
  const all: Seg[] = [...list, [b.x0, b.y0, b.x1, b.y0], [b.x1, b.y0, b.x1, b.y1], [b.x1, b.y1, b.x0, b.y1], [b.x0, b.y1, b.x0, b.y0]];
  const seen = new Set<number>();
  const angles: number[] = [];
  for (const s of all) {
    for (let k = 0; k < 4; k += 2) {
      const a = Math.atan2(s[k + 1] - oy, s[k] - ox);
      const key = Math.round(a * 1e6);
      if (seen.has(key)) continue;
      seen.add(key);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  }
  angles.sort((p, q) => p - q);
  const out: number[] = [];
  for (const a of angles) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Infinity;
    for (const s of all) {
      const t = raySeg(ox, oy, dx, dy, s);
      if (t < best) best = t;
    }
    if (best < Infinity) out.push(ox + dx * best, oy + dy * best);
  }
  return out;
}

export function pointInPolygon(px: number, py: number, poly: number[]): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** O trajeto (x1,y1)→(x2,y2) atravessa algum segmento? */
export function crossesWall(x1: number, y1: number, x2: number, y2: number, segs: Seg[]): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const s of segs) {
    const sx = s[2] - s[0];
    const sy = s[3] - s[1];
    const den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-12) continue;
    const qx = s[0] - x1;
    const qy = s[1] - y1;
    const t = (qx * sy - qy * sx) / den;
    const u = (qx * dy - qy * dx) / den;
    if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) return true;
  }
  return false;
}
