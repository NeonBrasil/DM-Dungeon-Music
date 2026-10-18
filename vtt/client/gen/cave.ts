// Gerador de cavernas: autômato celular → maior região + túneis → água por ruído →
// câmaras (para névoa por clique) → contorno suave (marching squares) no traço nanquim.
import type { Rect } from "../../shared/types.ts";
import { blurField, chaikin, marchingSquares, simplifyLine, tracePolys, type Pt } from "./geom.ts";
import { drawGrid, drawHatching, STYLES, type StyleName } from "./ink.ts";
import { drawProp, type DungeonDrawOpts } from "./dungeonDraw.ts";
import type { Prop } from "./dungeon.ts";
import { caveName, Deck } from "./names.ts";
import { Noise } from "./noise.ts";
import { Rng } from "./rng.ts";
import type { Built } from "./types.ts";

export type CaveSize = "small" | "medium" | "large";
export interface CaveOpts { seed: string; size: CaveSize; style: StyleName; water: boolean; open: number; name?: string }

interface Chamber { num: number; cx: number; cy: number; cells: number[]; text: string }

interface Cave {
  cols: number;
  rows: number;
  floor: Uint8Array;
  water: Uint8Array;
  props: Prop[];
  chambers: Chamber[];
  title: string;
  hook: string;
}

const CAVE_MONSTERS = [
  "um bando de morcegos gigantes", "aranhas gigantes tecendo teias no teto", "um urso-coruja faminto", "kobolds montando armadilhas",
  "um basilisco cochilando", "uma gosma ocre escorrendo pela parede", "trogloditas com lanças de osso", "um verme da carniça",
  "goblins discutindo sobre um saque", "um troll ferido", "estirges penduradas como frutas", "um enxame de besouros de fogo",
];
const CAVE_FEATURES = [
  "Cogumelos fosforescentes iluminam tudo de azul.", "Estalactites pingam sem parar; o chão é escorregadio.", "Um eco estranho repete cada palavra três vezes.",
  "Ossos de animais grandes se espalham pelo chão.", "Uma corrente de ar frio vem de uma fenda estreita.", "Cristais na parede refletem a luz das tochas.",
  "Restos de um acampamento abandonado, com uma mochila rasgada.", "Pinturas rupestres mostram uma criatura com muitos olhos.",
  "O teto é tão baixo que criaturas grandes andam agachadas.", "Uma poça de água limpa e gelada.",
];
const CAVE_TREASURE = [
  "uma bolsa de couro com {n} peças de ouro", "um machado anão de boa qualidade", "um geodo cheio de ametistas ({n} po)",
  "um esqueleto de aventureiro com uma poção intacta", "uma lanterna mágica que nunca apaga", "um mapa das galerias inferiores",
];

