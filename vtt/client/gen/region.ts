// Mapa regional (inspirado no Perilous Shores do Watabou): relevo por ruído, litoral com
// ondulações, rios descendo das montanhas, florestas, pântanos, povoados e estradas.
import { blurField, chaikin, marchingSquares, type Pt } from "./geom.ts";
import type { WorldLink } from "../../shared/types.ts";
import { caveName, cityName, Deck, dungeonTitle, forestName, mountainName, regionName, seaName, type Theme } from "./names.ts";
import { Noise } from "./noise.ts";
import { Rng } from "./rng.ts";
import { drawCompass } from "./city.ts";
import type { Built } from "./types.ts";

export type RegionShape = "coast" | "island" | "continent" | "archipelago";
export type RegionStyle = "parchment" | "ink";
export interface RegionOpts { seed: string; shape: RegionShape; size: "small" | "medium" | "large"; hex: boolean; style: RegionStyle }

const UNITS_PER_CELL = 30; // 1 célula da mesa = 30 unidades do mapa
const RES = 5;             // unidades por amostra do relevo

interface Town { x: number; y: number; kind: "capital" | "town" | "village"; name: string; coast: boolean; river: boolean }
/** Lugar de aventura no mapa: abre uma masmorra ou caverna no gerador. */
interface Site { x: number; y: number; icon: "ruin" | "tower" | "cave"; name: string; link: WorldLink }
interface Label { x: number; y: number; text: string; size: number; italic?: boolean; spacing?: boolean; water?: boolean }

interface Region {
  W: number;
  H: number;
  land: Pt[][];
  ripples: Pt[][][];
  rivers: { pts: Pt[]; width: number }[];
  lakes: { x: number; y: number; r: number }[];
  mountains: { x: number; y: number; s: number; j: number }[];
  hills: { x: number; y: number; s: number }[];
  trees: { x: number; y: number; r: number }[];
  marsh: { x: number; y: number }[];
  towns: Town[];
  sites: Site[];
  roads: Pt[][];
  labels: Label[];
  name: string;
  notes: string;
}

