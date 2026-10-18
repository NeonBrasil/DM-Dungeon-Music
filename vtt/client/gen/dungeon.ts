// Gerador de masmorra (inspirado no One Page Dungeon do Watabou): salas crescem a partir
// da entrada, ligadas por corredores ou portas; depois entram laços, portas especiais,
// objetos, textos das salas e o gancho da aventura.
import { Rng } from "./rng.ts";
import { waterBlob } from "./ink.ts";
import { Deck, dungeonHook, dungeonTitle, roomText, type Theme, type Title } from "./names.ts";

export type DoorType = "door" | "open" | "locked" | "secret" | "portcullis";
export type PropKind =
  | "column" | "statue" | "altar" | "fountain" | "well" | "sarcophagus" | "chest" | "barrel" | "crate"
  | "table" | "bed" | "throne" | "rubble" | "bones" | "stairsDown" | "stairsUp" | "pit" | "brazier" | "shelf" | "cage" | "circle";

/** Objeto decorativo: centro (x, y) e tamanho (w, h) em células. */
export interface Prop { kind: PropKind; x: number; y: number; w: number; h: number; vertical?: boolean }

export interface Area {
  id: number;
  kind: "room" | "corridor";
  x: number; y: number; w: number; h: number;
  cells: [number, number][];
  round: boolean;
  num: number;
  name: string;
  text: string;
  trap: boolean;
  props: Prop[];
  water: [number, number][][];
  depth: number;
}

/** Porta numa aresta: horiz = borda de cima da célula (x, y); senão borda esquerda. */
export interface Door { x: number; y: number; horiz: boolean; type: DoorType; a: number; b: number }

export interface Dungeon {
  title: string;
  hook: string;
  theme: Theme;
  cols: number;
  rows: number;
  areas: Area[];
  doors: Door[];
  cellArea: Int32Array; // -1 vazio, -2 maciço (cantos de sala redonda), senão id da área
  entrance: number;
}

export type DungeonSize = "small" | "medium" | "large" | "huge";
export interface DungeonParams { seed: string; size: DungeonSize; theme: Theme; title?: Title }

const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const MARGIN = 2;

interface Tmp { id: number; kind: "room" | "corridor"; x: number; y: number; w: number; h: number; cells: [number, number][]; round: boolean; links: number }
interface RawDoor { ax: number; ay: number; bx: number; by: number; a: number; b: number; type: DoorType }

function rectCells(x: number, y: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
}

function roundCells(x: number, y: number, w: number): [number, number][] {
  const r = w / 2 - 0.15;
  const c = w / 2;
  return rectCells(x, y, w, w).filter(([cx, cy]) => Math.hypot(cx - x + 0.5 - c, cy - y + 0.5 - c) <= r);
}

