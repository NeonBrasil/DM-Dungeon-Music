// Geometria 2D usada pelos geradores.

export type Pt = [number, number];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Área com sinal (positiva = anti-horária em eixo y para cima). */
export function area(poly: Pt[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return s / 2;
}

export function centroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Garante orientação horária na tela (área positiva com y para baixo). */
export function orient(poly: Pt[]): Pt[] {
  return area(poly) < 0 ? [...poly].reverse() : poly;
}

/**
 * Encolhe um polígono convexo. `d` pode ser um número ou uma distância por aresta
 * (aresta i = poly[i] → poly[i+1]). Retorna null se o polígono sumir.
 */
export function insetConvex(poly: Pt[], d: number | number[]): Pt[] | null {
  const p = orient(poly);
  const n = p.length;
  if (n < 3) return null;
  // Interseção dos semiplanos deslocados: arestas curtas que "somem" saem naturalmente.
  let cur = p;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const len = dist(a, b);
    if (len < 1e-9) continue;
    // com área positiva em y-para-baixo, o interior fica à direita de (b - a) → normal (-dy, dx)
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const di = typeof d === "number" ? d : d[i];
    cur = splitConvex(cur, [a[0] + nx * di, a[1] + ny * di], [b[0] - a[0], b[1] - a[1]])[1];
    if (cur.length < 3) return null;
  }
  return area(cur) > 1e-6 ? cur : null;
}

/** Corta um polígono convexo pela reta (p, dir). */
export function splitConvex(poly: Pt[], p: Pt, dir: Pt): [Pt[], Pt[]] {
  const side = (q: Pt) => (q[0] - p[0]) * dir[1] - (q[1] - p[1]) * dir[0];
  const a: Pt[] = [];
  const b: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % n];
    const sc = side(cur);
    const sn = side(nxt);
    if (sc >= 0) a.push(cur);
    if (sc <= 0) b.push(cur);
    if ((sc > 0 && sn < 0) || (sc < 0 && sn > 0)) {
      const t = sc / (sc - sn);
      const q: Pt = [cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t];
      a.push(q);
      b.push(q);
    }
  }
  return [a, b];
}

/** Suavização de Chaikin. */
export function chaikin(pts: Pt[], iterations = 2, closed = true): Pt[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const out: Pt[] = [];
    const n = cur.length;
    const last = closed ? n : n - 1;
    if (!closed) out.push(cur[0]);
    for (let i = 0; i < last; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % n];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (!closed) out.push(cur[n - 1]);
    cur = out;
  }
  return cur;
}

/**
 * Marching squares: contornos de `field` (w × h amostras) no nível `level`.
 * Retorna polilinhas em coordenadas de amostra; fechadas quando a borda do campo está abaixo do nível.
 */
export function marchingSquares(field: Float32Array, w: number, h: number, level: number): Pt[][] {
  const v = (x: number, y: number) => field[y * w + x];
  // Cada segmento liga duas arestas da célula; arestas identificadas por chave numérica.
  const hKey = (x: number, y: number) => (y * w + x) * 2;     // aresta horizontal (x,y)-(x+1,y)
  const vKey = (x: number, y: number) => (y * w + x) * 2 + 1; // aresta vertical (x,y)-(x,y+1)
  const pts = new Map<number, Pt>();
  const edgePt = (key: number): Pt => {
    let p = pts.get(key);
    if (p) return p;
    const idx = key >> 1;
    const x = idx % w;
    const y = Math.floor(idx / w);
    if (key & 1) {
      const a = v(x, y);
      const b = v(x, y + 1);
      p = [x, y + (level - a) / (b - a)];
    } else {
      const a = v(x, y);
      const b = v(x + 1, y);
      p = [x + (level - a) / (b - a), y];
    }
    pts.set(key, p);
    return p;
  };
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = v(x, y) > level ? 8 : 0;
      const tr = v(x + 1, y) > level ? 4 : 0;
      const br = v(x + 1, y + 1) > level ? 2 : 0;
      const bl = v(x, y + 1) > level ? 1 : 0;
      const c = tl | tr | br | bl;
      if (c === 0 || c === 15) continue;
      const top = hKey(x, y);
      const bottom = hKey(x, y + 1);
      const left = vKey(x, y);
      const right = vKey(x + 1, y);
      const center = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 > level;
      switch (c) {
        case 1: case 14: link(left, bottom); break;
        case 2: case 13: link(bottom, right); break;
        case 3: case 12: link(left, right); break;
        case 4: case 11: link(top, right); break;
        case 6: case 9: link(top, bottom); break;
        case 7: case 8: link(left, top); break;
        case 5:
          if (center) { link(left, top); link(bottom, right); } else { link(left, bottom); link(top, right); }
          break;
        case 10:
          if (center) { link(left, bottom); link(top, right); } else { link(left, top); link(bottom, right); }
          break;
      }
    }
  }
  const used = new Set<string>();
  const ek = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const lines: Pt[][] = [];
  // Começa pelas pontas (grau 1) para polilinhas abertas, depois laços fechados.
  const starts = [...links.keys()].sort((a, b) => (links.get(a)!.length === 1 ? -1 : 0) - (links.get(b)!.length === 1 ? -1 : 0));
  for (const s of starts) {
    for (const first of links.get(s)!) {
      if (used.has(ek(s, first))) continue;
      const chain: number[] = [s];
      let prev = s;
      let cur = first;
      used.add(ek(s, first));
      while (true) {
        chain.push(cur);
        const next = links.get(cur)!.find((n) => n !== prev && !used.has(ek(cur, n)));
        if (next === undefined) break;
        used.add(ek(cur, next));
        prev = cur;
        cur = next;
        if (cur === s) break;
      }
      lines.push(chain.map(edgePt));
    }
  }
  return lines;
}

/** Desenha polilinhas fechadas como um único caminho (evenodd mantém buracos). */
export function tracePolys(ctx: CanvasRenderingContext2D, polys: Pt[][], scale: number, ox = 0, oy = 0) {
  for (const poly of polys) {
    if (poly.length < 2) continue;
    ctx.moveTo(poly[0][0] * scale + ox, poly[0][1] * scale + oy);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * scale + ox, poly[i][1] * scale + oy);
    ctx.closePath();
  }
}

/** Caixa de desfoque separável sobre um campo (bordas clampadas). */
export function blurField(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = s / (2 * r + 1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = s / (2 * r + 1);
    }
  }
  return out;
}

/** Ramer–Douglas–Peucker para polilinhas (fechada = repete o primeiro ponto no fim). */
export function simplifyLine(pts: Pt[], tol: number, closed = true): Pt[] {
  const line = closed ? [...pts, pts[0]] : pts;
  if (line.length <= 3) return pts;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = distToSeg(line[i], line[a], line[b]);
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out = line.filter((_, i) => keep[i]);
  if (closed) out.pop();
  return out;
}