export function generateRegion(o: RegionOpts): Region {
  const rng = new Rng(`${o.seed}:region:${o.shape}:${o.size}`);
  const [W, H] = { small: [1500, 1050], medium: [1950, 1380], large: [2400, 1700] }[o.size];
  const gw = Math.ceil(W / RES) + 1;
  const gh = Math.ceil(H / RES) + 1;
  const N = gw * gh;
  const hn = new Noise(rng.fork("h"));
  const mn = new Noise(rng.fork("m"));
  const f = o.shape === "archipelago" ? 1 / 260 : 1 / 430;
  const ang = rng.float(0, Math.PI * 2);
  const height = new Float32Array(N);
  const moist = new Float32Array(N);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = gx * RES;
      const y = gy * RES;
      const nx = (x / W - 0.5) * 2;
      const ny = (y / H - 0.5) * 2;
      const d = Math.hypot(nx, ny);
      let h = hn.fbm(x * f, y * f, 5) * 0.85;
      if (o.shape === "island") h += 0.5 - d * d * 0.9;
      else if (o.shape === "coast") h += 0.12 - (nx * Math.cos(ang) + ny * Math.sin(ang)) * 0.38;
      else if (o.shape === "continent") h += 0.22 - Math.max(0, d - 0.9) * 1.4;
      else h += -0.04 - d * d * 0.35;
      height[gy * gw + gx] = h;
      moist[gy * gw + gx] = mn.fbm(x / 380, y / 380, 3);
    }
  }
  const at = (x: number, y: number) => {
    const gx = Math.max(0, Math.min(gw - 1, Math.round(x / RES)));
    const gy = Math.max(0, Math.min(gh - 1, Math.round(y / RES)));
    return gy * gw + gx;
  };
  const hAt = (x: number, y: number) => height[at(x, y)];
  const mAt = (x: number, y: number) => moist[at(x, y)];

  // ─── Litoral (campo com borda de água para fechar os contornos) ──────────
  const pw = gw + 2;
  const ph = gh + 2;
  const padded = new Float32Array(pw * ph).fill(-1);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) padded[(y + 1) * pw + x + 1] = height[y * gw + x];
  const toUnits = (line: Pt[]) => line.map(([x, y]) => [(x - 1) * RES, (y - 1) * RES] as Pt);
  const land = marchingSquares(padded, pw, ph, 0).filter((l) => l.length > 6).map((l) => chaikin(toUnits(l), 1));

  // distância até a terra (em amostras) para as ondulações do mar
  const dw = new Float32Array(pw * ph).fill(99);
  {
    const q: number[] = [];
    for (let i = 0; i < pw * ph; i++) if (padded[i] > 0) { dw[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % pw;
      const y = (c / pw) | 0;
      if (dw[c] >= 14) continue;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ddx;
        const ny = y + ddy;
        if (nx < 0 || ny < 0 || nx >= pw || ny >= ph) continue;
        const j = ny * pw + nx;
        if (dw[j] > dw[c] + 1) {
          dw[j] = dw[c] + 1;
          q.push(j);
        }
      }
    }
  }
  const dwBlur = blurField(dw, pw, ph, 1);
  const ripples = [2.5, 5, 8.5].map((lv) => marchingSquares(dwBlur, pw, ph, lv).filter((l) => l.length > 8).map((l) => chaikin(toUnits(l), 1)));

  // ─── Rios ────────────────────────────────────────────────────────────────
  const smooth = blurField(height, gw, gh, 3);
  const riverMask = new Uint8Array(N);
  const rivers: Region["rivers"] = [];
  const lakes: Region["lakes"] = [];
  const nSources = { small: 6, medium: 10, large: 14 }[o.size];
  const sources: number[] = [];
  for (let tries = 0; tries < 4000 && sources.length < nSources; tries++) {
    const i = rng.int(0, N - 1);
    const h = smooth[i];
    if (h < 0.42 || h > 0.85) continue;
    const x = i % gw;
    const y = (i / gw) | 0;
    if (sources.some((s) => Math.hypot((s % gw) - x, ((s / gw) | 0) - y) < 40)) continue;
    sources.push(i);
  }
  for (const s of sources) {
    const path = [s];
    let cur = s;
    let climbs = 0;
    let ended: "sea" | "river" | "lake" | "lost" = "lost";
    for (let step = 0; step < 900; step++) {
      const x = cur % gw;
      const y = (cur / gw) | 0;
      let best = -1;
      let bestH = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx;
          if (path.includes(j)) continue;
          const hj = smooth[j] + rng.float(0, 0.002);
          if (hj < bestH) {
            bestH = hj;
            best = j;
          }
        }
      }
      if (best < 0) break;
      if (bestH >= smooth[cur]) {
        if (climbs++ > 40 || bestH > smooth[cur] + 0.02) {
          ended = "lake";
          break;
        }
      }
      path.push(best);
      cur = best;
      if (height[best] <= 0) {
        ended = "sea";
        break;
      }
      if (riverMask[best]) {
        ended = "river";
        break;
      }
    }
    if (path.length < 18) continue;
    for (const i of path) riverMask[i] = 1;
    const pts = chaikin(path.map((i) => [(i % gw) * RES, ((i / gw) | 0) * RES] as Pt), 2, false);
    rivers.push({ pts, width: Math.min(5, 1.6 + path.length / 120) });
    if (ended === "lake") {
      const e = path[path.length - 1];
      lakes.push({ x: (e % gw) * RES, y: ((e / gw) | 0) * RES, r: rng.float(10, 20) });
    }
  }
  const nearRiver = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy += RES) for (let dx = -r; dx <= r; dx += RES) if (riverMask[at(x + dx, y + dy)]) return true;
    return false;
  };

  // ─── Povoados ────────────────────────────────────────────────────────────
  const towns: Town[] = [];
  const cands: { x: number; y: number; score: number; coast: boolean; river: boolean }[] = [];
  for (let y = 40; y < H - 40; y += RES * 3) {
    for (let x = 40; x < W - 40; x += RES * 3) {
      const h = hAt(x, y);
      if (h <= 0.02 || h > 0.4) continue;
      const coast = hAt(x + 25, y) <= 0 || hAt(x - 25, y) <= 0 || hAt(x, y + 25) <= 0 || hAt(x, y - 25) <= 0;
      const river = nearRiver(x, y, 15);
      cands.push({ x, y, score: rng.float(0, 0.8) + (coast ? 1 : 0) + (river ? 1.2 : 0) + (0.4 - h), coast, river });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const counts = { small: [2, 4], medium: [3, 7], large: [5, 10] }[o.size];
  const want: [Town["kind"], number, number][] = [["capital", 1, 320], ["town", counts[0], 210], ["village", counts[1], 110]];
  const names = rng.fork("names");
  for (const [kind, n, gap] of want) {
    let placed = 0;
    for (const c of cands) {
      if (placed >= n) break;
      if (towns.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < (t.kind === "village" && kind === "village" ? gap : Math.max(gap, 110)))) continue;
      towns.push({ x: c.x, y: c.y, kind, name: cityName(names), coast: c.coast, river: c.river });
      placed++;
    }
  }

  // ─── Símbolos de terreno ─────────────────────────────────────────────────
  const clearOfTowns = (x: number, y: number, r: number) => towns.every((t) => Math.hypot(t.x - x, t.y - y) > r);
  const mountains: Region["mountains"] = [];
  const hills: Region["hills"] = [];
  const trees: Region["trees"] = [];
  const marsh: Region["marsh"] = [];
  for (let y = 10; y < H; y += 24) {
    for (let x = 10; x < W; x += 26) {
      const px = x + rng.float(-8, 8) + ((y / 24) % 2) * 13;
      const py = y + rng.float(-6, 6);
      const h = hAt(px, py);
      if (h > 0.55 && !nearRiver(px, py, 10) && clearOfTowns(px, py, 30)) {
        mountains.push({ x: px, y: py, s: Math.min(36, 18 + (h - 0.55) * 60), j: rng.float(-0.25, 0.25) });
      } else if (h > 0.4 && h <= 0.55 && rng.chance(0.5) && !nearRiver(px, py, 8) && clearOfTowns(px, py, 24)) {
        hills.push({ x: px, y: py, s: rng.float(11, 16) });
      }
    }
  }
  for (let y = 6; y < H; y += 11) {
    for (let x = 6; x < W; x += 11) {
      const px = x + rng.float(-4, 4);
      const py = y + rng.float(-4, 4);
      const h = hAt(px, py);
      const m = mAt(px, py);
      if (h > 0.03 && h < 0.47 && m > 0.12 && !nearRiver(px, py, 6) && clearOfTowns(px, py, 18)) trees.push({ x: px, y: py, r: rng.float(4.2, 6) });
      else if (h > 0 && h < 0.06 && m > 0.3 && rng.chance(0.25) && clearOfTowns(px, py, 18)) marsh.push({ x: px, y: py });
    }
  }
  trees.sort((a, b) => a.y - b.y);
  mountains.sort((a, b) => a.y - b.y);

  // ─── Lugares de aventura (gerador próprio para não mudar mapas antigos) ──
  const sr = new Rng(`${o.seed}:sites`);
  const spots: { x: number; y: number; score: number }[] = [];
  for (let y = 130; y < H - 60; y += 30) {
    for (let x = 60; x < W - 60; x += 30) {
      if (hAt(x, y) <= 0.05 || nearRiver(x, y, 12) || !clearOfTowns(x, y, 120)) continue;
      if (lakes.some((l) => Math.hypot(l.x - x, l.y - y) < l.r + 25)) continue;
      spots.push({ x, y, score: sr.next() });
    }
  }
  spots.sort((a, b) => b.score - a.score);
  const sites: Site[] = [];
  const siteGap = Math.min(W, H) * 0.22;
  for (const s of spots) {
    if (sites.length >= { small: 2, medium: 3, large: 5 }[o.size]) break;
    if (sites.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < siteGap)) continue;
    sites.push(makeSite(sr, o.seed, s.x, s.y, hAt(s.x, s.y), mAt(s.x, s.y)));
  }
  const clearOfSites = (p: { x: number; y: number }) => sites.every((s) => Math.hypot(s.x - p.x, s.y - p.y) > 22);

  // ─── Estradas (MST + A* numa grade grossa) ───────────────────────────────
  const CG = 10;
  const cw = Math.ceil(W / CG);
  const ch = Math.ceil(H / CG);
  const cost = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const ux = x * CG + CG / 2;
      const uy = y * CG + CG / 2;
      const h = hAt(ux, uy);
      let c = 1;
      if (h <= 0) c = Infinity;
      else if (h > 0.55) c = 9;
      else if (h > 0.4) c = 2.6;
      else if (mAt(ux, uy) > 0.12 && h < 0.47) c = 1.7;
      if (riverMask[at(ux, uy)]) c += 5;
      cost[y * cw + x] = c;
    }
  }
  // componentes conexas de terra: povoados em ilhas diferentes não ganham estrada
  const comp = new Int32Array(cw * ch).fill(-1);
  for (let i = 0, id = 0; i < cw * ch; i++) {
    if (comp[i] >= 0 || !Number.isFinite(cost[i])) continue;
    const q = [i];
    comp[i] = id;
    for (let k = 0; k < q.length; k++) {
      const x = q[k] % cw;
      const y = (q[k] / cw) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = ny * cw + nx;
        if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && comp[j] < 0 && Number.isFinite(cost[j])) {
          comp[j] = id;
          q.push(j);
        }
      }
    }
    id++;
  }
  const astar = (a: Town, b: Town): Pt[] | null => {
    const start = Math.floor(a.y / CG) * cw + Math.floor(a.x / CG);
    const goal = Math.floor(b.y / CG) * cw + Math.floor(b.x / CG);
    if (comp[start] < 0 || comp[start] !== comp[goal]) return null;
    const closed = new Uint8Array(cw * ch);
    const g = new Float32Array(cw * ch).fill(Infinity);
    const prev = new Int32Array(cw * ch).fill(-1);
    const heap: [number, number][] = [];
    const push = (i: number, fsc: number) => {
      heap.push([fsc, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        while (true) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const hx = (i: number) => Math.hypot((i % cw) - (goal % cw), ((i / cw) | 0) - ((goal / cw) | 0));
    g[start] = 0;
    push(start, hx(start));
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) break;
      const x = cur % cw;
      const y = (cur / cw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const j = ny * cw + nx;
          const c = cost[j];
          if (!Number.isFinite(c) || closed[j]) continue;
          const ng = g[cur] + c * (dx && dy ? 1.414 : 1);
          if (ng < g[j]) {
            g[j] = ng;
            prev[j] = cur;
            push(j, ng + hx(j) * 1.2);
          }
        }
      }
    }
    if (prev[goal] < 0) return null;
    const out: Pt[] = [];
    for (let i = goal; i >= 0; i = prev[i]) out.unshift([(i % cw) * CG + CG / 2, ((i / cw) | 0) * CG + CG / 2]);
    out[0] = [a.x, a.y];
    out[out.length - 1] = [b.x, b.y];
    return chaikin(out.filter((_, k) => k % 2 === 0 || k === out.length - 1), 2, false);
  };
  const roads: Pt[][] = [];
  if (towns.length > 1) {
    const inTree = new Set([0]);
    const pairs: [number, number][] = [];
    while (inTree.size < towns.length) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (const i of inTree) {
        for (let j = 0; j < towns.length; j++) {
          if (inTree.has(j)) continue;
          const d = Math.hypot(towns[i].x - towns[j].x, towns[i].y - towns[j].y);
          if (d < bd) {
            bd = d;
            best = [i, j];
          }
        }
      }
      if (!best) break;
      inTree.add(best[1]);
      pairs.push(best);
    }
    for (const [i, j] of pairs) {
      if (Math.hypot(towns[i].x - towns[j].x, towns[i].y - towns[j].y) > W * 0.6) continue;
      const r = astar(towns[i], towns[j]);
      if (r) roads.push(r);
    }
  }

  // ─── Rótulos ─────────────────────────────────────────────────────────────
  const name = regionName(rng.fork("region"));
  const labels: Label[] = [];
  // mar: ponto de água mais longe da terra
  let seaBest = -1;
  let seaD = 0;
  for (let i = 0; i < pw * ph; i++) {
    const x = i % pw;
    const y = (i / pw) | 0;
    if (x < 30 || y < 30 || x > pw - 30 || y > ph - 30) continue;
    if (dw[i] > seaD) {
      seaD = dw[i];
      seaBest = i;
    }
  }
  if (seaBest >= 0 && seaD >= 10) {
    labels.push({ x: ((seaBest % pw) - 1) * RES, y: (((seaBest / pw) | 0) - 1) * RES, text: seaName(rng.fork("sea")), size: 40, italic: true, spacing: true, water: true });
  }
  const clusterCenter = (pts: { x: number; y: number }[], min: number): [number, number] | null => {
    if (pts.length < min) return null;
    // célula de 150 unidades com mais pontos
    const bins = new Map<string, { n: number; x: number; y: number }>();
    for (const p of pts) {
      const k = `${Math.floor(p.x / 150)},${Math.floor(p.y / 150)}`;
      const b = bins.get(k) ?? bins.set(k, { n: 0, x: 0, y: 0 }).get(k)!;
      b.n++;
      b.x += p.x;
      b.y += p.y;
    }
    const best = [...bins.values()].sort((a, b) => b.n - a.n)[0];
    return best.n >= min ? [best.x / best.n, best.y / best.n] : null;
  };
  const mc = clusterCenter(mountains, 6);
  if (mc) labels.push({ x: mc[0], y: mc[1] + 34, text: mountainName(rng.fork("mtn")), size: 27, italic: true, spacing: true });
  const fc = clusterCenter(trees, 60);
  if (fc) labels.push({ x: fc[0], y: fc[1], text: forestName(rng.fork("forest")), size: 26, italic: true, spacing: true });

  const deck = new Deck(rng.fork("notes"));
  const HOOKS = [
    "Bandidos atacam caravanas na estrada entre {a} e {b}.", "Uma torre antiga surgiu do nada perto de {a}.",
    "O senhor de {a} está recrutando mercenários.", "Lobos gigantes desceram das montanhas e cercam {b}.",
    "Um navio fantasma foi visto na costa perto de {a}.", "Pescadores de {b} encontraram uma estátua no fundo do rio.",
    "O povo de {a} e {b} está à beira da guerra por causa de um poço.", "Um eremita nas florestas diz conhecer a entrada de uma masmorra.",
  ];
  const tn = (k: Town["kind"]) => towns.filter((t) => t.kind === k).map((t) => t.name);
  const pick2 = () => {
    const a = rng.pick(towns)?.name ?? "a vila";
    const others = towns.filter((t) => t.name !== a);
    return [a, rng.pick(others)?.name ?? "a capital"];
  };
  const hooks = Array.from({ length: 3 }, () => {
    const [a, b] = pick2();
    return `• ${deck.draw("h", HOOKS).replace("{a}", a).replace("{b}", b)}`;
  });
  const notes = [
    name,
    "",
    `Capital: ${tn("capital").join(", ") || "—"}`,
    `Vilas: ${tn("town").join(", ") || "—"}`,
    `Aldeias: ${tn("village").join(", ") || "—"}`,
    `Lugares: ${sites.map((s) => s.name).join(", ") || "—"}`,
    "",
    "Ganchos:",
    ...hooks,
  ].join("\n");

  return {
    W, H, land, ripples, rivers, lakes, towns, sites, roads, labels, name, notes,
    mountains: mountains.filter(clearOfSites), hills: hills.filter(clearOfSites), trees: trees.filter(clearOfSites), marsh: marsh.filter(clearOfSites),
  };
}