export function generateDungeon(p: DungeonParams): Dungeon {
  const L = new Rng(`${p.seed}:layout:${p.size}`);
  const [tMin, tMax] = { small: [6, 8], medium: [10, 13], large: [16, 20], huge: [24, 30] }[p.size];
  const maxExtent = { small: 26, medium: 36, large: 48, huge: 62 }[p.size];
  const target = L.int(tMin, tMax);

  const areas: Tmp[] = [];
  const occ = new Map<number, number>();
  const key = (x: number, y: number) => (x + 2000) * 5000 + (y + 2000);
  const doors: RawDoor[] = [];
  let minX = 0, maxX = 0, minY = 0, maxY = 0;

  const fits = (x0: number, y0: number, x1: number, y1: number) =>
    Math.max(maxX, x1) - Math.min(minX, x0) < maxExtent && Math.max(maxY, y1) - Math.min(minY, y0) < maxExtent;

  const freeRect = (x: number, y: number, w: number, h: number, m: number, ignore: number[] = []) => {
    for (let j = y - m; j < y + h + m; j++) {
      for (let i = x - m; i < x + w + m; i++) {
        const a = occ.get(key(i, j));
        if (a !== undefined && !ignore.includes(a)) return false;
      }
    }
    return true;
  };

  const addArea = (kind: Tmp["kind"], cells: [number, number][], round: boolean, box?: { x: number; y: number; w: number; h: number }) => {
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const b = box ?? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
    const id = areas.length;
    areas.push({ id, kind, ...b, cells, round, links: 0 });
    const occCells = round ? rectCells(b.x, b.y, b.w, b.h) : cells;
    for (const [x, y] of occCells) occ.set(key(x, y), id);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w - 1);
    maxY = Math.max(maxY, b.y + b.h - 1);
    return id;
  };

  const roomSize = (): [number, number, boolean] => {
    const t = L.weighted([["s", 5], ["m", 4], ["l", 1.3], ["r", 0.9]] as const);
    if (t === "r") {
      const w = L.pick([5, 5, 7]);
      return [w, w, true];
    }
    if (t === "s") return [L.int(3, 4), L.int(3, 4), false];
    if (t === "m") return [L.int(4, 6), L.int(4, 7), false];
    const a = L.int(7, 9);
    const b = L.int(7, 11);
    return L.chance(0.5) ? [a, b, false] : [b, a, false];
  };

  /** Retângulo da sala além da célula (ex, ey) na direção (dx, dy), com a porta fora dos cantos. */
  const placeBeyond = (ex: number, ey: number, dx: number, dy: number, w: number, h: number, round: boolean) => {
    const along = dx !== 0 ? h : w;
    const off = round ? (along - 1) / 2 : along >= 3 ? L.int(1, along - 2) : L.int(0, along - 1);
    if (dy === -1) return { x: ex - off, y: ey - h, w, h };
    if (dy === 1) return { x: ex - off, y: ey + 1, w, h };
    if (dx === 1) return { x: ex + 1, y: ey - off, w, h };
    return { x: ex - w, y: ey - off, w, h };
  };

  const pickDoorType = (loop: boolean, corridorRoom: boolean): DoorType => {
    if (loop) return L.weighted([["secret", 40], ["door", 35], ["open", 25]] as const);
    if (corridorRoom) return L.weighted([["open", 40], ["door", 42], ["locked", 8], ["portcullis", 6], ["secret", 4]] as const);
    return L.weighted([["door", 52], ["open", 26], ["locked", 9], ["portcullis", 6], ["secret", 4]] as const);
  };

  // Entrada
  const ew = L.int(3, 5);
  const eh = L.int(3, 5);
  addArea("room", rectCells(-Math.floor(ew / 2), -Math.floor(eh / 2), ew, eh), false);
  let rooms = 1;

  for (let tries = 0; rooms < target && tries < 4000; tries++) {
    const src = L.weighted(areas.map((a) => [a, (a.kind === "room" ? 3 : 1.2) / (1 + a.links)] as const));
    const [dx, dy] = L.pick(DIRS);
    let ix: number;
    let iy: number;
    if (src.kind === "room") {
      if (src.round) {
        ix = dx === 0 ? src.x + (src.w - 1) / 2 : dx > 0 ? src.x + src.w - 1 : src.x;
        iy = dy === 0 ? src.y + (src.h - 1) / 2 : dy > 0 ? src.y + src.h - 1 : src.y;
      } else if (dx !== 0) {
        const pad = src.h > 2 ? 1 : 0;
        iy = L.int(src.y + pad, src.y + src.h - 1 - pad);
        ix = dx > 0 ? src.x + src.w - 1 : src.x;
      } else {
        const pad = src.w > 2 ? 1 : 0;
        ix = L.int(src.x + pad, src.x + src.w - 1 - pad);
        iy = dy > 0 ? src.y + src.h - 1 : src.y;
      }
    } else {
      [ix, iy] = L.pick(src.cells);
    }
    const ox = ix + dx;
    const oy = iy + dy;
    if (occ.has(key(ox, oy))) continue;
    const [rw, rh, round] = roomSize();
    const useCorridor = src.kind === "room" ? L.chance(0.62) : L.chance(0.35);

    if (useCorridor) {
      const path: [number, number][] = [];
      let cx = ox;
      let cy = oy;
      let ddx = dx;
      let ddy = dy;
      const len1 = L.int(2, 6);
      for (let i = 0; i < len1; i++) {
        path.push([cx, cy]);
        cx += ddx;
        cy += ddy;
      }
      if (L.chance(0.35)) {
        [ddx, ddy] = L.chance(0.5) ? [-ddy, ddx] : [ddy, -ddx];
        let [lx, ly] = path[path.length - 1];
        const len2 = L.int(2, 5);
        for (let j = 0; j < len2; j++) {
          lx += ddx;
          ly += ddy;
          path.push([lx, ly]);
        }
      }
      const [ex, ey] = path[path.length - 1];
      const room = placeBeyond(ex, ey, ddx, ddy, rw, rh, round);
      if (!fits(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1)) continue;
      if (!freeRect(room.x, room.y, room.w, room.h, 0)) continue;
      let ok = true;
      for (let i = 0; i < path.length && ok; i++) {
        const [px, py] = path[i];
        if (!freeRect(px, py, 1, 1, 1, [src.id])) ok = false;
        if (i < path.length - 1 && px >= room.x - 1 && px <= room.x + room.w && py >= room.y - 1 && py <= room.y + room.h) ok = false;
        if (px >= room.x && px < room.x + room.w && py >= room.y && py < room.y + room.h) ok = false;
      }
      if (!ok || !fits(Math.min(...path.map((q) => q[0])), Math.min(...path.map((q) => q[1])), Math.max(...path.map((q) => q[0])), Math.max(...path.map((q) => q[1])))) continue;
      const cid = addArea("corridor", path, false);
      const rid = addArea("room", round ? roundCells(room.x, room.y, room.w) : rectCells(room.x, room.y, room.w, room.h), round, room);
      doors.push({ ax: ix, ay: iy, bx: ox, by: oy, a: src.id, b: cid, type: pickDoorType(false, true) });
      doors.push({ ax: ex, ay: ey, bx: ex + ddx, by: ey + ddy, a: cid, b: rid, type: pickDoorType(false, true) });
      src.links++;
      areas[cid].links += 2;
      areas[rid].links++;
    } else {
      const room = placeBeyond(ix, iy, dx, dy, rw, rh, round);
      if (!fits(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1)) continue;
      if (!freeRect(room.x, room.y, room.w, room.h, 0)) continue;
      // a sala nova não pode encostar em corredores alheios (fica feio), só em salas
      let touchesCorridor = false;
      for (let j = room.y - 1; j <= room.y + room.h && !touchesCorridor; j++) {
        for (let i = room.x - 1; i <= room.x + room.w; i++) {
          const a = occ.get(key(i, j));
          if (a !== undefined && a !== src.id && areas[a].kind === "corridor") {
            touchesCorridor = true;
            break;
          }
        }
      }
      if (touchesCorridor) continue;
      const rid = addArea("room", round ? roundCells(room.x, room.y, room.w) : rectCells(room.x, room.y, room.w, room.h), round, room);
      doors.push({ ax: ix, ay: iy, bx: ox, by: oy, a: src.id, b: rid, type: pickDoorType(false, false) });
      src.links++;
      areas[rid].links++;
    }
    rooms++;
  }

  // ─── Normalização para a grade final ─────────────────────────────────────
  const offX = -minX + MARGIN;
  const offY = -minY + MARGIN;
  const cols = maxX - minX + 1 + MARGIN * 2;
  const rows = maxY - minY + 1 + MARGIN * 2;
  for (const a of areas) {
    a.x += offX;
    a.y += offY;
    a.cells = a.cells.map(([x, y]) => [x + offX, y + offY]);
  }
  for (const d of doors) {
    d.ax += offX; d.bx += offX;
    d.ay += offY; d.by += offY;
  }
  const cellArea = new Int32Array(cols * rows).fill(-1);
  for (const a of areas) {
    if (a.round) for (const [x, y] of rectCells(a.x, a.y, a.w, a.h)) cellArea[y * cols + x] = -2;
    for (const [x, y] of a.cells) cellArea[y * cols + x] = a.id;
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? -1 : cellArea[y * cols + x]);

  // ─── Laços: portas extras entre áreas que se encostam ────────────────────
  const hasDoor = new Set(doors.map((d) => (d.a < d.b ? `${d.a}:${d.b}` : `${d.b}:${d.a}`)));
  const cands = new Map<string, [number, number, number, number][]>();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = at(x, y);
      if (a < 0) continue;
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]] as [number, number][]) {
        const b = at(nx, ny);
        if (b < 0 || b === a) continue;
        if (areas[a].round || areas[b].round) continue;
        if (areas[a].kind === "corridor" && areas[b].kind === "corridor") continue;
        const k = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (hasDoor.has(k)) continue;
        (cands.get(k) ?? cands.set(k, []).get(k)!).push([x, y, nx, ny]);
      }
    }
  }
  for (const [k, list] of cands) {
    const [a, b] = k.split(":").map(Number);
    const bothRooms = areas[a].kind === "room" && areas[b].kind === "room";
    if (!L.chance(bothRooms ? 0.35 : 0.12) || list.length < 2) continue;
    const inner = list.length > 2 ? list.slice(1, -1) : list;
    const [ax, ay, bx, by] = L.pick(inner);
    doors.push({ ax, ay, bx, by, a, b, type: pickDoorType(true, false) });
  }

  // ─── Profundidade (BFS a partir da entrada) ──────────────────────────────
  const depth = new Array(areas.length).fill(Infinity);
  depth[0] = 0;
  const q = [0];
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    for (const d of doors) {
      const other = d.a === cur ? d.b : d.b === cur ? d.a : -1;
      if (other >= 0 && depth[other] === Infinity) {
        depth[other] = depth[cur] + (areas[other].kind === "room" ? 1 : 0);
        q.push(other);
      }
    }
  }
  // entrada nunca começa com porta secreta
  for (const d of doors) if ((d.a === 0 || d.b === 0) && d.type === "secret") d.type = "door";

  // ─── Conteúdo ─────────────────────────────────────────────────────────────
  const C = new Rng(`${p.seed}:content:${p.theme}`);
  const rolled = dungeonTitle(C, p.theme);
  const t = p.title ?? rolled; // nome vindo do mapa da região/cidade
  const title = t.title;
  const { hook, boss } = dungeonHook(C, p.theme, t);
  const deck = new Deck(C.fork("deck"));
  const roomList = areas.filter((a) => a.kind === "room");
  const bossRoom = [...roomList].sort((a, b) => depth[b.id] - depth[a.id] || b.w * b.h - a.w * a.h)[0];
  roomList.sort((a, b) => depth[a.id] - depth[b.id] || a.id - b.id);
  const nums = new Map(roomList.map((r, i) => [r.id, i + 1]));

  const doorCells = new Set<number>();
  for (const d of doors) {
    doorCells.add(d.ay * cols + d.ax);
    doorCells.add(d.by * cols + d.bx);
  }

  const out: Area[] = areas.map((a) => {
    const isRoom = a.kind === "room";
    const t = isRoom
      ? roomText(deck, C, p.theme, { entrance: a.id === 0, boss: a.id === bossRoom.id && a.id !== 0 ? boss : null, area: a.w * a.h })
      : { name: "", text: "", trap: false };
    const area: Area = {
      id: a.id, kind: a.kind, x: a.x, y: a.y, w: a.w, h: a.h, cells: a.cells, round: a.round,
      num: nums.get(a.id) ?? 0, name: t.name, text: t.text, trap: t.trap, props: [], water: [], depth: depth[a.id],
    };
    furnish(C, p.theme, area, {
      entrance: a.id === 0,
      boss: a.id === bossRoom.id && a.id !== 0,
      treasure: /Tesouro/.test(t.text),
      blocked: (x, y) => doorCells.has(y * cols + x),
    });
    return area;
  });

  const finalDoors: Door[] = doors.map((d) => {
    if (d.bx === d.ax) return { x: d.ax, y: Math.max(d.ay, d.by), horiz: true, type: d.type, a: d.a, b: d.b };
    return { x: Math.max(d.ax, d.bx), y: d.ay, horiz: false, type: d.type, a: d.a, b: d.b };
  });

  return { title, hook, theme: p.theme, cols, rows, areas: out, doors: finalDoors, cellArea, entrance: 0 };
}

