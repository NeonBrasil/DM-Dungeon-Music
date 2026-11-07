// Luta preparada (ataque contra CA tirando PV) e portas seladas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { Room } from "../server/room.ts";
import type { CampaignFile } from "../server/store.ts";
import type { S2C } from "../shared/protocol.ts";
import type { Colls } from "../shared/types.ts";
import { COLL_NAMES } from "../shared/types.ts";

class FakeWs extends EventEmitter {
  readyState = 1;
  sent: S2C[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.emit("close"); }
  msg(obj: unknown) { this.emit("message", Buffer.from(JSON.stringify(obj))); }
}

function setup() {
  const colls = Object.fromEntries(COLL_NAMES.map((n) => [n, {}])) as unknown as Colls;
  colls.settings.main = { id: "main", name: "T", playerPageId: "p1", diagonal: "dnd", turns: { entries: [], current: 0, round: 1, open: false } };
  colls.pages.p1 = { id: "p1", name: "A", order: 0, cols: 10, rows: 10, gridSize: 70, grid: "square", gridColor: "#000", gridOpacity: 0.2, scale: 1.5, unit: "m", bg: "#fff", fogOn: false, fog: "" };
  colls.players.ana = { id: "ana", name: "Ana", color: "#f00" };
  colls.characters.heroi = { id: "heroi", name: "Herói", template: "dnd5e", data: { hp: 12, hp_max: 12 }, controlledBy: ["ana"], shared: false };
  colls.characters.orc = { id: "orc", name: "Orc", template: "dnd5e", data: { hp: 15, hp_max: 15 }, controlledBy: [], shared: false };
  const tok = (id: string, extra: Record<string, unknown>) => ({ id, pageId: "p1", layer: "tokens", z: 0, kind: "token", x: 0, y: 0, w: 70, h: 70, controlledBy: [], ...extra });
  colls.graphics.t1 = tok("t1", { characterId: "heroi", bar: { value: 12, max: 12 } }) as never;
  colls.graphics.t2 = tok("t2", { characterId: "orc", bar: { value: 15, max: 15 } }) as never;
  colls.graphics.t3 = tok("t3", { name: "Goblin", bar: { value: 7, max: 7 } }) as never;
  const camp: CampaignFile = { id: "c1", createdAt: 0, invite: "x", secrets: { ana: "s1" }, colls };
  const room = new Room(camp, () => {});
  const gm = new FakeWs();
  const ana = new FakeWs();
  room.join(gm as unknown as WebSocket, "gm", null);
  room.join(ana as unknown as WebSocket, "player", "ana");
  return { camp, gm, ana };
}

test("ataques da ficha para a luta: acerto e dano já com números; sem d20 acerta sozinho", async () => {
  const { sheetActions } = await import("../shared/combat.ts");
  const { defaultData } = await import("../shared/sheet.ts");
  const { DND5E, NIGHTFALL } = await import("../client/sheets/templates.ts");
  const dnd = { ...defaultData(DND5E), str: 16, attacks: [{ name: "Espada", atk: "@{str_mod} + @{pb}", dmg: "1d8 + @{str_mod}" }] };
  assert.deepEqual(sheetActions(DND5E, dnd).map((a) => [a.label, a.test, a.dmg]), [["Espada", { kind: "d20", expr: "1d20 + (3 + 2)" }, "(1d8 + 3)"]]);
  const nf = { ...defaultData(NIGHTFALL), habilidades: [
    { name: "Bola de Fogo", teste: "", dano: "6d6" },
    { name: "Raio", teste: "1d20 + 4", dano: "1d10" },
    { name: "Passiva", teste: "", dano: "" },
  ] };
  assert.deepEqual(sheetActions(NIGHTFALL, nf).map((a) => [a.label, a.test, a.dmg]), [["Bola de Fogo", undefined, "(6d6)"], ["Raio", { kind: "d20", expr: "(1d20 + 4)" }, "(1d10)"]]);
});

