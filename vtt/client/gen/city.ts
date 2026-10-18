// Gerador de cidades/vilas (inspirado no Medieval Fantasy City Generator do Watabou):
// pontos em espiral → Voronoi relaxado → bairros internos → muralha/portões → ruas → lotes e casas.
import { Delaunay } from "d3-delaunay";
import { area, chaikin, dist, insetConvex, lerp, orient, pointInPoly, splitConvex, type Pt } from "./geom.ts";
import { cityName, Deck, WARD_NAMES, type Theme, type Title } from "./names.ts";
import { Noise } from "./noise.ts";
import { Rng } from "./rng.ts";
import type { Built } from "./types.ts";

export type CitySize = "village" | "town" | "city" | "capital";
export type CityStyle = "parchment" | "ink" | "night";
export interface CityOpts { seed: string; size: CitySize; walls: boolean; citadel: boolean; river: boolean; coast: boolean; style: CityStyle; name?: string }

type Ward = "market" | "castle" | "temple" | "craftsmen" | "merchants" | "patriciate" | "slum" | "military" | "park" | "harbour" | "farm" | "wild" | "water" | "suburb";

interface Patch {
  i: number;
  site: Pt;
  poly: Pt[];        // orientado (área > 0)
  nb: number[];      // vizinho do outro lado de cada aresta (poly[k] → poly[k+1]); -1 = borda
  inner: boolean;
  ward: Ward;
}

interface City {
  name: string;
  half: number;      // metade do lado do mapa (unidades = metros)
  patches: Patch[];
  buildings: { poly: Pt[]; special: boolean; outline?: boolean }[];
  fields: { poly: Pt[]; angle: number }[];
  trees: { p: Pt; r: number }[];
  wall: Pt[] | null;
  wallClosed: boolean;
  coast: { pts: Pt[]; closed: boolean }[];
  towers: Pt[];
  gates: Pt[];
  roads: Pt[][];
  river: Pt[] | null;
  bridges: { p: Pt; angle: number }[];
  piers: Pt[][];
  labels: { p: Pt; text: string }[];
  notes: string;
}

const UNIT_PER_CELL = 10;
const vkey = (p: Pt) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

function polyCentroid(poly: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) return poly[0];
  return [cx / (3 * a), cy / (3 * a)];
}

/** Dijkstra no grafo de vértices do Voronoi. */
function shortestPath(adj: Map<string, { to: string; w: number }[]>, from: string, isGoal: (k: string) => boolean): string[] | null {
  const distMap = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size) {
    let cur = "";
    let best = Infinity;
    for (const k of open) {
      const d = distMap.get(k)!;
      if (d < best) {
        best = d;
        cur = k;
      }
    }
    open.delete(cur);
    if (isGoal(cur) && cur !== from) {
      const path = [cur];
      while (prev.has(path[0])) path.unshift(prev.get(path[0])!);
      return path;
    }
    for (const e of adj.get(cur) ?? []) {
      const nd = best + e.w;
      if (nd < (distMap.get(e.to) ?? Infinity)) {
        distMap.set(e.to, nd);
        prev.set(e.to, cur);
        open.add(e.to);
      }
    }
  }
  return null;
}

/** Encadeia arestas (pares de chaves de vértice) em polilinhas; abertas começam pelas pontas. */
function chainEdges(list: { a: string; b: string }[]): { keys: string[]; closed: boolean }[] {
  const adj = new Map<string, string[]>();
  for (const e of list) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
  }
  const used = new Set<string>();
  const ek = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const starts = [...adj.keys()].sort((x, y) => adj.get(x)!.length - adj.get(y)!.length);
  const out: { keys: string[]; closed: boolean }[] = [];
  for (const s of starts) {
    for (const first of adj.get(s)!) {
      if (used.has(ek(s, first))) continue;
      const keys = [s];
      let prev = s;
      let cur = first;
      used.add(ek(s, first));
      let closed = false;
      for (let guard = 0; guard < 5000; guard++) {
        if (cur === s) {
          closed = true;
          break;
        }
        keys.push(cur);
        const next = adj.get(cur)!.find((n) => n !== prev && !used.has(ek(cur, n)));
        if (!next) break;
        used.add(ek(cur, next));
        prev = cur;
        cur = next;
      }
      out.push({ keys, closed });
    }
  }
  return out;
}

