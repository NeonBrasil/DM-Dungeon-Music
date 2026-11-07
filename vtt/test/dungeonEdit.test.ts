import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDungeon, type Dungeon } from "../client/gen/dungeon.ts";
import { addArea, areaAt, canPlace, doorIndex, doorSides, edgeAt, growMap, moveArea, removeArea, resizeArea, setDoor } from "../client/gen/dungeonEdit.ts";

const base = () => generateDungeon({ seed: "editor-teste", size: "medium", theme: "cripta" });

/** Invariantes: ids = índices, mapa de células bate com as áreas, toda porta separa duas áreas diferentes. */
function check(d: Dungeon) {
  d.areas.forEach((a, i) => assert.equal(a.id, i));
  for (const a of d.areas) for (const [x, y] of a.cells) assert.equal(d.cellArea[y * d.cols + x], a.id);
  for (const dr of d.doors) {
    const [[ax, ay], [bx, by]] = doorSides(dr);
    assert.equal(d.cellArea[ay * d.cols + ax], dr.a);
    assert.equal(d.cellArea[by * d.cols + bx], dr.b);
    assert.notEqual(dr.a, dr.b);
  }
}

/** Primeiro espaço vazio (com folga) onde cabe uma caixa w×h. */
function emptySpot(d: Dungeon, w: number, h: number) {
  for (let y = 1; y < d.rows; y++) for (let x = 1; x < d.cols; x++) if (canPlace(d, { x: x - 1, y: y - 1, w: w + 2, h: h + 2 })) return { x, y, w, h };
  throw new Error("sem espaço");
}

test("criar sala e corredor; não deixa cobrir outra área", () => {
  const d0 = growMap(base(), 8);
  check(d0);
  const room = addArea(d0, emptySpot(d0, 4, 3))!;
  check(room.d);
  assert.equal(room.d.areas[room.id].kind, "room");
  assert.equal(room.d.areas[room.id].num, Math.max(...d0.areas.map((a) => a.num)) + 1);
  const a0 = d0.areas[0];
  assert.equal(addArea(d0, { x: a0.x, y: a0.y, w: 2, h: 2 }), null);
  const cor = addArea(room.d, emptySpot(room.d, 1, 5))!;
  assert.equal(cor.d.areas[cor.id].kind, "corridor");
});

test("mover leva objetos e portas; porta sem vizinho some", () => {
  const d0 = growMap(base(), 10);
  const room = addArea(d0, emptySpot(d0, 4, 4))!;
  const id = room.id;
  const a = room.d.areas[id];
  const cor = addArea(room.d, { x: a.x + 4, y: a.y + 1, w: 3, h: 1 })!; // corredor encostado na parede leste
  const withDoor = setDoor(cor.d, { x: a.x + 4, y: a.y + 1, horiz: false }, "magic")!;
  check(withDoor);
  assert.equal(withDoor.doors.at(-1)!.type, "magic");
  // sobe 1: a porta vai junto, mas o corredor ficou, então ela fica sem vizinho e some
  const moved = moveArea(withDoor, id, 0, -1)!;
  check(moved);
  assert.equal(moved.areas[id].y, a.y - 1);
  assert.equal(moved.doors.length, withDoor.doors.length - 1);
  // e volta: a sala encosta de novo no corredor (a porta não volta sozinha; põe-se outra)
  const back = moveArea(moved, id, 0, 1)!;
  check(back);
  assert.ok(setDoor(back, { x: a.x + 4, y: a.y + 1, horiz: false }, "door"));
  // mover para cima de outra área é recusado
  assert.equal(moveArea(withDoor, id, cor.d.areas[cor.id].x - a.x, 0), null);
});

test("redimensionar e excluir renumeram e mantêm o mapa válido", () => {
  const d0 = growMap(base(), 8);
  const room = addArea(d0, emptySpot(d0, 3, 3))!;
  const r = room.d.areas[room.id];
  const big = resizeArea(room.d, room.id, { x: r.x, y: r.y, w: 5, h: 4 })!;
  check(big);
  assert.equal(big.areas[room.id].cells.length, 20);
  const firstRoom = big.areas.findIndex((x) => x.kind === "room");
  const removed = removeArea(big, firstRoom);
  check(removed);
  const nums = removed.areas.filter((x) => x.kind === "room").map((x) => x.num).sort((p, q) => p - q);
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
});

test("porta: tipo novo, troca e remoção; aresta fora de duas áreas é recusada", () => {
  const d = base();
  const dr = d.doors[0];
  const e = { x: dr.x, y: dr.y, horiz: dr.horiz };
  const puzzle = setDoor(d, e, "puzzle")!;
  assert.equal(puzzle.doors[doorIndex(puzzle, e)].type, "puzzle");
  const none = setDoor(puzzle, e, null)!;
  assert.equal(doorIndex(none, e), -1);
  assert.equal(setDoor(d, { x: 0, y: 0, horiz: true }, "door"), null);
  assert.deepEqual(edgeAt(3.5, 7.1), { x: 3, y: 7, horiz: true });
  assert.deepEqual(edgeAt(4.05, 2.5), { x: 4, y: 2, horiz: false });
  assert.equal(edgeAt(3.5, 7.5), null);
  assert.ok(areaAt(d, d.areas[0].x + 0.5, d.areas[0].y + 0.5) === 0);
});