/** Serra → caverna ou mina; mata → covil ou caverna; campo → ruínas ou torre. */
function makeSite(rng: Rng, seed: string, x: number, y: number, h: number, m: number): Site {
  const mountain = h > 0.47;
  const forest = !mountain && m > 0.12;
  const roll = rng.next();
  const size = rng.pick(["small", "medium", "large"]);
  if ((mountain && roll < 0.6) || (forest && roll < 0.3)) {
    const name = caveName(rng);
    return { x, y, icon: "cave", name, link: { kind: "cave", seed: `${seed}:${name}`, label: name, params: { size, water: rng.chance(0.6), open: rng.int(2, 4), name } } };
  }
  const theme: Theme = mountain ? "mina" : forest ? "covil" : rng.pick(["cripta", "templo", "fortaleza", "prisao", "arcano"] as const);
  const title = dungeonTitle(rng, theme);
  const icon = theme === "arcano" ? "tower" : theme === "mina" || theme === "covil" ? "cave" : "ruin";
  return { x, y, icon, name: title.title, link: { kind: "dungeon", seed: `${seed}:${title.title}`, label: title.title, params: { size, theme, title } } };
}

// ─── Desenho ─────────────────────────────────────────────────────────────────

const RSTYLES: Record<RegionStyle, { label: string; paper: string; ink: string; water: string; waterInk: string; tree: string; road: string; text: string }> = {
  parchment: { label: "Pergaminho", paper: "#efe3c4", ink: "#3b2f22", water: "#b6cccc", waterInk: "#6e8f92", tree: "#c9c99a", road: "#7b5b39", text: "#2e241a" },
  ink: { label: "Nanquim", paper: "#fbfaf6", ink: "#1f1f1f", water: "#e2ebef", waterInk: "#8ba2ad", tree: "#f1f2ea", road: "#555", text: "#1f1f1f" },
};
export const REGION_STYLES = RSTYLES;

