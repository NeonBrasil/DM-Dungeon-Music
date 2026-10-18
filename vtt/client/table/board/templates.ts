// Moldes de área (magias): círculo, cone (padrão D&D: largura = distância), linha e quadrado.
import type { Graphic, Page, TemplateType, Tpl } from "../../../shared/types.ts";
import { pointInPolygon } from "../../../shared/vision.ts";

export interface TplShape { circle?: { x: number; y: number; r: number }; poly?: number[] }

export function tplShape(t: Tpl, ox: number, oy: number, gs: number): TplShape {
  const L = t.size;
  const dx = Math.cos(t.angle);
  const dy = Math.sin(t.angle);
  const px = -dy;
  const py = dx;
  switch (t.type) {
    case "circle":
      return { circle: { x: ox, y: oy, r: L } };
    case "cone":
      return { poly: [ox, oy, ox + L * dx + (L / 2) * px, oy + L * dy + (L / 2) * py, ox + L * dx - (L / 2) * px, oy + L * dy - (L / 2) * py] };
    case "line": {
      const w = gs / 2;
      return { poly: [ox + w * px, oy + w * py, ox + L * dx + w * px, oy + L * dy + w * py, ox + L * dx - w * px, oy + L * dy - w * py, ox - w * px, oy - w * py] };
    }
    case "square": {
      const sx = dx >= 0 ? 1 : -1;
      const sy = dy >= 0 ? 1 : -1;
      return { poly: [ox, oy, ox + sx * L, oy, ox + sx * L, oy + sy * L, ox, oy + sy * L] };
    }
  }
}

export function shapeBounds(s: TplShape) {
  if (s.circle) return { x0: s.circle.x - s.circle.r, y0: s.circle.y - s.circle.r, x1: s.circle.x + s.circle.r, y1: s.circle.y + s.circle.r };
  const p = s.poly!;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
  }
  return { x0, y0, x1, y1 };
}

export function insideShape(s: TplShape, x: number, y: number): boolean {
  if (s.circle) return Math.hypot(x - s.circle.x, y - s.circle.y) <= s.circle.r + 0.01;
  return pointInPolygon(x, y, s.poly!);
}

/** Células cujo centro está dentro do molde. */
export function shapeCells(s: TplShape, page: Page): [number, number][] {
  const gs = page.gridSize;
  const b = shapeBounds(s);
  const out: [number, number][] = [];
  for (let cy = Math.max(0, Math.floor(b.y0 / gs)); cy <= Math.min(page.rows - 1, Math.floor(b.y1 / gs)); cy++) {
    for (let cx = Math.max(0, Math.floor(b.x0 / gs)); cx <= Math.min(page.cols - 1, Math.floor(b.x1 / gs)); cx++) {
      if (insideShape(s, (cx + 0.5) * gs, (cy + 0.5) * gs)) out.push([cx, cy]);
    }
  }
  return out;
}

export function graphicShape(g: Graphic, gs: number): TplShape | null {
  return g.tpl ? tplShape(g.tpl, g.x + g.tpl.ox, g.y + g.tpl.oy, gs) : null;
}

export const TPL_NAMES: Record<TemplateType, string> = { circle: "Círculo", cone: "Cone", line: "Linha", square: "Quadrado" };

export function tplLabel(t: Tpl, page: Page): string {
  const v = Math.round((t.size / page.gridSize) * page.scale * 10) / 10;
  const what = t.type === "circle" ? "raio" : t.type === "square" ? "lado" : TPL_NAMES[t.type].toLowerCase();
  return `${what} ${v} ${page.unit}`;
}

/** Monta o gráfico de molde a partir da origem e do ponto atual do arrasto. */
export function makeTemplate(type: TemplateType, ox: number, oy: number, ex: number, ey: number, gs: number, snap: boolean) {
  let size = Math.hypot(ex - ox, ey - oy);
  if (type === "square") size = Math.max(Math.abs(ex - ox), Math.abs(ey - oy));
  if (snap) size = Math.max(gs, Math.round(size / gs) * gs);
  const angle = Math.atan2(ey - oy, ex - ox);
  const tpl: Tpl = { type, ox: 0, oy: 0, size, angle };
  const b = shapeBounds(tplShape(tpl, ox, oy, gs));
  tpl.ox = ox - b.x0;
  tpl.oy = oy - b.y0;
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, tpl };
}