export function generateCity(o: CityOpts): City {
  const rng = new Rng(`${o.seed}:city:${o.size}`);
  const nInner = { village: rng.int(6, 8), town: rng.int(13, 17), city: rng.int(26, 32), capital: rng.int(44, 52) }[o.size];
  const walls = o.walls && o.size !== "village";
  const total = Math.round(nInner * 3.2) + 20;
  const k = 46; // espaçamento da espiral (≈ tamanho de um bairro)

  // ─── Pontos em espiral + Voronoi relaxado ────────────────────────────────
  let pts: Pt[] = [];
  const a0 = rng.float(0, Math.PI * 2);
  for (let i = 0; i < total; i++) {
    const a = a0 + Math.sqrt(i) * 5;
    const r = i === 0 ? 0 : 10 + Math.sqrt(i) * k * rng.float(0.85, 1.1);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const R = Math.sqrt(total) * k * 1.15 + 80;
  const bounds = [-R, -R, R, R] as [number, number, number, number];
  let vor = Delaunay.from(pts).voronoi(bounds);
  for (let it = 0; it < 3; it++) {
    pts = pts.map((p, i) => {
      if (i === 0) return p;
      const cell = vor.cellPolygon(i);
      return cell ? polyCentroid(cell.slice(0, -1) as Pt[]) : p;
    });
    vor = Delaunay.from(pts).voronoi(bounds);
  }

  // ─── Polígonos e vizinhança por aresta ───────────────────────────────────
  const owners = new Map<string, number[]>();
  const patches: Patch[] = pts.map((site, i) => {
    const raw = (vor.cellPolygon(i) ?? []).slice(0, -1) as Pt[];
    const poly = orient(raw.map((p) => [p[0], p[1]] as Pt));
    for (const v of poly) (owners.get(vkey(v)) ?? owners.set(vkey(v), []).get(vkey(v))!).push(i);
    return { i, site, poly, nb: [], inner: false, ward: "wild" as Ward };
  });
  for (const p of patches) {
    p.nb = p.poly.map((v, k2) => {
      const w = p.poly[(k2 + 1) % p.poly.length];
      const a = owners.get(vkey(v)) ?? [];
      const b = new Set(owners.get(vkey(w)) ?? []);
      return a.find((j) => j !== p.i && b.has(j)) ?? -1;
    });
  }

  // ─── Água: costa e rio ───────────────────────────────────────────────────
  const noise = new Noise(rng.fork("coast"));
  const cityR = Math.sqrt(nInner) * k;
  if (o.coast) {
    const ang = rng.float(0, Math.PI * 2);
    const dir: Pt = [Math.cos(ang), Math.sin(ang)];
    for (const p of patches) {
      const d = p.site[0] * dir[0] + p.site[1] * dir[1] + noise.get(p.site[0] * 0.004, p.site[1] * 0.004) * 60;
      if (d > cityR * 0.75) p.ward = "water";
    }
  }
  const byDist = patches.filter((p) => p.ward !== "water").sort((a, b) => Math.hypot(...a.site) - Math.hypot(...b.site));
  for (const p of byDist.slice(0, nInner)) p.inner = true;
  const inner = patches.filter((p) => p.inner);

  // grafo de vértices (para ruas, rio, muralha)
  type EdgeInfo = { a: string; b: string; pa: Pt; pb: Pt; left: number; right: number };
  const edges = new Map<string, EdgeInfo>();
  const vpos = new Map<string, Pt>();
  for (const p of patches) {
    p.poly.forEach((v, k2) => {
      const w = p.poly[(k2 + 1) % p.poly.length];
      const ka = vkey(v);
      const kb = vkey(w);
      vpos.set(ka, v);
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = edges.get(ek);
      if (e) e.right = p.i;
      else edges.set(ek, { a: ka, b: kb, pa: v, pb: w, left: p.i, right: -1 });
    });
  }
  const isWater = (i: number) => i >= 0 && patches[i].ward === "water";
  const isInner = (i: number) => i >= 0 && patches[i].inner;
  const buildAdj = (ok: (e: EdgeInfo) => boolean, weight: (e: EdgeInfo) => number = (e) => dist(e.pa, e.pb)) => {
    const adj = new Map<string, { to: string; w: number }[]>();
    for (const e of edges.values()) {
      if (!ok(e)) continue;
      const w = weight(e);
      (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push({ to: e.b, w });
      (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push({ to: e.a, w });
    }
    return adj;
  };

  // Rio: de uma borda à oposta, passando perto do centro
  let river: Pt[] | null = null;
  const riverKeys = new Set<string>();
  if (o.river) {
    const ang = rng.float(0, Math.PI * 2);
    const far = (sign: number) => {
      let best = "";
      let bestScore = -Infinity;
      for (const [kk, p] of vpos) {
        const s = sign * (p[0] * Math.cos(ang) + p[1] * Math.sin(ang));
        if (s > bestScore) {
          bestScore = s;
          best = kk;
        }
      }
      return best;
    };
    const start = far(1);
    const end = far(-1);
    const adj = buildAdj(
      (e) => !(isWater(e.left) && isWater(e.right)),
      (e) => {
        const m: Pt = [(e.pa[0] + e.pb[0]) / 2, (e.pa[1] + e.pb[1]) / 2];
        const r = Math.hypot(...m);
        return dist(e.pa, e.pb) * (1 + Math.max(0, cityR * 0.4 - r) / 200 + noise.get(m[0] * 0.01, m[1] * 0.01) * 0.6 + 0.6);
      },
    );
    const path = shortestPath(adj, start, (kk) => kk === end);
    if (path) {
      // corta o rio onde entra no mar
      const cut: string[] = [];
      for (const kk of path) {
        cut.push(kk);
        const ow = owners.get(kk) ?? [];
        if (ow.length && ow.every((j) => isWater(j))) break;
      }
      for (const kk of cut) riverKeys.add(kk);
      river = cut.map((kk) => vpos.get(kk)!);
    }
  }
  const riverEdge = (e: EdgeInfo) => riverKeys.has(e.a) && riverKeys.has(e.b);

  // ─── Muralha (contorno dos bairros internos) ─────────────────────────────
  const boundary = [...edges.values()].filter((e) => isInner(e.left) !== isInner(e.right) && !isWater(e.left) && !isWater(e.right));
  const wallChain = chainEdges(boundary).sort((x, y) => y.keys.length - x.keys.length)[0] ?? { keys: [], closed: false };
  const wallLoop = wallChain.keys;
  const wall = walls && wallLoop.length > 3 ? wallLoop.map((kk) => vpos.get(kk)!) : null;
  const coast = chainEdges([...edges.values()].filter((e) => e.left >= 0 && e.right >= 0 && isWater(e.left) !== isWater(e.right)))
    .map((ch) => ({ pts: ch.keys.map((kk) => vpos.get(kk)!), closed: ch.closed }));

  // ─── Bairros especiais ───────────────────────────────────────────────────
  const plaza = inner[0];
  plaza.ward = "market";
  const onBoundary = (p: Patch) => p.nb.some((j) => !isInner(j));
  let castle: Patch | undefined;
  if (o.citadel) {
    castle = inner.filter((p) => p !== plaza && onBoundary(p) && !p.nb.some(isWater)).sort((a, b) => Math.hypot(...b.site) - Math.hypot(...a.site))[0];
    if (castle) castle.ward = "castle";
  }
  const free = () => inner.filter((p) => p.ward === "wild");
  const temple = free().find((p) => plaza.nb.includes(p.i));
  if (temple && o.size !== "village") temple.ward = "temple";
  if (castle) {
    const mil = free().find((p) => castle!.nb.includes(p.i));
    if (mil && nInner > 12) mil.ward = "military";
  }
  if (nInner > 12) {
    const park = rng.pick(free());
    if (park) park.ward = "park";
  }
  for (const p of free()) {
    const r = Math.hypot(...p.site) / cityR;
    if (p.nb.some(isWater) && o.coast) p.ward = "harbour";
    else if (o.size === "village") p.ward = "craftsmen";
    else if (r < 0.45 && rng.chance(0.55)) p.ward = "patriciate";
    else if (plaza.nb.includes(p.i) && rng.chance(0.6)) p.ward = "merchants";
    else if (onBoundary(p) && rng.chance(0.45)) p.ward = "slum";
    else p.ward = rng.chance(0.3) ? "merchants" : "craftsmen";
  }

  // ─── Portões e estradas ──────────────────────────────────────────────────
  const loopKeys = wallLoop;
  const nGates = o.size === "village" ? 3 : Math.min(5, 2 + Math.round(nInner / 10));
  const gateKeys: string[] = [];
  const candidates = loopKeys.filter((kk) => {
    const ow = owners.get(kk) ?? [];
    return !ow.some((j) => isWater(j) || patches[j]?.ward === "castle") && !riverKeys.has(kk);
  });
  if (candidates.length) {
    gateKeys.push(rng.pick(candidates));
    while (gateKeys.length < nGates && gateKeys.length < candidates.length) {
      let best = "";
      let bestD = -1;
      for (const c of candidates) {
        const p = vpos.get(c)!;
        const d = Math.min(...gateKeys.map((g) => {
          const q = vpos.get(g)!;
          let da = Math.abs(Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
          if (da > Math.PI) da = Math.PI * 2 - da;
          return da;
        }));
        if (d > bestD) {
          bestD = d;
          best = c;
        }
      }
      if (bestD < 0.5) break;
      gateKeys.push(best);
    }
  }
  const plazaKeys = new Set(plaza.poly.map(vkey));
  const innerAdj = buildAdj((e) => (isInner(e.left) || isInner(e.right)) && !(isWater(e.left) && isWater(e.right)) && !(patches[e.left]?.ward === "castle" && patches[e.right]?.ward === "castle"));
  const outerAdj = buildAdj(
    (e) => !isInner(e.left) && !isInner(e.right) && !isWater(e.left) && !isWater(e.right),
  );
  const roads: Pt[][] = [];
  const roadKeys = new Set<string>();
  const markRoad = (path: string[]) => {
    roads.push(path.map((kk) => vpos.get(kk)!));
    for (let i = 0; i + 1 < path.length; i++) roadKeys.add(path[i] < path[i + 1] ? `${path[i]}|${path[i + 1]}` : `${path[i + 1]}|${path[i]}`);
  };
  for (const g of gateKeys) {
    const inPath = shortestPath(innerAdj, g, (kk) => plazaKeys.has(kk));
    if (inPath) markRoad(inPath);
    const gp = vpos.get(g)!;
    const gd = Math.hypot(...gp) || 1;
    const dir: Pt = [gp[0] / gd, gp[1] / gd];
    const outPath = shortestPath(outerAdj, g, (kk) => {
      const p = vpos.get(kk)!;
      return Math.max(Math.abs(p[0]), Math.abs(p[1])) > cityR * 1.9 && p[0] * dir[0] + p[1] * dir[1] > cityR;
    });
    if (outPath) markRoad(outPath);
  }
  const isRoadEdge = (e: EdgeInfo) => roadKeys.has(e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`);

  // subúrbios ao longo das estradas, fora da muralha
  for (const p of patches) {
    if (p.inner || p.ward === "water") continue;
    const r = Math.hypot(...p.site);
    const touchesRoad = p.poly.some((v, k2) => {
      const w = p.poly[(k2 + 1) % p.poly.length];
      const e = edges.get(vkey(v) < vkey(w) ? `${vkey(v)}|${vkey(w)}` : `${vkey(w)}|${vkey(v)}`);
      return !!e && isRoadEdge(e);
    });
    if (touchesRoad && r < cityR * 1.5 && rng.chance(o.size === "village" ? 0.3 : 0.6)) p.ward = "suburb";
    else if (r < cityR * 2.1 && rng.chance(0.75)) p.ward = "farm";
    else p.ward = "wild";
  }

  // ─── Quadras: encolhe cada polígono conforme o que há em cada aresta ─────
  const buildings: City["buildings"] = [];
  const fields: City["fields"] = [];
  const trees: City["trees"] = [];
  const piers: Pt[][] = [];
  const minArea: Partial<Record<Ward, number>> = {
    slum: 30, craftsmen: 55, merchants: 75, patriciate: 140, military: 180, harbour: 150, suburb: 50, temple: 60, castle: 90,
  };
  const subdivide = (poly: Pt[], min: number, out: Pt[][], depth = 0) => {
    const a = area(poly);
    if (a < min * rng.float(1, 2.2) || depth > 14) {
      out.push(poly);
      return;
    }
    let li = 0;
    let ll = 0;
    for (let i = 0; i < poly.length; i++) {
      const l = dist(poly[i], poly[(i + 1) % poly.length]);
      if (l > ll) {
        ll = l;
        li = i;
      }
    }
    const A = poly[li];
    const B = poly[(li + 1) % poly.length];
    const P: Pt = [lerp(A[0], B[0], rng.float(0.38, 0.62)), lerp(A[1], B[1], rng.float(0.38, 0.62))];
    const [p1, p2] = splitConvex(poly, P, [-(B[1] - A[1]), B[0] - A[0]]);
    if (p1.length < 3 || p2.length < 3 || area(p1) < 4 || area(p2) < 4) {
      out.push(poly);
      return;
    }
    subdivide(p1, min, out, depth + 1);
    subdivide(p2, min, out, depth + 1);
  };
  const onEdge = (q: Pt, poly: Pt[]) => poly.some((v, i) => {
    const w = poly[(i + 1) % poly.length];
    const l = dist(v, w);
    return Math.abs(dist(v, q) + dist(q, w) - l) < 0.5;
  });

  for (const p of patches) {
    if (p.ward === "water") continue;
    const d = p.poly.map((v, k2) => {
      const w = p.poly[(k2 + 1) % p.poly.length];
      const e = edges.get(vkey(v) < vkey(w) ? `${vkey(v)}|${vkey(w)}` : `${vkey(w)}|${vkey(v)}`);
      const nb = p.nb[k2];
      if (e && riverEdge(e)) return 9;
      if (e && isRoadEdge(e)) return 4.5;
      if (isWater(nb)) return 2;
      if (p.inner && !isInner(nb)) return walls ? 7 : 3;
      if (p.inner) return 2.2;
      return 1;
    });
    const block = insetConvex(p.poly, d);
    if (!block) continue;
    const ward = p.ward;
    if (ward === "farm") {
      const parts: Pt[][] = [];
      subdivide(block, area(block) / rng.int(2, 4), parts, 10);
      for (const f of parts) {
        const fi = insetConvex(f, 1.2);
        if (fi) fields.push({ poly: fi, angle: rng.float(0, Math.PI) });
      }
      if (rng.chance(0.5)) {
        const c = polyCentroid(block);
        buildings.push({ poly: [[c[0] - 5, c[1] - 4], [c[0] + 5, c[1] - 4], [c[0] + 5, c[1] + 4], [c[0] - 5, c[1] + 4]], special: false });
      }
      continue;
    }
    if (ward === "wild") {
      const n = Math.floor(area(block) / 900);
      for (let t = 0; t < n; t++) {
        const xs = block.map((v) => v[0]);
        const ys = block.map((v) => v[1]);
        const q: Pt = [rng.float(Math.min(...xs), Math.max(...xs)), rng.float(Math.min(...ys), Math.max(...ys))];
        if (pointInPoly(q, block) && noise.get(q[0] * 0.01, q[1] * 0.01) > -0.1) trees.push({ p: q, r: rng.float(4, 7) });
      }
      continue;
    }
    if (ward === "park") {
      const n = Math.floor(area(block) / 120);
      const xs = block.map((v) => v[0]);
      const ys = block.map((v) => v[1]);
      for (let t = 0; t < n; t++) {
        const q: Pt = [rng.float(Math.min(...xs), Math.max(...xs)), rng.float(Math.min(...ys), Math.max(...ys))];
        if (pointInPoly(q, block)) trees.push({ p: q, r: rng.float(3, 5.5) });
      }
      continue;
    }
    if (ward === "market") {
      // praça no meio, casas em volta
      const c = polyCentroid(block);
      const plazaR = Math.sqrt(area(block)) * 0.3;
      const lots: Pt[][] = [];
      subdivide(block, minArea.merchants!, lots);
      for (const lot of lots) {
        if (dist(polyCentroid(lot), c) < plazaR || lot.some((v) => dist(v, c) < plazaR * 0.75)) continue;
        const bld = insetConvex(lot, 0.6);
        if (bld && area(bld) > 12) buildings.push({ poly: bld, special: false });
      }
      buildings.push({ poly: octagon(c, 4), special: true });
      for (let t = 0; t < 10; t++) {
        const ang = rng.float(0, Math.PI * 2);
        const r = rng.float(9, plazaR * 0.7);
        const q: Pt = [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r];
        const stall = rectAt(q, 4, 3, ang);
        if (stall.every((v) => pointInPoly(v, block))) buildings.push({ poly: stall, special: false });
      }
      continue;
    }
    if (ward === "castle" || ward === "temple") {
      const c = polyCentroid(block);
      let li = 0;
      let ll = 0;
      for (let i = 0; i < block.length; i++) {
        const l = dist(block[i], block[(i + 1) % block.length]);
        if (l > ll) {
          ll = l;
          li = i;
        }
      }
      const A = block[li];
      const B = block[(li + 1) % block.length];
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      const size = Math.sqrt(area(block));
      if (ward === "castle") {
        const ring = insetConvex(block, 3);
        if (ring) buildings.push({ poly: ring, special: true, outline: true }); // muralha interna do castelo
        const keep = rectAt(c, size * 0.32, size * 0.28, ang);
        buildings.push({ poly: keep, special: true });
      } else {
        // catedral em cruz
        const L = size * 0.55;
        const W = size * 0.2;
        buildings.push({ poly: rectAt(c, L, W, ang), special: true });
        buildings.push({ poly: rectAt([c[0] + Math.cos(ang) * L * 0.18, c[1] + Math.sin(ang) * L * 0.18], W * 0.9, L * 0.5, ang), special: true });
        const rest: Pt[][] = [];
        subdivide(block, minArea.temple!, rest);
        for (const lot of rest) {
          if (lot.some((v) => dist(v, c) < L * 0.45)) continue;
          const b = insetConvex(lot, 0.5);
          if (b && onEdgeAny(lot, block)) buildings.push({ poly: b, special: false });
        }
      }
      continue;
    }
    // bairros comuns
    const lots: Pt[][] = [];
    subdivide(block, minArea[ward] ?? 60, lots);
    for (const lot of lots) {
      const interior = !lot.some((v) => onEdge(v, block));
      if (interior && rng.chance(ward === "slum" ? 0.15 : 0.55)) {
        if (ward === "patriciate" && rng.chance(0.6)) trees.push({ p: polyCentroid(lot), r: rng.float(3, 5) });
        continue;
      }
      if (ward === "suburb" && (interior || rng.chance(0.35))) continue;
      if (o.size === "village" && rng.chance(0.4)) continue;
      const b = insetConvex(lot, ward === "slum" ? 0.3 : 0.6);
      if (!b) continue;
      const a = area(b);
      const long = Math.max(...b.map((v, i) => dist(v, b[(i + 1) % b.length])));
      if (a / long < 2.2) continue; // lascas finas
      buildings.push({ poly: b, special: ward === "military" });
    }
    if (ward === "harbour") {
      p.poly.forEach((v, k2) => {
        if (!isWater(p.nb[k2])) return;
        const w = p.poly[(k2 + 1) % p.poly.length];
        const len = dist(v, w);
        const n = Math.max(1, Math.floor(len / 30));
        // normal apontando para fora do polígono (área positiva com y para baixo → para fora = (dy, -dx))
        const nx = (w[1] - v[1]) / len;
        const ny = -(w[0] - v[0]) / len;
        for (let t = 0; t < n; t++) {
          const m: Pt = [lerp(v[0], w[0], (t + 0.5) / n), lerp(v[1], w[1], (t + 0.5) / n)];
          const L = rng.float(14, 26);
          piers.push(rectAt([m[0] + nx * L * 0.5, m[1] + ny * L * 0.5], 3.5, L, Math.atan2(ny, nx) + Math.PI / 2));
        }
      });
    }
  }

  // torres e portões
  const towers: Pt[] = [];
  const gates: Pt[] = gateKeys.map((g) => vpos.get(g)!);
  if (wall) {
    for (const v of wall) if (!gates.includes(v)) towers.push(v);
  }
  // pontes onde estradas cruzam o rio
  const bridges: City["bridges"] = [];
  if (river) {
    for (const road of roads) {
      for (let i = 1; i < road.length - 1; i++) {
        if (!riverKeys.has(vkey(road[i]))) continue;
        const a = road[i - 1];
        const b = road[i + 1];
        bridges.push({ p: road[i], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) });
      }
    }
  }

  const half = cityR * (o.size === "village" ? 1.9 : 1.45) + 30;
  const rolled = cityName(rng.fork("name"));
  const name = o.name || rolled; // nome vindo do mapa da região
  const labels: City["labels"] = [];
  for (const p of inner) {
    if (["market", "castle", "temple", "harbour", "park"].includes(p.ward)) labels.push({ p: polyCentroid(p.poly), text: WARD_NAMES[p.ward] });
  }

  // notas do mestre
  const counts = new Map<Ward, number>();
  for (const p of inner) counts.set(p.ward, (counts.get(p.ward) ?? 0) + 1);
  const pop = Math.round((buildings.length * rng.float(5, 7)) / 10) * 10;
  const deck = new Deck(rng.fork("notes"));
  const RUMORS = [
    "O cobrador de impostos sumiu com o cofre da cidade.", "Há uma guilda de ladrões operando nos esgotos.",
    "Um culto se reúne à noite no cemitério velho.", "O nobre mais rico está doente, e os herdeiros já brigam.",
    "Mercadores estrangeiros trouxeram uma doença estranha.", "Um dragão foi visto voando sobre as colinas.",
    "A guarda da cidade aceita suborno de qualquer um.", "Alguém está comprando todo o ferro do mercado.",
  ];
  const kind = { village: "Aldeia", town: "Vila", city: "Cidade", capital: "Grande cidade" }[o.size];
  const notes = [
    name,
    "",
    `${kind} com cerca de ${pop.toLocaleString("pt-BR")} habitantes${walls ? `, cercada por muralhas com ${gates.length} portões` : ""}.${o.coast ? " Tem porto." : ""}${river ? " Um rio corta a cidade." : ""}`,
    "",
    ...[...counts.entries()].filter(([w]) => w !== "wild").map(([w, n]) => `• ${WARD_NAMES[w] ?? w}: ${n} bairro${n > 1 ? "s" : ""}`),
    "",
    "Rumores:",
    `• ${deck.draw("r", RUMORS)}`,
    `• ${deck.draw("r", RUMORS)}`,
  ].join("\n");

  return { name, half, patches, buildings, fields, trees, wall, wallClosed: wallChain.closed, coast, towers, gates, roads, river, bridges, piers, labels, notes };
}

function octagon(c: Pt, r: number): Pt[] {
  return Array.from({ length: 8 }, (_, i) => [c[0] + Math.cos((i / 8) * Math.PI * 2) * r, c[1] + Math.sin((i / 8) * Math.PI * 2) * r] as Pt);
}

function rectAt(c: Pt, w: number, h: number, ang: number): Pt[] {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(([x, y]) => [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos]);
}

function onEdgeAny(lot: Pt[], block: Pt[]) {
  return lot.some((q) => block.some((v, i) => {
    const w = block[(i + 1) % block.length];
    return Math.abs(dist(v, q) + dist(q, w) - dist(v, w)) < 0.5;
  }));
}

// ─── Desenho ─────────────────────────────────────────────────────────────────

interface CityPalette { paper: string; ink: string; building: string; special: string; water: string; waterLine: string; field: string; furrow: string; tree: string; treeLine: string; road: string; roadEdge: string; wall: string; text: string }

export const CITY_STYLES: Record<CityStyle, CityPalette & { label: string }> = {
  parchment: {
    label: "Pergaminho", paper: "#efe5cf", ink: "#3d3226", building: "#c4ae88", special: "#a38a63", water: "#a7bfc4", waterLine: "#6c8b92",
    field: "#e4d8b6", furrow: "#cdbd93", tree: "#a4b27f", treeLine: "#64703f", road: "#f4ecd9", roadEdge: "#cbb995", wall: "#3d3226", text: "#2f261c",
  },
  ink: {
    label: "Nanquim", paper: "#fbfaf6", ink: "#1e1e1e", building: "#ffffff", special: "#d9d9d9", water: "#d4e3ea", waterLine: "#7f9fae",
    field: "#f3f1ea", furrow: "#d2cec2", tree: "#e9eee3", treeLine: "#555", road: "#ffffff", roadEdge: "#b9b6ad", wall: "#1e1e1e", text: "#1e1e1e",
  },
  night: {
    label: "Noite", paper: "#1e2229", ink: "#0d0f13", building: "#46505e", special: "#5c6878", water: "#14324a", waterLine: "#2d5675",
    field: "#252a31", furrow: "#2f353e", tree: "#2c3a2f", treeLine: "#1a241c", road: "#2a2f37", roadEdge: "#15181d", wall: "#0b0c0f", text: "#e9d9b0",
  },
};

export function renderCity(c: City, style: CityStyle, cellPx: number, cols: number, rows: number): HTMLCanvasElement {
  const P = CITY_STYLES[style];
  const cv = document.createElement("canvas");
  cv.width = cols * cellPx;
  cv.height = rows * cellPx;
  const ctx = cv.getContext("2d")!;
  const s = cellPx / UNIT_PER_CELL;
  ctx.fillStyle = P.paper;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(s, 0, 0, s, (cols * UNIT_PER_CELL * s) / 2, (rows * UNIT_PER_CELL * s) / 2);
  const lw = (px: number) => Math.max(px / s, 0.3);
  const path = (poly: Pt[]) => {
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const line = (pts: Pt[]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };

  // água (mar) com contorno suavizado
  const waterPolys = c.patches.filter((p) => p.ward === "water").map((p) => p.poly);
  if (waterPolys.length) {
    const water = new Path2D();
    for (const poly of waterPolys) {
      water.moveTo(poly[0][0], poly[0][1]);
      for (const v of poly.slice(1)) water.lineTo(v[0], v[1]);
      water.closePath();
    }
    ctx.save();
    ctx.fillStyle = P.water;
    ctx.fill(water);
    ctx.clip(water);
    ctx.strokeStyle = P.waterLine;
    ctx.lineJoin = "round";
    for (const ch of c.coast) {
      const pts = chaikin(ch.pts, 2, ch.closed);
      for (let k2 = 1; k2 <= 4; k2++) {
        ctx.globalAlpha = k2 === 1 ? 0.9 : 0.45 / k2;
        ctx.lineWidth = k2 === 1 ? 2.5 : k2 * 7;
        line(pts);
        if (ch.closed) ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // campos
  for (const f of c.fields) {
    ctx.save();
    path(f.poly);
    ctx.fillStyle = P.field;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = P.furrow;
    ctx.lineWidth = lw(1);
    const cx = f.poly.reduce((a, v) => a + v[0], 0) / f.poly.length;
    const cy = f.poly.reduce((a, v) => a + v[1], 0) / f.poly.length;
    const r = 120;
    ctx.beginPath();
    for (let t = -r; t <= r; t += 4) {
      const dx = Math.cos(f.angle);
      const dy = Math.sin(f.angle);
      ctx.moveTo(cx + dx * -r - dy * t, cy + dy * -r + dx * t);
      ctx.lineTo(cx + dx * r - dy * t, cy + dy * r + dx * t);
    }
    ctx.stroke();
    ctx.restore();
  }

  // rio
  if (c.river) {
    const smooth = chaikin(c.river, 3, false);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    line(smooth);
    ctx.strokeStyle = P.waterLine;
    ctx.lineWidth = 16;
    ctx.stroke();
    line(smooth);
    ctx.strokeStyle = P.water;
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.restore();
  }

  // estradas
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const r of c.roads) {
    line(chaikin(r, 1, false));
    ctx.strokeStyle = P.roadEdge;
    ctx.lineWidth = 8;
    ctx.stroke();
  }
  for (const r of c.roads) {
    line(chaikin(r, 1, false));
    ctx.strokeStyle = P.road;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.restore();

  // pontes e píeres
  ctx.save();
  ctx.fillStyle = P.building;
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = lw(1);
  for (const b of c.bridges) {
    path(rectAt(b.p, 26, 7, b.angle));
    ctx.fill();
    ctx.stroke();
  }
  for (const pier of c.piers) {
    path(pier);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // árvores
  ctx.save();
  ctx.lineWidth = lw(0.8);
  for (const t of c.trees) {
    ctx.beginPath();
    ctx.arc(t.p[0], t.p[1], t.r, 0, Math.PI * 2);
    ctx.fillStyle = P.tree;
    ctx.fill();
    ctx.strokeStyle = P.treeLine;
    ctx.stroke();
  }
  ctx.restore();

  // construções
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = P.ink;
  for (const b of c.buildings) {
    path(b.poly);
    if (b.outline) {
      ctx.save();
      ctx.strokeStyle = P.wall;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.fillStyle = P.wall;
      for (const v of b.poly) {
        ctx.beginPath();
        ctx.arc(v[0], v[1], 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      continue;
    }
    ctx.fillStyle = b.special ? P.special : P.building;
    ctx.lineWidth = lw(b.special ? 1.4 : 0.9);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // muralha
  if (c.wall) {
    ctx.save();
    ctx.strokeStyle = P.wall;
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    ctx.lineWidth = 5;
    const n = c.wall.length;
    for (let i = 0; i < (c.wallClosed ? n : n - 1); i++) {
      let a = c.wall[i];
      let b = c.wall[(i + 1) % n];
      // abre espaço nos portões
      const g = 9;
      if (c.gates.includes(a)) a = [a[0] + ((b[0] - a[0]) / dist(a, b)) * g, a[1] + ((b[1] - a[1]) / dist(a, b)) * g];
      if (c.gates.includes(b)) b = [b[0] + ((a[0] - b[0]) / dist(a, b)) * g, b[1] + ((a[1] - b[1]) / dist(a, b)) * g];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      if (c.gates.includes(c.wall[i])) {
        ctx.fillStyle = P.wall;
        ctx.beginPath();
        ctx.arc(a[0], a[1], 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (c.gates.includes(c.wall[(i + 1) % n])) {
        ctx.fillStyle = P.wall;
        ctx.beginPath();
        ctx.arc(b[0], b[1], 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = P.wall;
    for (const t of c.towers) {
      ctx.beginPath();
      ctx.arc(t[0], t[1], 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // rótulos
  ctx.save();
  ctx.fillStyle = P.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic 600 ${11}px "Palatino Linotype", Georgia, serif`;
  for (const l of c.labels) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = P.paper;
    ctx.strokeText(l.text, l.p[0], l.p[1]);
    ctx.fillText(l.text, l.p[0], l.p[1]);
  }
  ctx.restore();

  // título
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  const fs = Math.round(cv.width * 0.045);
  ctx.font = `700 ${fs}px "Palatino Linotype", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const title = c.name.toUpperCase().split("").join(String.fromCharCode(8202));
  ctx.lineWidth = fs * 0.18;
  ctx.strokeStyle = P.paper;
  ctx.strokeText(title, cv.width / 2, fs * 0.6);
  ctx.fillStyle = P.text;
  ctx.fillText(title, cv.width / 2, fs * 0.6);
  ctx.restore();
  drawCompass(ctx, cv.width - cv.width * 0.07, cv.height - cv.width * 0.07, cv.width * 0.035, P.text, P.paper);
  return cv;
}

export function drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, paper: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.strokeStyle = ink;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.22, 0);
    ctx.lineTo(-r * 0.22, 0);
    ctx.closePath();
    ctx.fillStyle = i === 3 ? ink : paper;
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = ink;
  ctx.font = `700 ${r * 0.5}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("N", 0, -r * 1.02);
  ctx.restore();
}

export function buildCity(o: CityOpts): Built {
  const c = generateCity(o);
  const cols = Math.ceil((c.half * 2) / UNIT_PER_CELL);
  const rows = cols;
  // mundo interligado: castelo, catedral e mercado (esgotos) abrem masmorras
  const links: Built["links"] = [];
  const below = (ward: Ward, theme: Theme, bare: string, g: Title["g"], size: string) => {
    const p = c.patches.find((q) => q.inner && q.ward === ward);
    if (!p) return;
    const [x, y] = polyCentroid(p.poly);
    links.push({
      x: x / UNIT_PER_CELL + cols / 2, y: y / UNIT_PER_CELL + rows / 2,
      link: { kind: "dungeon", seed: `${o.seed}:${theme}`, label: bare, params: { theme, size, title: { title: bare, bare, g } } },
    });
  };
  below("castle", "fortaleza", `Masmorras do Castelo de ${c.name}`, "fp", "medium");
  below("temple", "cripta", `Catacumbas da Catedral de ${c.name}`, "fp", "medium");
  if (o.size === "city" || o.size === "capital") below("market", "esgoto", `Esgotos de ${c.name}`, "mp", "large");
  return {
    links,
    title: c.name,
    notes: c.notes,
    cols,
    rows,
    grid: false,
    bg: CITY_STYLES[o.style].paper,
    scale: { value: UNIT_PER_CELL, unit: "m" },
    render: (cell) => renderCity(c, o.style, cell, cols, rows),
  };
}
