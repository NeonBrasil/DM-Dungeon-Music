// Desenho da masmorra no estilo One Page Dungeon: hachuras, piso branco, paredes grossas,
// portas, objetos e água. Números e portas secretas são opcionais (camada do mestre na mesa).
import type { Area, Door, Dungeon, Prop } from "./dungeon.ts";
import { chaikin, pointInPoly, type Pt } from "./geom.ts";
import { drawGrid, drawHatching, STYLES, type InkStyle, type StyleName } from "./ink.ts";
import { Rng } from "./rng.ts";

export interface DungeonDrawOpts {
  cell: number;
  style: StyleName;
  numbers: boolean;
  secrets: boolean;
  seed: string;
}

export function renderDungeon(d: Dungeon, o: DungeonDrawOpts): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = d.cols * o.cell;
  cv.height = d.rows * o.cell;
  drawDungeon(cv.getContext("2d")!, d, o);
  return cv;
}

export function drawDungeon(ctx: CanvasRenderingContext2D, d: Dungeon, o: DungeonDrawOpts) {
  const S = STYLES[o.style];
  const c = o.cell;
  const { cols, rows } = d;
  ctx.fillStyle = S.bg;
  ctx.fillRect(0, 0, cols * c, rows * c);

  const floor = new Uint8Array(cols * rows);
  for (let i = 0; i < floor.length; i++) floor[i] = d.cellArea[i] >= 0 ? 1 : 0;
  drawHatching(ctx, floor, cols, rows, c, o.seed, S.hatch);

  const floorPath = new Path2D();
  for (const a of d.areas) {
    if (a.round) {
      const r = (a.w / 2) * c;
      const cx = (a.x + a.w / 2) * c;
      const cy = (a.y + a.h / 2) * c;
      floorPath.moveTo(cx + r, cy);
      floorPath.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (a.kind === "room") {
      floorPath.rect(a.x * c, a.y * c, a.w * c, a.h * c);
    } else {
      for (const [x, y] of a.cells) floorPath.rect(x * c, y * c, c, c);
    }
  }
  ctx.fillStyle = S.floor;
  ctx.fill(floorPath);

  ctx.save();
  ctx.clip(floorPath);
  for (const a of d.areas) for (const w of a.water) drawWater(ctx, w, c, S, `${o.seed}:${a.id}`);
  drawGrid(ctx, cols, rows, c, S.grid);
  ctx.restore();

  for (const a of d.areas) for (const p of a.props) drawProp(ctx, p, c, S);

  drawWalls(ctx, d, c, S);
  for (const door of d.doors) drawDoor(ctx, door, c, S, o.secrets);

  if (o.numbers) {
    for (const a of d.areas) {
      if (a.kind !== "room") continue;
      const [x, y] = numberSpot(a);
      ctx.save();
      ctx.font = `700 ${c * 0.55}px Georgia, "Palatino Linotype", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = c * 0.12;
      ctx.strokeStyle = S.floor;
      ctx.strokeText(String(a.num), x * c, y * c);
      ctx.fillStyle = S.text;
      ctx.fillText(String(a.num), x * c, y * c);
      ctx.restore();
    }
  }
}

/** Onde escrever o número da sala (centro, ou canto se houver objeto no meio). */
export function numberSpot(a: Area): [number, number] {
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const busy = a.props.some((p) => Math.abs(p.x - cx) < p.w / 2 + 0.4 && Math.abs(p.y - cy) < p.h / 2 + 0.4);
  if (!busy || a.round) return [cx, a.round && busy ? a.y + 0.75 : cy];
  return [a.x + 0.6, a.y + 0.6];
}

export const doorKey = (dr: Door) => `${dr.horiz ? "h" : "v"}:${dr.x}:${dr.y}`;

/** Paredes retas (em células), juntando trechos colineares; arestas em `gaps` ficam abertas. */
export function wallSegments(d: Dungeon, gaps: Set<string>): number[] {
  const { cols, rows } = d;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? -1 : d.cellArea[y * cols + x]);
  const isRound = (id: number) => id >= 0 && d.areas[id].round;
  const needs = (a: number, b: number) => a !== b && ((a >= 0 && !isRound(a)) || (b >= 0 && !isRound(b)));
  const hRuns = new Map<number, number[]>();
  const vRuns = new Map<number, number[]>();
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= cols; x++) {
      const a = at(x, y);
      if (needs(a, at(x, y - 1)) && !gaps.has(`h:${x}:${y}`)) (hRuns.get(y) ?? hRuns.set(y, []).get(y)!).push(x);
      if (needs(a, at(x - 1, y)) && !gaps.has(`v:${x}:${y}`)) (vRuns.get(x) ?? vRuns.set(x, []).get(x)!).push(y);
    }
  }
  const out: number[] = [];
  for (const [y, xs] of hRuns) {
    xs.sort((p, q) => p - q);
    let st = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === xs[i - 1] + 1) continue;
      out.push(st, y, xs[i - 1] + 1, y);
      st = xs[i];
    }
  }
  for (const [x, ys] of vRuns) {
    ys.sort((p, q) => p - q);
    let st = ys[0];
    for (let i = 1; i <= ys.length; i++) {
      if (i < ys.length && ys[i] === ys[i - 1] + 1) continue;
      out.push(x, st, x, ys[i - 1] + 1);
      st = ys[i];
    }
  }
  return out;
}

/** Arcos das salas redondas (em células), com aberturas nas portas que `opens` aceitar. */
function roundArcs(d: Dungeon, opens: (dr: Door) => boolean): { cx: number; cy: number; r: number; arcs: [number, number][] }[] {
  const out: { cx: number; cy: number; r: number; arcs: [number, number][] }[] = [];
  for (const a of d.areas) {
    if (!a.round) continue;
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const r = a.w / 2;
    const half = 0.5 / r;
    const gaps = d.doors
      .filter((dr) => (dr.a === a.id || dr.b === a.id) && opens(dr))
      .map((dr) => Math.atan2((dr.horiz ? dr.y : dr.y + 0.5) - cy, (dr.horiz ? dr.x + 0.5 : dr.x) - cx))
      .sort((p, q) => p - q);
    const arcs: [number, number][] = gaps.length
      ? gaps.map((g, i) => [g + half, (i + 1 < gaps.length ? gaps[i + 1] : gaps[0] + Math.PI * 2) - half] as [number, number])
      : [[0, Math.PI * 2]];
    out.push({ cx, cy, r, arcs });
  }
  return out;
}

/** Arcos das salas redondas aproximados por segmentos (para a iluminação). */
export function roundWallSegments(d: Dungeon, opens: (dr: Door) => boolean): number[] {
  const out: number[] = [];
  for (const { cx, cy, r, arcs } of roundArcs(d, opens)) {
    for (const [from, to] of arcs) {
      const n = Math.max(2, Math.ceil((to - from) / 0.2));
      for (let i = 0; i < n; i++) {
        const a0 = from + ((to - from) * i) / n;
        const a1 = from + ((to - from) * (i + 1)) / n;
        out.push(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      }
    }
  }
  return out;
}

function drawWalls(ctx: CanvasRenderingContext2D, d: Dungeon, c: number, S: InkStyle) {
  const visible = (dr: Door) => dr.type !== "secret";
  const segs = wallSegments(d, new Set(d.doors.filter(visible).map(doorKey)));
  ctx.save();
  ctx.strokeStyle = S.wall;
  ctx.lineWidth = c * 0.16;
  ctx.lineCap = "square";
  ctx.beginPath();
  for (let i = 0; i < segs.length; i += 4) {
    ctx.moveTo(segs[i] * c, segs[i + 1] * c);
    ctx.lineTo(segs[i + 2] * c, segs[i + 3] * c);
  }
  ctx.stroke();
  // salas redondas: arco com aberturas nas portas
  ctx.lineCap = "butt";
  for (const { cx, cy, r, arcs } of roundArcs(d, visible)) {
    ctx.beginPath();
    for (const [from, to] of arcs) {
      ctx.moveTo((cx + Math.cos(from) * r) * c, (cy + Math.sin(from) * r) * c);
      ctx.arc(cx * c, cy * c, r * c, from, to);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawDoor(ctx: CanvasRenderingContext2D, door: Door, c: number, S: InkStyle, showSecret: boolean) {
  const mx = door.horiz ? (door.x + 0.5) * c : door.x * c;
  const my = door.horiz ? door.y * c : (door.y + 0.5) * c;
  const T = c * 0.16;
  ctx.save();
  ctx.translate(mx, my);
  if (!door.horiz) ctx.rotate(Math.PI / 2);
  if (door.type === "secret") {
    if (showSecret) {
      ctx.rotate(door.horiz ? 0 : -Math.PI / 2);
      ctx.font = `700 ${c * 0.42}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = S.accent;
      ctx.fillText("S", 0, 0);
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = S.wall;
  const stub = (len: number) => {
    ctx.fillRect(-c / 2 - T / 2, -T / 2, len * c + T / 2, T);
    ctx.fillRect(c / 2 - len * c, -T / 2, len * c + T / 2, T);
  };
  ctx.lineWidth = Math.max(1, c * 0.05);
  ctx.strokeStyle = S.wall;
  switch (door.type) {
    case "open":
      stub(0.16);
      break;
    case "portcullis":
      stub(0.16);
      for (let k = -1.5; k <= 1.5; k++) {
        ctx.beginPath();
        ctx.arc(k * c * 0.16, 0, c * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    default:
      stub(0.2);
      ctx.fillStyle = S.floor;
      ctx.beginPath();
      ctx.rect(-c * 0.3, -c * 0.12, c * 0.6, c * 0.24);
      ctx.fill();
      ctx.stroke();
      if (door.type === "locked") {
        ctx.beginPath();
        ctx.moveTo(0, -c * 0.12);
        ctx.lineTo(0, c * 0.12);
        ctx.stroke();
        ctx.fillStyle = S.wall;
        ctx.beginPath();
        ctx.arc(0, 0, c * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.restore();
}

function drawWater(ctx: CanvasRenderingContext2D, poly: [number, number][], c: number, S: InkStyle, seed: string) {
  const rng = new Rng(seed);
  const pts: Pt[] = poly.length > 4 ? chaikin(poly, 2) : poly;
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * c, y * c) : ctx.moveTo(x * c, y * c)));
  ctx.closePath();
  ctx.fillStyle = S.water;
  ctx.fill();
  ctx.strokeStyle = S.waterLine;
  ctx.lineWidth = Math.max(1, c * 0.04);
  ctx.stroke();
  // ondinhas
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const n = Math.ceil((x1 - x0) * (y1 - y0) * 1.5);
  ctx.lineWidth = Math.max(1, c * 0.03);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const px = rng.float(x0, x1);
    const py = rng.float(y0, y1);
    if (!pointInPoly([px, py], pts) || !pointInPoly([px + 0.3, py], pts)) continue;
    ctx.moveTo(px * c, py * c);
    ctx.quadraticCurveTo((px + 0.08) * c, (py - 0.06) * c, (px + 0.15) * c, py * c);
    ctx.quadraticCurveTo((px + 0.22) * c, (py + 0.06) * c, (px + 0.3) * c, py * c);
  }
  ctx.stroke();
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function drawProp(ctx: CanvasRenderingContext2D, p: Prop, c: number, S: InkStyle) {
  const x = p.x * c;
  const y = p.y * c;
  const w = p.w * c;
  const h = p.h * c;
  const rng = new Rng(Math.floor(p.x * 1000) * 7919 + Math.floor(p.y * 1000));
  ctx.save();
  ctx.lineWidth = Math.max(1, c * 0.045);
  ctx.strokeStyle = S.prop;
  ctx.fillStyle = S.floor;
  const box = (bw: number, bh: number, r = 0) => {
    ctx.beginPath();
    if (r) ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, r);
    else ctx.rect(x - bw / 2, y - bh / 2, bw, bh);
  };
  switch (p.kind) {
    case "column":
      circle(ctx, x, y, (Math.min(w, h) / 2) * 0.9);
      ctx.fill();
      ctx.stroke();
      break;
    case "statue":
      circle(ctx, x, y, c * 0.34);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = S.prop;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? c * 0.09 : c * 0.22;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "altar":
      box(w, h);
      ctx.fill();
      ctx.stroke();
      box(w * 0.7, h * 0.55);
      ctx.stroke();
      break;
    case "fountain":
      circle(ctx, x, y, w / 2);
      ctx.fill();
      ctx.stroke();
      circle(ctx, x, y, w * 0.36);
      ctx.fillStyle = S.water;
      ctx.fill();
      ctx.stroke();
      circle(ctx, x, y, w * 0.1);
      ctx.fillStyle = S.floor;
      ctx.fill();
      ctx.stroke();
      break;
    case "well":
      circle(ctx, x, y, c * 0.38);
      ctx.fill();
      ctx.stroke();
      circle(ctx, x, y, c * 0.24);
      ctx.fillStyle = S.wall;
      ctx.fill();
      break;
    case "sarcophagus":
      box(w, h, c * 0.12);
      ctx.fill();
      ctx.stroke();
      box(w - c * 0.22, h - c * 0.22, c * 0.08);
      ctx.stroke();
      ctx.beginPath();
      if (p.vertical) {
        ctx.moveTo(x - w * 0.18, y - h * 0.18);
        ctx.lineTo(x + w * 0.18, y - h * 0.18);
        ctx.moveTo(x, y - h * 0.3);
        ctx.lineTo(x, y + h * 0.05);
      } else {
        ctx.moveTo(x - w * 0.18, y - h * 0.18);
        ctx.lineTo(x - w * 0.18, y + h * 0.18);
        ctx.moveTo(x - w * 0.3, y);
        ctx.lineTo(x + w * 0.05, y);
      }
      ctx.stroke();
      break;
    case "chest":
      box(w, h, c * 0.04);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y - h * 0.1);
      ctx.lineTo(x + w / 2, y - h * 0.1);
      ctx.stroke();
      break;
    case "barrel":
      circle(ctx, x, y, w / 2);
      ctx.fill();
      ctx.stroke();
      circle(ctx, x, y, w * 0.26);
      ctx.stroke();
      break;
    case "crate":
      box(w, h);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y - h / 2);
      ctx.lineTo(x + w / 2, y + h / 2);
      ctx.moveTo(x + w / 2, y - h / 2);
      ctx.lineTo(x - w / 2, y + h / 2);
      ctx.stroke();
      break;
    case "table": {
      box(w, h, c * 0.08);
      ctx.fill();
      ctx.stroke();
      // bancos dos dois lados
      const long = Math.max(w, h);
      const n = Math.max(1, Math.floor(long / c));
      for (let i = 0; i < n; i++) {
        const t = -long / 2 + (i + 0.5) * (long / n);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          if (p.vertical) ctx.rect(x + s * (w / 2 + c * 0.2) - c * 0.1, y + t - c * 0.15, c * 0.2, c * 0.3);
          else ctx.rect(x + t - c * 0.15, y + s * (h / 2 + c * 0.2) - c * 0.1, c * 0.3, c * 0.2);
          ctx.fill();
          ctx.stroke();
        }
      }
      break;
    }
    case "bed":
      box(w, h, c * 0.05);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(x - w * 0.35, y - h / 2 + c * 0.08, w * 0.7, h * 0.18);
      ctx.stroke();
      break;
    case "throne":
      box(w, h, c * 0.06);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = S.prop;
      ctx.beginPath();
      if (h >= w) ctx.rect(x - w / 2, y - h / 2, w * 0.28, h);
      else ctx.rect(x - w / 2, y - h / 2, w, h * 0.28);
      ctx.fill();
      break;
    case "rubble":
      ctx.fillStyle = S.prop;
      for (let i = 0; i < 6; i++) {
        const rx = x + rng.float(-0.32, 0.32) * c;
        const ry = y + rng.float(-0.32, 0.32) * c;
        const rr = rng.float(0.04, 0.1) * c;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + rng.float(0, 0.6);
          ctx.lineTo(rx + Math.cos(a) * rr * rng.float(0.7, 1.2), ry + Math.sin(a) * rr * rng.float(0.7, 1.2));
        }
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "bones":
      ctx.lineWidth = Math.max(1, c * 0.04);
      for (let i = 0; i < 3; i++) {
        const a = rng.float(0, Math.PI);
        const l = c * rng.float(0.18, 0.3);
        const bx = x + rng.float(-0.25, 0.25) * c;
        const by = y + rng.float(-0.25, 0.25) * c;
        ctx.beginPath();
        ctx.moveTo(bx - Math.cos(a) * l, by - Math.sin(a) * l);
        ctx.lineTo(bx + Math.cos(a) * l, by + Math.sin(a) * l);
        ctx.stroke();
        for (const s of [-1, 1]) {
          circle(ctx, bx + s * Math.cos(a) * l, by + s * Math.sin(a) * l, c * 0.035);
          ctx.fill();
          ctx.stroke();
        }
      }
      break;
    case "stairsUp":
    case "stairsDown": {
      box(w, h);
      ctx.fill();
      ctx.stroke();
      const steps = 5;
      ctx.beginPath();
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const shrink = p.kind === "stairsDown" ? t * 0.35 : 0;
        if (p.vertical) {
          ctx.moveTo(x - w / 2 + t * w, y - h / 2 + shrink * h);
          ctx.lineTo(x - w / 2 + t * w, y + h / 2 - shrink * h);
        } else {
          ctx.moveTo(x - w / 2 + shrink * w, y - h / 2 + t * h);
          ctx.lineTo(x + w / 2 - shrink * w, y - h / 2 + t * h);
        }
      }
      ctx.stroke();
      break;
    }
    case "pit":
      circle(ctx, x, y, w / 2);
      ctx.fillStyle = S.wall;
      ctx.fill();
      ctx.stroke();
      break;
    case "brazier":
      circle(ctx, x, y, c * 0.17);
      ctx.fillStyle = S.prop;
      ctx.fill();
      circle(ctx, x, y, c * 0.07);
      ctx.fillStyle = S.accent;
      ctx.fill();
      break;
    case "shelf": {
      box(w, h);
      ctx.fill();
      ctx.stroke();
      const long = Math.max(w, h);
      ctx.beginPath();
      for (let t = c * 0.5; t < long; t += c * 0.5) {
        if (h > w) {
          ctx.moveTo(x - w / 2, y - h / 2 + t);
          ctx.lineTo(x + w / 2, y - h / 2 + t);
        } else {
          ctx.moveTo(x - w / 2 + t, y - h / 2);
          ctx.lineTo(x - w / 2 + t, y + h / 2);
        }
      }
      ctx.stroke();
      break;
    }
    case "cage":
      box(w, h);
      ctx.stroke();
      ctx.beginPath();
      for (let k = 1; k < 4; k++) {
        ctx.moveTo(x - w / 2 + (k * w) / 4, y - h / 2);
        ctx.lineTo(x - w / 2 + (k * w) / 4, y + h / 2);
      }
      ctx.stroke();
      break;
    case "circle": {
      const r = w / 2;
      ctx.lineWidth = Math.max(1, c * 0.035);
      circle(ctx, x, y, r);
      ctx.stroke();
      circle(ctx, x, y, r * 0.82);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = (i * 2 * (Math.PI * 2)) / 5 - Math.PI / 2;
        const px = x + Math.cos(a) * r * 0.82;
        const py = y + Math.sin(a) * r * 0.82;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** Texto do mestre: título, gancho e chave das salas. */
export function dungeonNotes(d: Dungeon): string {
  const lines = [d.title, "", d.hook, ""];
  for (const a of [...d.areas].filter((x) => x.kind === "room").sort((p, q) => p.num - q.num)) {
    lines.push(`${a.num}. ${a.name}. ${a.text}`);
  }
  const secrets = d.doors.filter((x) => x.type === "secret").length;
  if (secrets) lines.push("", `Portas secretas: ${secrets} (marcadas com S na camada do mestre).`);
  return lines.join("\n");
}