export function generateCave(o: CaveOpts): Cave {
  const rng = new Rng(`${o.seed}:cave:${o.size}`);
  const [cols, rows] = { small: [36, 28], medium: [52, 40], large: [70, 52] }[o.size];
  const N = cols * rows;
  const B = 2; // borda maciça
  let wall = new Uint8Array(N);
  const fill = 0.47 - (o.open - 3) * 0.02;
  // mais rocha perto das bordas (contorno orgânico em vez de retângulo)
  const shape = new Noise(rng.fork("shape"));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const edge = x < B || y < B || x >= cols - B || y >= rows - B;
      const dx = (x / cols - 0.5) * 2;
      const dy = (y / rows - 0.5) * 2;
      const d = Math.hypot(dx, dy) + shape.fbm(x * 0.07, y * 0.07, 3) * 0.35;
      const p = fill + Math.max(0, d - 0.72) * 1.1;
      wall[y * cols + x] = edge || rng.chance(p) ? 1 : 0;
    }
  }
  const count = (w: Uint8Array, x: number, y: number, r: number) => {
    let n = 0;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const nx = x + i;
        const ny = y + j;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || w[ny * cols + nx]) n++;
      }
    }
    return n;
  };
  for (let it = 0; it < 7; it++) {
    const next = new Uint8Array(N);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const edge = x < B || y < B || x >= cols - B || y >= rows - B;
        const n1 = count(wall, x, y, 1);
        next[y * cols + x] = edge || n1 >= 5 || (it < 4 && count(wall, x, y, 2) <= 2) ? 1 : 0;
      }
    }
    wall = next;
  }

  // Regiões (4-conexas)
  const label = new Int32Array(N).fill(-1);
  const regions: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (wall[i] || label[i] >= 0) continue;
    const id = regions.length;
    const cells = [i];
    label[i] = id;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const x = c % cols;
      const y = (c / cols) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = ny * cols + nx;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !wall[j] && label[j] < 0) {
          label[j] = id;
          cells.push(j);
        }
      }
    }
    regions.push(cells);
  }
  regions.sort((a, b) => b.length - a.length);
  const main = new Set(regions[0] ?? []);
  const carve = (x: number, y: number, r: number) => {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const nx = x + i;
        const ny = y + j;
        if (nx >= B && ny >= B && nx < cols - B && ny < rows - B) {
          wall[ny * cols + nx] = 0;
          main.add(ny * cols + nx);
        }
      }
    }
  };
  /** Túnel com zigue-zague do ponto a até b. */
  const tunnel = (a: number, b: number) => {
    let x = a % cols;
    let y = (a / cols) | 0;
    const tx = b % cols;
    const ty = (b / cols) | 0;
    const r = rng.chance(0.4) ? 1 : 0;
    let guard = 0;
    while ((x !== tx || y !== ty) && guard++ < 500) {
      if (rng.chance(0.5) && x !== tx) x += Math.sign(tx - x);
      else if (y !== ty) y += Math.sign(ty - y);
      else x += Math.sign(tx - x);
      carve(x, y, r);
    }
  };
  for (const reg of regions.slice(1)) {
    if (reg.length < 14) {
      for (const c of reg) wall[c] = 1;
      continue;
    }
    // par de células mais próximo (amostrado)
    let best = Infinity;
    let pair: [number, number] = [reg[0], regions[0][0]];
    const mainArr = [...main];
    for (let s = 0; s < 60; s++) {
      const a = rng.pick(reg);
      for (let t = 0; t < 60; t++) {
        const b = rng.pick(mainArr);
        const d = Math.abs((a % cols) - (b % cols)) + Math.abs(((a / cols) | 0) - ((b / cols) | 0));
        if (d < best) {
          best = d;
          pair = [a, b];
        }
      }
    }
    tunnel(pair[0], pair[1]);
    for (const c of reg) main.add(c);
  }

  // Entrada: túnel do ponto mais baixo até a borda inferior
  const mainArr = [...main];
  const low = mainArr.reduce((m, c) => (((c / cols) | 0) > ((m / cols) | 0) ? c : m), mainArr[0]);
  const ex = low % cols;
  for (let y = (low / cols) | 0; y < rows; y++) {
    wall[y * cols + ex] = 0;
    if (y < rows - 1) wall[y * cols + ex + 1] = 0;
  }

  const floor = new Uint8Array(N);
  for (let i = 0; i < N; i++) floor[i] = wall[i] ? 0 : 1;

  // Água: ruído suavizado só no piso
  const water = new Uint8Array(N);
  if (o.water) {
    const noise = new Noise(rng.fork("water"));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (floor[i] && noise.fbm(x * 0.08, y * 0.08, 3) > 0.36) water[i] = 1;
      }
    }
  }

  // Câmaras: máximos da distância até a parede → partição por BFS multi-fonte
  const dist = new Float32Array(N).fill(0);
  {
    const q: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!floor[i]) q.push(i);
      dist[i] = floor[i] ? Infinity : 0;
    }
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % cols;
      const y = (c / cols) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (dist[j] > dist[c] + 1) {
          dist[j] = dist[c] + 1;
          q.push(j);
        }
      }
    }
  }
  const seeds: number[] = [];
  const order = [...main].filter((c) => floor[c]).sort((a, b) => dist[b] - dist[a]);
  const minGap = { small: 6, medium: 8, large: 10 }[o.size];
  for (const c of order) {
    if (dist[c] < 2) break;
    const x = c % cols;
    const y = (c / cols) | 0;
    if (seeds.every((s) => Math.hypot((s % cols) - x, ((s / cols) | 0) - y) >= minGap)) seeds.push(c);
  }
  const owner = new Int32Array(N).fill(-1);
  const q: number[] = [];
  seeds.forEach((s, i) => {
    owner[s] = i;
    q.push(s);
  });
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    const x = c % cols;
    const y = (c / cols) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (floor[j] && owner[j] < 0) {
        owner[j] = owner[c];
        q.push(j);
      }
    }
  }
  const deck = new Deck(rng.fork("deck"));
  const chambers: Chamber[] = seeds.map((s, i) => ({ num: 0, cx: (s % cols) + 0.5, cy: ((s / cols) | 0) + 0.5, cells: [] as number[], text: "" }));
  for (let i = 0; i < N; i++) if (owner[i] >= 0) chambers[owner[i]].cells.push(i);
  // numera da entrada para dentro (por distância até a entrada)
  chambers.sort((a, b) => Math.hypot(a.cx - ex, a.cy - rows) - Math.hypot(b.cx - ex, b.cy - rows));
  chambers.forEach((c, i) => {
    c.num = i + 1;
    const parts = [deck.draw("f", CAVE_FEATURES)];
    const r = rng.next();
    if (i === 0) parts.push("A luz do dia ainda alcança esta câmara.");
    else if (r < 0.4) parts.push(`Aqui: ${deck.draw("m", CAVE_MONSTERS)}.`);
    if (i > 0 && rng.chance(0.3)) parts.push(`Tesouro: ${deck.draw("t", CAVE_TREASURE).replace("{n}", String(rng.int(3, 25) * 10))}.`);
    c.text = parts.join(" ");
  });

  // Objetos
  const props: Prop[] = [];
  const open = (x: number, y: number) => count(wall, x, y, 1) === 0;
  for (let y = B; y < rows - B; y++) {
    for (let x = B; x < cols - B; x++) {
      const i = y * cols + x;
      if (!floor[i] || water[i] || !open(x, y)) continue;
      const r = rng.next();
      if (r < 0.03) props.push({ kind: "statue", x: x + 0.5, y: y + 0.5, w: 1, h: 1 });
      else if (r < 0.05) props.push({ kind: "rubble", x: x + 0.5, y: y + 0.5, w: 1, h: 1 });
      else if (r < 0.06) props.push({ kind: "bones", x: x + 0.5, y: y + 0.5, w: 1, h: 1 });
    }
  }
  // "statue" aqui vira estalagmite no desenho (ver drawCaveProp)
  const rolled = caveName(rng);
  const title = o.name || rolled; // nome vindo do mapa da região
  const hook = rng.pick([
    "Mineiros desapareceram depois de abrir uma passagem para estas cavernas.",
    "Um rugido ecoa da gruta todas as noites de lua nova.",
    "Contrabandistas usam estas galerias para esconder mercadoria.",
    "Uma criança da vila jura ter visto olhos brilhando na entrada.",
  ]);
  return crop({ cols, rows, floor, water, props, chambers, title, hook });
}

