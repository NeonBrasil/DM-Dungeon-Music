// Edição manual de uma masmorra gerada: mover, redimensionar, criar e excluir salas, e portas de vários tipos.
// Cada operação devolve uma cópia nova (ou null se não cabe); ids das áreas continuam iguais aos índices.
import type { Door, DoorType, Dungeon } from "./dungeon.ts";

export interface Box { x: number; y: number; w: number; h: number }
export interface Edge { x: number; y: number; horiz: boolean }

/** Tipos de porta do editor; as cores são as mesmas das portas na mesa. */
export const DOOR_TYPES: { id: DoorType; label: string; color: string }[] = [
  { id: "open", label: "Passagem (arco)", color: "#9aa0a6" },
  { id: "ajar", label: "Aberta", color: "#3dd68c" },
  { id: "door", label: "Fechada", color: "#e0902f" },
  { id: "locked", label: "Trancada", color: "#e5484d" },
  { id: "magic", label: "Selada por magia", color: "#a855f7" },
  { id: "puzzle", label: "Enigma", color: "#ec4899" },
  { id: "secret", label: "Secreta", color: "#64748b" },
  { id: "portcullis", label: "Grade", color: "#38bdf8" },
];

const boxCells = (b: Box): [number, number][] => {
  const out: [number, number][] = [];
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) out.push([b.x + i, b.y + j]);
  return out;
};

export function cloneDungeon(d: Dungeon): Dungeon {
  return {
    ...d,
    areas: d.areas.map((a) => ({
      ...a, cells: a.cells.map(([x, y]) => [x, y]), props: a.props.map((p) => ({ ...p })), water: a.water.map((w) => w.map(([x, y]) => [x, y])),
    })),
    doors: d.doors.map((x) => ({ ...x })),
    cellArea: new Int32Array(d.cellArea),
  };
}

/** As duas células que a porta separa. */
export function doorSides(dr: Edge): [[number, number], [number, number]] {
  return dr.horiz ? [[dr.x, dr.y - 1], [dr.x, dr.y]] : [[dr.x - 1, dr.y], [dr.x, dr.y]];
}

const areaAtCell = (d: Dungeon, x: number, y: number) => (x < 0 || y < 0 || x >= d.cols || y >= d.rows ? -1 : d.cellArea[y * d.cols + x]);

/** Ids = índices; refaz o mapa de células e descarta portas que não separam mais duas áreas. */
function reindex(d: Dungeon) {
  const map = new Map(d.areas.map((a, i) => [a.id, i]));
  d.areas.forEach((a, i) => (a.id = i));
  d.cellArea = new Int32Array(d.cols * d.rows).fill(-1);
  for (const a of d.areas) {
    if (a.round) for (const [x, y] of boxCells(a)) d.cellArea[y * d.cols + x] = -2;
    for (const [x, y] of a.cells) d.cellArea[y * d.cols + x] = a.id;
  }
  d.doors = d.doors.filter((dr) => {
    dr.a = map.get(dr.a) ?? -1;
    dr.b = map.get(dr.b) ?? -1;
    const [[ax, ay], [bx, by]] = doorSides(dr);
    const a = areaAtCell(d, ax, ay);
    const b = areaAtCell(d, bx, by);
    if (a < 0 || b < 0 || a === b) return false;
    dr.a = a;
    dr.b = b;
    return true;
  });
}

/** Salas numeradas em sequência (mantém a ordem atual). */
function renumber(d: Dungeon) {
  d.areas.filter((a) => a.kind === "room").sort((p, q) => p.num - q.num).forEach((a, i) => (a.num = i + 1));
}

export function areaAt(d: Dungeon, fx: number, fy: number): number {
  const id = areaAtCell(d, Math.floor(fx), Math.floor(fy));
  if (id >= 0) return id;
  // canto maciço de sala redonda conta como a sala
  return d.areas.findIndex((a) => a.round && fx >= a.x && fx < a.x + a.w && fy >= a.y && fy < a.y + a.h);
}

/** A caixa cabe no mapa sem cobrir outra área (a área `ignore` pode se sobrepor a si mesma). */
export function canPlace(d: Dungeon, b: Box, ignore = -1): boolean {
  if (b.w < 1 || b.h < 1 || b.x < 1 || b.y < 1 || b.x + b.w > d.cols - 1 || b.y + b.h > d.rows - 1) return false;
  const self = d.areas[ignore];
  for (const [x, y] of boxCells(b)) {
    const v = d.cellArea[y * d.cols + x];
    if (v === -1 || v === ignore) continue;
    if (v === -2 && self?.round && x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h) continue;
    return false;
  }
  return true;
}