// ─── Mobília por tema ───────────────────────────────────────────────────────

const COLUMN_CHANCE: Record<Theme, number> = {
  cripta: 0.5, templo: 0.75, prisao: 0.2, covil: 0.15, esgoto: 0.35, mina: 0.2, fortaleza: 0.45, arcano: 0.3,
};

function furnish(
  rng: Rng, theme: Theme, a: Area,
  f: { entrance: boolean; boss: boolean; treasure: boolean; blocked: (x: number, y: number) => boolean },
) {
  const P = (kind: PropKind, x: number, y: number, w = 1, h = 1, vertical?: boolean) => a.props.push({ kind, x, y, w, h, vertical });
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const free = (x: number, y: number) => !f.blocked(Math.floor(x), Math.floor(y));

  if (a.kind === "corridor") {
    if (rng.chance(0.12)) {
      const [x, y] = rng.pick(a.cells);
      P(rng.chance(0.5) ? "rubble" : "bones", x + 0.5, y + 0.5);
    }
    if (theme === "esgoto" && a.cells.length >= 4 && rng.chance(0.3)) {
      const [x, y] = a.cells[Math.floor(a.cells.length / 2)];
      a.water.push(waterBlob(rng, x + 0.5, y + 0.5, 0.45, 0.45));
    }
    return;
  }

  const vertical = a.h > a.w;
  const big = !a.round && a.w >= 5 && a.h >= 5;

  if (a.round) {
    if (rng.chance(0.6)) {
      const n = a.w >= 7 ? 8 : 6;
      const r = a.w / 2 - 1;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + Math.PI / n;
        P("column", cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0.5, 0.5);
      }
    }
    const center: PropKind = theme === "templo" ? rng.pick(["fountain", "altar", "statue"] as const)
      : theme === "arcano" ? "circle" : theme === "cripta" ? rng.pick(["statue", "sarcophagus"] as const)
      : rng.pick(["well", "statue", "pit", "fountain"] as const);
    if (center === "circle") P("circle", cx, cy, a.w - 2.4, a.w - 2.4);
    else if (center === "fountain") P("fountain", cx, cy, 1.6, 1.6);
    else if (center === "sarcophagus") P("sarcophagus", cx, cy, 0.8, 1.7, true);
    else P(center, cx, cy, 1, 1);
    return;
  }

  if (f.entrance) {
    // escada de subida encostada numa parede sem porta
    const sides = rng.shuffle([0, 1, 2, 3]);
    for (const s of sides) {
      const sx = s === 1 ? a.x + a.w - 1 : s === 3 ? a.x : a.x + Math.floor(a.w / 2);
      const sy = s === 2 ? a.y + a.h - 1 : s === 0 ? a.y : a.y + Math.floor(a.h / 2);
      if (!free(sx, sy)) continue;
      P("stairsUp", sx + 0.5, sy + 0.5, 1, 1, s === 1 || s === 3);
      break;
    }
  }

  if (big && rng.chance(COLUMN_CHANCE[theme])) {
    const along = vertical ? a.h : a.w;
    const n = Math.max(2, Math.ceil((along - 1) / 2));
    const step = (along - 3) / (n - 1);
    for (let i = 0; i < n; i++) {
      const t = 1.5 + i * step;
      if (vertical) {
        P("column", a.x + 1.5, a.y + t, 0.5, 0.5);
        P("column", a.x + a.w - 1.5, a.y + t, 0.5, 0.5);
      } else {
        P("column", a.x + t, a.y + 1.5, 0.5, 0.5);
        P("column", a.x + t, a.y + a.h - 1.5, 0.5, 0.5);
      }
    }
  }

  const area = a.w * a.h;
  if (f.boss) {
    if (theme === "fortaleza" || theme === "covil" || theme === "prisao") {
      if (vertical) P("throne", cx, a.y + 0.75, 0.9, 0.8);
      else P("throne", a.x + 0.75, cy, 0.8, 0.9);
    } else if (theme === "arcano" || theme === "templo") {
      P("circle", cx, cy, Math.min(a.w, a.h) - 2, Math.min(a.w, a.h) - 2);
    } else if (theme === "esgoto") {
      a.water.push(waterBlob(rng, cx, cy, a.w * 0.34, a.h * 0.34));
    } else if (theme === "mina") {
      P("pit", cx, cy, 1.4, 1.4);
      for (let i = 0; i < 3; i++) P("rubble", rng.float(a.x + 0.8, a.x + a.w - 0.8), rng.float(a.y + 0.8, a.y + a.h - 0.8));
    } else {
      P("sarcophagus", cx, cy, vertical ? 1 : 2, vertical ? 2 : 1, vertical);
    }
    if (rng.chance(0.6)) {
      const sx = a.x + a.w - 1;
      const sy = a.y + a.h - 1;
      if (free(sx, sy)) P("stairsDown", sx + 0.5, sy + 0.5, 1, 1);
    }
  } else if (area >= 12 && rng.chance(0.55)) {
    switch (theme) {
      case "cripta": {
        const n = Math.min(4, Math.floor((vertical ? a.w : a.h) / 2));
        if (n >= 2 && big) {
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            if (vertical) P("sarcophagus", a.x + 1 + t * (a.w - 2), cy, 0.7, 1.6, true);
            else P("sarcophagus", cx, a.y + 1 + t * (a.h - 2), 1.6, 0.7, false);
          }
        } else P("sarcophagus", cx, cy, vertical ? 0.8 : 1.7, vertical ? 1.7 : 0.8, vertical);
        break;
      }
      case "templo":
        if (vertical) {
          P("altar", cx, a.y + 1.1, 1.4, 0.7);
          P("brazier", cx - 1.2, a.y + 1.1);
          P("brazier", cx + 1.2, a.y + 1.1);
        } else {
          P("altar", a.x + 1.1, cy, 0.7, 1.4);
          P("brazier", a.x + 1.1, cy - 1.2);
          P("brazier", a.x + 1.1, cy + 1.2);
        }
        break;
      case "prisao": {
        const n = Math.min(4, Math.floor(a.w / 1.5));
        for (let i = 0; i < n; i++) P("cage", a.x + 1 + i * 1.5, a.y + 0.6, 0.9, 0.9);
        break;
      }
      case "covil":
        for (let i = 0; i < 4; i++) P(rng.chance(0.5) ? "bones" : "rubble", rng.float(a.x + 0.8, a.x + a.w - 0.8), rng.float(a.y + 0.8, a.y + a.h - 0.8));
        if (rng.chance(0.4)) P("pit", cx, cy, 1.2, 1.2);
        break;
      case "esgoto":
        if (vertical) a.water.push([[a.x, cy - 0.7], [a.x + a.w, cy - 0.7], [a.x + a.w, cy + 0.7], [a.x, cy + 0.7]]);
        else a.water.push([[cx - 0.7, a.y], [cx + 0.7, a.y], [cx + 0.7, a.y + a.h], [cx - 0.7, a.y + a.h]]);
        break;
      case "mina":
        for (let i = 0; i < 3; i++) P("rubble", rng.float(a.x + 0.8, a.x + a.w - 0.8), rng.float(a.y + 0.8, a.y + a.h - 0.8));
        P("crate", a.x + 0.6, a.y + 0.6, 0.6, 0.6);
        if (rng.chance(0.4)) P("pit", cx, cy, 1.1, 1.1);
        break;
      case "fortaleza":
        if (rng.chance(0.5)) {
          if (vertical) P("table", cx, cy, 1, a.h - 3, true);
          else P("table", cx, cy, a.w - 3, 1);
        } else {
          const n = Math.min(4, Math.floor(a.w / 1.5));
          for (let i = 0; i < n; i++) P("bed", a.x + 0.9 + i * 1.5, a.y + 1, 0.8, 1.5, true);
        }
        break;
      case "arcano":
        if (vertical) {
          P("shelf", a.x + 0.3, cy, 0.5, a.h - 2, true);
          P("shelf", a.x + a.w - 0.3, cy, 0.5, a.h - 2, true);
        } else {
          P("shelf", cx, a.y + 0.3, a.w - 2, 0.5);
          P("shelf", cx, a.y + a.h - 0.3, a.w - 2, 0.5);
        }
        P(rng.chance(0.5) ? "circle" : "table", cx, cy, 1.8, 1.8);
        break;
    }
  } else if (theme === "esgoto" && rng.chance(0.4)) {
    a.water.push(waterBlob(rng, cx, cy, a.w * 0.32, a.h * 0.32));
  } else if (rng.chance(0.18)) {
    P(rng.pick(["statue", "well", "pit"] as const), cx, cy);
  }

  if (rng.chance(0.25) && area >= 9) {
    const corner: [number, number] = rng.pick([[a.x + 0.5, a.y + 0.5], [a.x + a.w - 0.5, a.y + 0.5], [a.x + 0.5, a.y + a.h - 0.5], [a.x + a.w - 0.5, a.y + a.h - 0.5]]);
    if (free(corner[0], corner[1])) {
      P("barrel", corner[0], corner[1], 0.45, 0.45);
      P(rng.chance(0.5) ? "barrel" : "crate", corner[0] + (corner[0] < cx ? 0.5 : -0.5), corner[1], 0.45, 0.45);
    }
  }
  if (f.treasure) {
    const x = a.x + a.w - 1.5;
    const y = a.y + 0.5;
    if (free(x, y)) P("chest", x + 0.5, y, 0.6, 0.45);
    else P("chest", cx, a.y + a.h - 0.6, 0.6, 0.45);
  }
}