/** Recorta a caverna (2 células de margem; embaixo fica a boca da entrada). */
function crop(c: Cave): Cave {
  let x0 = c.cols;
  let x1 = 0;
  let y0 = c.rows;
  for (let i = 0; i < c.floor.length; i++) {
    if (!c.floor[i]) continue;
    const x = i % c.cols;
    const y = (i / c.cols) | 0;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
  }
  x0 = Math.max(0, x0 - 2);
  x1 = Math.min(c.cols - 1, x1 + 2);
  y0 = Math.max(0, y0 - 2);
  const cols = x1 - x0 + 1;
  const rows = c.rows - y0;
  const remap = (src: Uint8Array) => {
    const out = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out[y * cols + x] = src[(y + y0) * c.cols + x + x0];
    return out;
  };
  return {
    ...c, cols, rows,
    floor: remap(c.floor),
    water: remap(c.water),
    props: c.props.map((p) => ({ ...p, x: p.x - x0, y: p.y - y0 })),
    chambers: c.chambers.map((ch) => ({
      ...ch, cx: ch.cx - x0, cy: ch.cy - y0,
      cells: ch.cells.map((i) => ((((i / c.cols) | 0) - y0) * cols) + (i % c.cols) - x0),
    })),
  };
}

function contours(mask: Uint8Array, cols: number, rows: number, up = 4): Pt[][] {
  // amostra em resolução maior, desfoca e contorna
  const W = cols * up + 1;
  const H = rows * up + 1;
  const f = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = Math.min(cols - 1, Math.floor(x / up));
      const cy = Math.min(rows - 1, Math.floor(y / up));
      f[y * W + x] = mask[cy * cols + cx];
    }
  }
  const b = blurField(blurField(f, W, H, 2), W, H, 2);
  return marchingSquares(b, W, H, 0.5).map((line) => chaikin(line.map(([x, y]) => [x / up, y / up] as Pt), 1));
}

