// Traço "nanquim" compartilhado por masmorras e cavernas: paletas e hachuras.
import { Rng } from "./rng.ts";
import { Noise } from "./noise.ts";

export type StyleName = "classic" | "parchment" | "dark";

export interface InkStyle {
  label: string;
  bg: string;
  hatch: string;
  floor: string;
  wall: string;
  grid: string;
  water: string;
  waterLine: string;
  prop: string;
  text: string;
  accent: string;
}

export const STYLES: Record<StyleName, InkStyle> = {
  classic: {
    label: "Clássico", bg: "#f7f5ef", hatch: "#2b2b2b", floor: "#ffffff", wall: "#1b1b1b", grid: "rgba(0,0,0,0.14)",
    water: "#c9dbe4", waterLine: "#7a9db2", prop: "#1b1b1b", text: "#1b1b1b", accent: "#b03a2e",
  },
  parchment: {
    label: "Pergaminho", bg: "#e6d6b1", hatch: "#4b3a26", floor: "#f8f0dd", wall: "#2c2116", grid: "rgba(70,45,20,0.17)",
    water: "#b7c9c0", waterLine: "#6c8a82", prop: "#2c2116", text: "#2c2116", accent: "#8f2a1c",
  },
  dark: {
    label: "Pedra escura", bg: "#232120", hatch: "#57524b", floor: "#beb5a5", wall: "#121110", grid: "rgba(0,0,0,0.24)",
    water: "#5b7886", waterLine: "#304955", prop: "#2b2723", text: "#f0e6d0", accent: "#d4a73a",
  },
};

/**
 * Hachuras em volta das áreas de piso (estilo Watabou): grupos de traços paralelos
 * numa faixa irregular fora das paredes. `floor` tem 1 por célula de piso.
 */
export function drawHatching(
  ctx: CanvasRenderingContext2D, floor: Uint8Array, cols: number, rows: number, cell: number, seed: string, color: string, band = 1.05,
) {
  const rng = new Rng(`${seed}:hatch`);
  const noise = new Noise(rng.fork("n"));
  // distância (Chebyshev, em células) até o piso, limitada a 3
  const D = new Uint8Array(cols * rows).fill(9);
  const queue: number[] = [];
  for (let i = 0; i < floor.length; i++) if (floor[i]) { D[i] = 0; queue.push(i); }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % cols;
    const y = (i / cols) | 0;
    if (D[i] >= 3) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (D[j] > D[i] + 1) {
          D[j] = D[i] + 1;
          queue.push(j);
        }
      }
    }
  }
  const nearDist = (px: number, py: number): number => {
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    let best = 9;
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows || !floor[y * cols + x]) continue;
        const dx = Math.max(x - px, 0, px - (x + 1));
        const dy = Math.max(y - py, 0, py - (y + 1));
        best = Math.min(best, Math.hypot(dx, dy));
      }
    }
    return best;
  };

  const s = 0.3; // espaçamento entre grupos (células)
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, cell * 0.028);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let gy = 0; gy < rows / s; gy++) {
    for (let gx = 0; gx < cols / s; gx++) {
      const px = (gx + 0.5 + rng.float(-0.35, 0.35)) * s;
      const py = (gy + 0.5 + rng.float(-0.35, 0.35)) * s;
      const ci = Math.floor(py) * cols + Math.floor(px);
      if (ci < 0 || ci >= D.length || D[ci] === 0 || D[ci] > 2) continue;
      const d = nearDist(px, py);
      const limit = band + 0.45 * noise.get(px * 0.6, py * 0.6);
      if (d > limit || d < 0.02) continue;
      const ang = rng.float(0, Math.PI);
      const len = s * rng.float(1.2, 1.9);
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const strokes = rng.int(2, 4);
      const gap = s * 0.3;
      for (let k = 0; k < strokes; k++) {
        const o = (k - (strokes - 1) / 2) * gap;
        const ox = px - sin * o;
        const oy = py + cos * o;
        const l = len * rng.float(0.7, 1);
        ctx.moveTo((ox - (cos * l) / 2) * cell, (oy - (sin * l) / 2) * cell);
        ctx.lineTo((ox + (cos * l) / 2) * cell, (oy + (sin * l) / 2) * cell);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Grade fina recortada pelo caminho atual de piso (chame depois de definir o clip). */
export function drawGrid(ctx: CanvasRenderingContext2D, cols: number, rows: number, cell: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, cell * 0.02);
  ctx.beginPath();
  for (let x = 0; x <= cols; x++) {
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, rows * cell);
  }
  for (let y = 0; y <= rows; y++) {
    ctx.moveTo(0, y * cell);
    ctx.lineTo(cols * cell, y * cell);
  }
  ctx.stroke();
  ctx.restore();
}

/** Borrão de água orgânico dentro de um retângulo (em células). */
export function waterBlob(rng: Rng, cx: number, cy: number, rx: number, ry: number): [number, number][] {
  const n = 18;
  const pts: [number, number][] = [];
  const phase = rng.float(0, Math.PI * 2);
  const k1 = rng.float(0.08, 0.18);
  const k2 = rng.float(0.05, 0.12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + k1 * Math.sin(a * 3 + phase) + k2 * Math.sin(a * 5 + phase * 2);
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return pts;
}