export function moveArea(src: Dungeon, id: number, dx: number, dy: number): Dungeon | null {
  const a0 = src.areas[id];
  if (!a0 || (!dx && !dy) || !canPlace(src, { x: a0.x + dx, y: a0.y + dy, w: a0.w, h: a0.h }, id)) return null;
  const d = cloneDungeon(src);
  const a = d.areas[id];
  a.x += dx;
  a.y += dy;
  a.cells = a.cells.map(([x, y]) => [x + dx, y + dy]);
  for (const p of a.props) {
    p.x += dx;
    p.y += dy;
  }
  a.water = a.water.map((w) => w.map(([x, y]) => [x + dx, y + dy]));
  // portas da sala vão junto; as que ficarem sem vizinho somem no reindex
  for (const dr of d.doors) {
    if (dr.a !== id && dr.b !== id) continue;
    dr.x += dx;
    dr.y += dy;
  }
  reindex(d);
  return d;
}

/** Só salas retangulares (e corredores retos) mudam de tamanho. */
export function canResize(d: Dungeon, id: number): boolean {
  const a = d.areas[id];
  return !!a && !a.round && a.cells.length === a.w * a.h;
}

export function resizeArea(src: Dungeon, id: number, b: Box): Dungeon | null {
  if (!canResize(src, id) || !canPlace(src, b, id)) return null;
  const d = cloneDungeon(src);
  const a = d.areas[id];
  Object.assign(a, b);
  a.cells = boxCells(b);
  const inside = (x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  a.props = a.props.filter((p) => inside(p.x - p.w / 2, p.y - p.h / 2) && inside(p.x + p.w / 2, p.y + p.h / 2));
  a.water = a.water.filter((w) => w.every(([x, y]) => inside(x, y)));
  reindex(d);
  return d;
}

/** Nova sala; com 1 célula de largura vira corredor. Devolve a masmorra e o id da área criada. */
export function addArea(src: Dungeon, b: Box): { d: Dungeon; id: number } | null {
  if (!canPlace(src, b)) return null;
  const d = cloneDungeon(src);
  const corridor = b.w === 1 || b.h === 1;
  const num = corridor ? 0 : Math.max(0, ...d.areas.map((a) => a.num)) + 1;
  const id = d.areas.length;
  d.areas.push({
    id, kind: corridor ? "corridor" : "room", ...b, cells: boxCells(b), round: false, num,
    name: corridor ? "" : "Sala nova", text: "", trap: false, props: [], water: [], depth: 0,
  });
  reindex(d);
  return { d, id };
}

export function removeArea(src: Dungeon, id: number): Dungeon {
  const d = cloneDungeon(src);
  d.areas.splice(id, 1);
  d.doors = d.doors.filter((dr) => dr.a !== id && dr.b !== id);
  reindex(d);
  renumber(d);
  return d;
}

export function setAreaText(src: Dungeon, id: number, patch: { name?: string; text?: string; trap?: boolean }): Dungeon {
  const d = cloneDungeon(src);
  Object.assign(d.areas[id], patch);
  return d;
}

/** Aresta da grade mais próxima do ponto (em células), se estiver perto o bastante. */
export function edgeAt(fx: number, fy: number, tol = 0.3): Edge | null {
  const hy = Math.round(fy);
  const vx = Math.round(fx);
  const dh = Math.abs(fy - hy);
  const dv = Math.abs(fx - vx);
  if (Math.min(dh, dv) > tol) return null;
  return dh <= dv ? { x: Math.floor(fx), y: hy, horiz: true } : { x: vx, y: Math.floor(fy), horiz: false };
}

export const doorIndex = (d: Dungeon, e: Edge) => d.doors.findIndex((dr) => dr.horiz === e.horiz && dr.x === e.x && dr.y === e.y);

/** A aresta separa duas áreas diferentes (lugar válido para porta)? */
export function edgeBetweenAreas(d: Dungeon, e: Edge): boolean {
  const [[ax, ay], [bx, by]] = doorSides(e);
  const a = areaAtCell(d, ax, ay);
  const b = areaAtCell(d, bx, by);
  return a >= 0 && b >= 0 && a !== b;
}

/** Põe, troca o tipo ou (type = null) tira a porta da aresta. */
export function setDoor(src: Dungeon, e: Edge, type: DoorType | null): Dungeon | null {
  const i = doorIndex(src, e);
  if (i < 0 && (!type || !edgeBetweenAreas(src, e))) return null;
  const d = cloneDungeon(src);
  if (!type) d.doors.splice(i, 1);
  else if (i >= 0) d.doors[i].type = type;
  else {
    const [[ax, ay], [bx, by]] = doorSides(e);
    d.doors.push({ ...e, type, a: areaAtCell(d, ax, ay), b: areaAtCell(d, bx, by) } as Door);
  }
  return d;
}

/** Mais espaço em volta do mapa (n células de cada lado). */
export function growMap(src: Dungeon, n: number): Dungeon {
  const d = cloneDungeon(src);
  d.cols += n * 2;
  d.rows += n * 2;
  for (const a of d.areas) {
    a.x += n;
    a.y += n;
    a.cells = a.cells.map(([x, y]) => [x + n, y + n]);
    for (const p of a.props) {
      p.x += n;
      p.y += n;
    }
    a.water = a.water.map((w) => w.map(([x, y]) => [x + n, y + n]));
  }
  for (const dr of d.doors) {
    dr.x += n;
    dr.y += n;
  }
  reindex(d);
  return d;
}