export function renderCave(c: Cave, o: DungeonDrawOpts): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  const cell = o.cell;
  cv.width = c.cols * cell;
  cv.height = c.rows * cell;
  const ctx = cv.getContext("2d")!;
  const S = STYLES[o.style];
  ctx.fillStyle = S.bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  drawHatching(ctx, c.floor, c.cols, c.rows, cell, o.seed, S.hatch, 1.25);

  const floorPolys = contours(c.floor, c.cols, c.rows);
  const floorPath = new Path2D();
  // Path2D não aceita tracePolys diretamente; monta à mão
  for (const poly of floorPolys) {
    floorPath.moveTo(poly[0][0] * cell, poly[0][1] * cell);
    for (let i = 1; i < poly.length; i++) floorPath.lineTo(poly[i][0] * cell, poly[i][1] * cell);
    floorPath.closePath();
  }
  ctx.fillStyle = S.floor;
  ctx.fill(floorPath, "evenodd");

  ctx.save();
  ctx.clip(floorPath, "evenodd");
  if (c.water.some((v) => v)) {
    const wp = contours(c.water, c.cols, c.rows);
    ctx.beginPath();
    tracePolys(ctx, wp, cell);
    ctx.fillStyle = S.water;
    ctx.fill("evenodd");
    ctx.strokeStyle = S.waterLine;
    ctx.lineWidth = Math.max(1, cell * 0.04);
    ctx.stroke();
  }
  drawGrid(ctx, c.cols, c.rows, cell, S.grid);
  ctx.restore();

  for (const p of c.props) {
    if (p.kind === "statue") {
      // estalagmite: pedra irregular
      const rng = new Rng(Math.floor(p.x * 131 + p.y * 977));
      ctx.save();
      ctx.beginPath();
      const r = cell * rng.float(0.18, 0.32);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = r * rng.float(0.75, 1.15);
        ctx.lineTo(p.x * cell + Math.cos(a) * rr, p.y * cell + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = S.floor;
      ctx.fill();
      ctx.strokeStyle = S.wall;
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.stroke();
      ctx.restore();
    } else drawProp(ctx, p, cell, S);
  }

  ctx.save();
  ctx.strokeStyle = S.wall;
  ctx.lineWidth = cell * 0.15;
  ctx.lineJoin = "round";
  ctx.stroke(floorPath);
  ctx.restore();

  if (o.numbers) {
    ctx.save();
    ctx.font = `700 ${cell * 0.6}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const ch of c.chambers) {
      ctx.lineWidth = cell * 0.12;
      ctx.strokeStyle = S.floor;
      ctx.strokeText(String(ch.num), ch.cx * cell, ch.cy * cell);
      ctx.fillStyle = S.text;
      ctx.fillText(String(ch.num), ch.cx * cell, ch.cy * cell);
    }
    ctx.restore();
  }
  return cv;
}

/** Linhas contínuas de cada câmara viram retângulos (para a névoa por clique). */
function chamberRects(cells: number[], cols: number): Rect[] {
  const byRow = new Map<number, number[]>();
  for (const c of cells) {
    const y = (c / cols) | 0;
    (byRow.get(y) ?? byRow.set(y, []).get(y)!).push(c % cols);
  }
  const out: Rect[] = [];
  for (const [y, xs] of byRow) {
    xs.sort((a, b) => a - b);
    let s = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === xs[i - 1] + 1) continue;
      out.push({ x: s, y, w: xs[i - 1] - s + 1, h: 1 });
      s = xs[i];
    }
  }
  return out;
}

export function buildCave(o: CaveOpts): Built {
  const c = generateCave(o);
  const notes = [c.title, "", c.hook, "", ...c.chambers.map((ch) => `${ch.num}. Câmara. ${ch.text}`)].join("\n");
  // paredes para a iluminação: contorno do piso simplificado
  const walls: number[] = [];
  for (const loop of contours(c.floor, c.cols, c.rows)) {
    const closed = Math.hypot(loop[0][0] - loop[loop.length - 1][0], loop[0][1] - loop[loop.length - 1][1]) < 0.5;
    const pts = simplifyLine(loop, 0.08, closed);
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      walls.push(a[0], a[1], b[0], b[1]);
    }
  }
  return {
    walls,
    title: c.title,
    notes,
    cols: c.cols,
    rows: c.rows,
    grid: false,
    bg: STYLES[o.style].bg,
    scale: { value: 1.5, unit: "m" },
    render: (cell, gm) => renderCave(c, { cell, style: o.style, numbers: gm, secrets: gm, seed: o.seed }),
    rooms: c.chambers.map((ch) => chamberRects(ch.cells, c.cols)),
    gmLabels: c.chambers.map((ch) => ({ x: ch.cx, y: ch.cy, text: String(ch.num), color: "#ffd24a" })),
  };
}