test("acerto compara o total com a CA: 20 natural não passa de CA maior; 1 natural erra", async () => {
  const { attackOutcome, roll } = await import("../shared/dice.ts");
  const always = (v: number) => () => v;
  // 20 natural + 1 = 21 contra CA 22: errou (e não é crítico)
  assert.deepEqual(attackOutcome(roll("1d20 + 1", always(20)), 22), { hit: false, crit: false, nat: 20 });
  // o mesmo 21 contra CA 21: acertou, e como foi 20 natural, crítico
  assert.deepEqual(attackOutcome(roll("1d20 + 1", always(20)), 21), { hit: true, crit: true, nat: 20 });
  // bônus enorme não salva o 1 natural
  assert.deepEqual(attackOutcome(roll("1d20 + 30", always(1)), 10), { hit: false, crit: false, nat: 1 });
  // vantagem: vale o dado mantido (o maior)
  let i = 0;
  const seq = () => [4, 17][i++ % 2];
  assert.deepEqual(attackOutcome(roll("2d20kh1 + 3", seq), 20), { hit: true, crit: false, nat: 17 });
});

const chatLabels = (camp: CampaignFile) => Object.values(camp.colls.chat).sort((a, b) => a.ts - b.ts).map((m) => m.label);

test("acertou: o dano sai do PV da ficha e a barra do token acompanha", () => {
  const { camp, gm } = setup();
  gm.msg({ t: "attack", from: { graphicId: "t1" }, to: { graphicId: "t2" }, label: "Herói: Espada", ca: 13, atk: "15", dmg: "5" });
  assert.equal(camp.colls.characters.orc.data.hp, 10);
  assert.equal(camp.colls.graphics.t2.bar!.value, 10);
  const labels = chatLabels(camp);
  // criatura: CA e PV não aparecem no chat público
  assert.match(labels[0]!, /Herói: Espada → Orc \(0 m\): acertou$/);
  assert.match(labels[1]!, /^Dano em Orc: 5 · ferido$/);
});

test("errou: nada de dano; token sem ficha usa a barra; PV não fica negativo", () => {
  const { camp, gm } = setup();
  gm.msg({ t: "attack", from: { graphicId: "t2" }, to: { graphicId: "t1" }, label: "Orc: Machado", ca: 16, atk: "12", dmg: "8" });
  assert.equal(camp.colls.characters.heroi.data.hp, 12);
  gm.msg({ t: "attack", from: { graphicId: "t1" }, to: { graphicId: "t3" }, label: "Herói", ca: 10, dmg: "20" }); // sem teste: acerta sozinho
  assert.equal(camp.colls.graphics.t3.bar!.value, 0);
  assert.match(chatLabels(camp).at(-1)!, /caiu!/);
});

test("ficha sem token também luta; jogador não manda ataque personalizado", () => {
  const { camp, gm, ana } = setup();
  gm.msg({ t: "attack", from: { characterId: "orc" }, to: { characterId: "heroi" }, label: "Orc", ca: 10, atk: "30", dmg: "3" });
  assert.equal(camp.colls.characters.heroi.data.hp, 9);
  ana.msg({ t: "attack", from: { graphicId: "t1" }, to: { graphicId: "t2" }, label: "x", ca: 1, atk: "30", dmg: "9" });
  assert.equal(camp.colls.characters.orc.data.hp, 15);
  assert.ok(ana.sent.some((m) => m.t === "error"));
});

test("porta selada: jogador não abre (magia nem enigma); mestre abre", () => {
  const { camp, gm, ana } = setup();
  camp.colls.pages.p1.doors = [
    { id: "d1", x1: 0, y1: 0, x2: 70, y2: 0, open: false, seal: "magic" },
    { id: "d2", x1: 0, y1: 70, x2: 70, y2: 70, open: false, seal: "puzzle" },
  ];
  ana.msg({ t: "door", pageId: "p1", doorId: "d1" });
  ana.msg({ t: "door", pageId: "p1", doorId: "d2" });
  assert.equal(camp.colls.pages.p1.doors![0].open, false);
  assert.equal(camp.colls.pages.p1.doors![1].open, false);
  const errors = ana.sent.filter((m) => m.t === "error").map((m) => (m as { msg: string }).msg);
  assert.deepEqual(errors, ["A porta está selada por magia.", "A porta está presa por um enigma."]);
  gm.msg({ t: "door", pageId: "p1", doorId: "d1" });
  assert.equal(camp.colls.pages.p1.doors![0].open, true);
});