export function renderRegion(r: Region, style: RegionStyle, hex: boolean, cellPx: number, cols: number, rows: number, gm = false): HTMLCanvasElement {
  const P = RSTYLES[style];
  const cv = document.createElement("canvas");
  cv.width = cols * cellPx;
  cv.height = rows * cellPx;
  const ctx = cv.getContext("2d")!;
  const s = cellPx / UNITS_PER_CELL;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const lw = (px: number) => Math.max(px / s, 0.4);
  const polyPath = (target: CanvasRenderingContext2D | Path2D, polys: Pt[][], close = true) => {
    for (const poly of polys) {
      target.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) target.lineTo(poly[i][0], poly[i][1]);
      if (close) target.closePath();
    }
  };

  // mar e terra
  ctx.fillStyle = P.water;
  ctx.fillRect(0, 0, r.W, r.H);
  const landPath = new Path2D();
  polyPath(landPath, r.land);
  ctx.save();
  // ondulações só na água
  const waterClip = new Path2D();
  waterClip.rect(-10, -10, r.W + 20, r.H + 20);
  polyPath(waterClip, r.land);
  ctx.clip(waterClip, "evenodd");
  ctx.strokeStyle = P.waterInk;
  r.ripples.forEach((level, k) => {
    ctx.globalAlpha = 0.75 - k * 0.2;
    ctx.lineWidth = lw(1.2);
    ctx.beginPath();
    polyPath(ctx, level, false);
    ctx.stroke();
  });
  ctx.restore();
  ctx.fillStyle = P.paper;
  ctx.fill(landPath, "evenodd");

  // lagos e rios
  ctx.save();
  ctx.fillStyle = P.water;
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw(1.4);
  for (const l of r.lakes) {
    ctx.beginPath();
    ctx.ellipse(l.x, l.y, l.r, l.r * 0.7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const rv of r.rivers) {
    const n = rv.pts.length;
    const chunks = 4;
    for (let c = 0; c < chunks; c++) {
      const a = Math.floor((c * n) / chunks);
      const b = Math.min(n, Math.floor(((c + 1) * n) / chunks) + 1);
      ctx.beginPath();
      polyPath(ctx, [rv.pts.slice(a, b)], false);
      ctx.strokeStyle = P.waterInk;
      ctx.lineWidth = rv.width * (0.45 + (0.55 * (c + 1)) / chunks) + lw(1);
      ctx.stroke();
    }
  }
  ctx.restore();

  // costa
  ctx.save();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw(2.2);
  ctx.lineJoin = "round";
  ctx.stroke(landPath);
  ctx.restore();

  // pântanos
  ctx.save();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw(0.9);
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  for (const m of r.marsh) {
    ctx.moveTo(m.x - 5, m.y);
    ctx.lineTo(m.x + 5, m.y);
    for (const dx of [-3, 0, 3]) {
      ctx.moveTo(m.x + dx, m.y);
      ctx.lineTo(m.x + dx * 1.3, m.y - 4 - Math.abs(dx) * -0.2);
    }
  }
  ctx.stroke();
  ctx.restore();

  // florestas
  ctx.save();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw(0.9);
  ctx.fillStyle = P.tree;
  for (const t of r.trees) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // colinas e montanhas
  ctx.save();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw(1.1);
  ctx.lineJoin = "round";
  for (const h of r.hills) {
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, h.s / 2, h.s * 0.38, 0, Math.PI, 2 * Math.PI);
    ctx.fillStyle = P.paper;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h.x + h.s * 0.12, h.y - h.s * 0.16);
    ctx.lineTo(h.x + h.s * 0.28, h.y - h.s * 0.02);
    ctx.stroke();
  }
  for (const m of r.mountains) {
    const w = m.s;
    const hgt = m.s * 0.85;
    const apex: Pt = [m.x + m.j * w * 0.3, m.y - hgt];
    ctx.beginPath();
    ctx.moveTo(m.x - w / 2, m.y);
    ctx.lineTo(apex[0], apex[1]);
    ctx.lineTo(m.x + w / 2, m.y);
    ctx.closePath();
    ctx.fillStyle = P.paper;
    ctx.fill();
    // lado sombreado
    ctx.beginPath();
    ctx.moveTo(apex[0], apex[1]);
    ctx.lineTo(m.x + w / 2, m.y);
    ctx.lineTo(m.x + w * 0.08, m.y);
    ctx.closePath();
    ctx.fillStyle = P.ink;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(m.x - w / 2, m.y);
    ctx.lineTo(apex[0], apex[1]);
    ctx.lineTo(m.x + w / 2, m.y);
    ctx.stroke();
  }
  ctx.restore();

  // estradas
  ctx.save();
  ctx.strokeStyle = P.road;
  ctx.lineWidth = lw(1.8);
  ctx.setLineDash([6, 4]);
  ctx.lineCap = "round";
  for (const rd of r.roads) {
    ctx.beginPath();
    polyPath(ctx, [rd], false);
    ctx.stroke();
  }
  ctx.restore();

  // lugares de aventura (o nome só aparece para o mestre)
  ctx.save();
  ctx.lineJoin = "round";
  for (const st of r.sites) {
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.strokeStyle = P.ink;
    ctx.fillStyle = P.paper;
    ctx.lineWidth = lw(1.4);
    ctx.beginPath();
    if (st.icon === "cave") {
      ctx.moveTo(-12, 6);
      ctx.quadraticCurveTo(0, -18, 12, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 6);
      ctx.quadraticCurveTo(0, -5, 5, 6);
      ctx.closePath();
      ctx.fillStyle = P.ink;
      ctx.fill();
    } else if (st.icon === "tower") {
      ctx.rect(-4, -9, 8, 16);
      ctx.rect(-6, -14, 12, 5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, -14);
      ctx.lineTo(-2, -11.5);
      ctx.moveTo(2, -14);
      ctx.lineTo(2, -11.5);
      ctx.stroke();
    } else {
      // colunas partidas sobre uma base
      ctx.rect(-10, -5, 4, 11);
      ctx.rect(-2, -11, 4, 17);
      ctx.rect(6, -2, 4, 8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-13, 6);
      ctx.lineTo(13, 6);
      ctx.stroke();
    }
    ctx.restore();
    if (gm) {
      ctx.font = `italic 600 15px "Palatino Linotype", Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineWidth = 4;
      ctx.strokeStyle = P.paper;
      ctx.strokeText(st.name, st.x, st.y + 10);
      ctx.fillStyle = P.text;
      ctx.fillText(st.name, st.x, st.y + 10);
    }
  }
  ctx.restore();

  // povoados
  ctx.save();
  for (const t of r.towns) {
    ctx.strokeStyle = P.ink;
    ctx.fillStyle = P.ink;
    ctx.lineWidth = lw(1.5);
    ctx.beginPath();
    if (t.kind === "capital") {
      ctx.arc(t.x, t.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = P.paper;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.fillRect(t.x - 5.5, t.y - 5.5, 11, 11);
    } else if (t.kind === "town") {
      ctx.arc(t.x, t.y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = P.paper;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = P.ink;
      ctx.fill();
    } else {
      ctx.arc(t.x, t.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const fs = t.kind === "capital" ? 27 : t.kind === "town" ? 21 : 16;
    ctx.font = `${t.kind === "village" ? "" : "700 "}${fs}px "Palatino Linotype", Georgia, serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = fs * 0.28;
    ctx.strokeStyle = P.paper;
    ctx.lineJoin = "round";
    // nome à direita do símbolo; à esquerda se não couber
    const off = t.kind === "capital" ? 16 : 11;
    const tw = ctx.measureText(t.name).width;
    const right = t.x + off + tw < r.W - 8;
    ctx.textAlign = right ? "left" : "right";
    const lx = right ? t.x + off : t.x - off;
    ctx.strokeText(t.name, lx, t.y);
    ctx.fillStyle = P.text;
    ctx.fillText(t.name, lx, t.y);
  }
  ctx.restore();

  // rótulos de mar/serra/floresta
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of r.labels) {
    ctx.font = `${l.italic ? "italic " : ""}600 ${l.size}px "Palatino Linotype", Georgia, serif`;
    const text = l.spacing ? l.text.split("").join(String.fromCharCode(8202)) : l.text;
    const tw = ctx.measureText(text).width;
    const top = r.W * 0.034 * 2.4 + l.size; // abaixo do título
    const x = Math.min(Math.max(l.x, tw / 2 + 12), r.W - tw / 2 - 12);
    const y = Math.min(Math.max(l.y, top), r.H - l.size);
    ctx.lineWidth = l.size * 0.25;
    ctx.strokeStyle = l.water ? P.water : P.paper;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = l.water ? P.waterInk : P.text;
    ctx.fillText(text, x, y);
  }
  ctx.restore();

  // grade hexagonal (topo plano)
  if (hex) {
    const R = r.W / 34;
    const hw = R * 1.5;
    const hh = R * Math.sqrt(3);
    ctx.save();
    ctx.strokeStyle = P.ink;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = lw(1);
    ctx.beginPath();
    for (let c = -1; c * hw < r.W + R; c++) {
      for (let row = -1; row * hh < r.H + hh; row++) {
        const cx = c * hw;
        const cy = row * hh + (c % 2 ? hh / 2 : 0);
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const x = cx + Math.cos(a) * R;
          const y = cy + Math.sin(a) * R;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // título, rosa dos ventos, escala
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const fs = Math.round(cv.width * 0.034);
  ctx.save();
  ctx.font = `700 ${fs}px "Palatino Linotype", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const title = r.name.toUpperCase().split("").join(String.fromCharCode(8202));
  ctx.lineWidth = fs * 0.22;
  ctx.lineJoin = "round";
  ctx.strokeStyle = P.paper;
  ctx.strokeText(title, cv.width / 2, fs * 0.6);
  ctx.fillStyle = P.text;
  ctx.fillText(title, cv.width / 2, fs * 0.6);
  ctx.restore();
  drawCompass(ctx, cv.width - cv.width * 0.06, cv.height - cv.width * 0.07, cv.width * 0.028, P.text, P.paper);
  return cv;
}

export function buildRegion(o: RegionOpts): Built {
  const r = generateRegion(o);
  const cols = Math.ceil(r.W / UNITS_PER_CELL);
  const rows = Math.ceil(r.H / UNITS_PER_CELL);
  // mundo interligado: cada povoado abre o gerador de cidade; cada lugar, sua masmorra/caverna
  const townLink = (t: Town): WorldLink => ({
    kind: "city", seed: `${o.seed}:${t.name}`, label: t.name,
    params: {
      size: t.kind === "capital" ? (o.size === "large" ? "capital" : "city") : t.kind,
      walls: t.kind !== "village", citadel: t.kind === "capital", river: t.river, coast: t.coast, name: t.name,
    },
  });
  const cellOf = (p: { x: number; y: number }) => ({ x: p.x / UNITS_PER_CELL, y: p.y / UNITS_PER_CELL });
  return {
    links: [...r.towns.map((t) => ({ ...cellOf(t), link: townLink(t) })), ...r.sites.map((s) => ({ ...cellOf(s), link: s.link }))],
    title: r.name,
    notes: r.notes,
    cols,
    rows,
    grid: false,
    bg: RSTYLES[o.style].water,
    scale: { value: 1, unit: "km" },
    render: (cell, gm) => renderRegion(r, o.style, o.hex, cell, cols, rows, gm),
  };
}
