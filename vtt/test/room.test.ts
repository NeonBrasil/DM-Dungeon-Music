// Sala: visibilidade (nada da camada do mestre vaza) e permissões dos jogadores.
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
  last() { return this.sent[this.sent.length - 1]; }
}

function setup() {
  const colls = Object.fromEntries(COLL_NAMES.map((n) => [n, {}])) as unknown as Colls;
  colls.settings.main = { id: "main", name: "T", playerPageId: "p1", diagonal: "dnd", turns: { entries: [], current: 0, round: 1, open: false } };
  const page = { cols: 10, rows: 10, gridSize: 70, grid: "square", gridColor: "#000", gridOpacity: 0.2, scale: 1.5, unit: "m", bg: "#fff", fogOn: false, fog: "" } as const;
  colls.pages.p1 = { id: "p1", name: "A", order: 0, ...page };
  colls.pages.p2 = { id: "p2", name: "B", order: 1, ...page };
  colls.players.ana = { id: "ana", name: "Ana", color: "#f00" };
  colls.players.bia = { id: "bia", name: "Bia", color: "#0f0" };
  const camp: CampaignFile = { id: "c1", createdAt: 0, invite: "x", secrets: { ana: "s1", bia: "s2" }, colls };
  const room = new Room(camp, () => {});
  const gm = new FakeWs();
  const ana = new FakeWs();
  const bia = new FakeWs();
  room.join(gm as unknown as WebSocket, "gm", null);
  room.join(ana as unknown as WebSocket, "player", "ana");
  room.join(bia as unknown as WebSocket, "player", "bia");
  return { room, camp, gm, ana, bia };
}

const token = (id: string, extra: Record<string, unknown> = {}) => ({
  id, pageId: "p1", layer: "tokens", z: 0, kind: "token", x: 0, y: 0, w: 70, h: 70, controlledBy: ["ana"], ...extra,
});

test("jogador só recebe a página dos jogadores", () => {
  const { ana } = setup();
  const welcome = ana.sent.find((m) => m.t === "welcome");
  assert.ok(welcome && welcome.t === "welcome");
  assert.deepEqual(Object.keys(welcome.colls.pages!), ["p1"]);
});

test("token na camada do mestre não vaza; trocar de camada envia/remove", () => {
  const { gm, ana, camp } = setup();
  gm.msg({ t: "create", coll: "graphics", data: token("g1", { layer: "gm" }) });
  assert.ok(camp.colls.graphics.g1);
  assert.ok(!ana.sent.some((m) => m.t === "upsert" && m.coll === "graphics"));
  gm.msg({ t: "update", coll: "graphics", id: "g1", patch: { layer: "tokens" } });
  assert.deepEqual(ana.last(), { t: "upsert", coll: "graphics", e: { ...camp.colls.graphics.g1 } });
  gm.msg({ t: "update", coll: "graphics", id: "g1", patch: { layer: "gm" } });
  assert.deepEqual(ana.last(), { t: "remove", coll: "graphics", id: "g1" });
});

test("trocar a página dos jogadores sincroniza páginas e tokens", () => {
  const { gm, ana } = setup();
  gm.msg({ t: "create", coll: "graphics", data: token("g2", { pageId: "p2" }) });
  assert.ok(!ana.sent.some((m) => m.t === "upsert" && m.coll === "graphics"));
  gm.msg({ t: "update", coll: "settings", id: "main", patch: { playerPageId: "p2" } });
  const got = ana.sent.slice(-4).map((m) => `${m.t}:${"coll" in m ? m.coll : ""}:${m.t === "upsert" ? m.e.id : m.t === "remove" ? m.id : ""}`);
  assert.ok(got.includes("upsert:pages:p2"));
  assert.ok(got.includes("remove:pages:p1"));
  assert.ok(got.includes("upsert:graphics:g2"));
});

test("jogador move só o próprio token e só x/y", () => {
  const { gm, ana, bia, camp } = setup();
  gm.msg({ t: "create", coll: "graphics", data: token("g3") });
  ana.msg({ t: "update", coll: "graphics", id: "g3", patch: { x: 140, y: 70 } });
  assert.equal(camp.colls.graphics.g3.x, 140);
  ana.msg({ t: "update", coll: "graphics", id: "g3", patch: { layer: "gm" } });
  assert.equal(camp.colls.graphics.g3.layer, "tokens");
  assert.equal(ana.last().t, "error");
  bia.msg({ t: "update", coll: "graphics", id: "g3", patch: { x: 0 } });
  assert.equal(camp.colls.graphics.g3.x, 140);
});

test("jogador não cria nada além de personagens; personagem fica dele", () => {
  const { ana, camp } = setup();
  ana.msg({ t: "create", coll: "pages", data: { id: "px" } });
  assert.equal(camp.colls.pages.px, undefined);
  ana.msg({ t: "create", coll: "characters", data: { id: "ch1", name: "Zed", template: "custom", data: {}, controlledBy: ["all"], shared: true } });
  assert.deepEqual(camp.colls.characters.ch1.controlledBy, ["ana"]);
  assert.equal(camp.colls.characters.ch1.shared, false);
});

test("ficha: notas do mestre não vão para o jogador; outro jogador não vê", () => {
  const { gm, ana, bia } = setup();
  gm.msg({ t: "create", coll: "characters", data: { id: "ch2", name: "Orc", template: "custom", data: {}, controlledBy: ["ana"], shared: false, gmNotes: "segredo" } });
  const up = ana.last();
  assert.ok(up.t === "upsert" && up.coll === "characters");
  assert.equal((up.e as Record<string, unknown>).gmNotes, undefined);
  assert.ok(!bia.sent.some((m) => m.t === "upsert" && m.coll === "characters"));
});

test("patch com __proto__ é recusado", () => {
  const { gm, camp } = setup();
  gm.msg({ t: "update", coll: "pages", id: "p1", patch: { "__proto__.polluted": 1 } });
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(gm.last().t, "error");
  assert.ok(camp.colls.pages.p1);
});

test("chat: rolagem pública, rolagem secreta e sussurro", () => {
  const { gm, ana, bia } = setup();
  ana.msg({ t: "chat", text: "/r 1d20+5 Ataque" });
  const pub = bia.last();
  assert.ok(pub.t === "upsert" && pub.coll === "chat");
  const msg = pub.e as unknown as { kind: string; label: string; roll: { total: number } };
  assert.equal(msg.kind, "roll");
  assert.equal(msg.label, "Ataque");
  assert.ok(msg.roll.total >= 6 && msg.roll.total <= 25);

  const before = bia.sent.length;
  ana.msg({ t: "chat", text: "/gr 1d20" });
  assert.equal(bia.sent.length, before);
  assert.equal(gm.last().t, "upsert");

  ana.msg({ t: "chat", text: "/w Bia segredo" });
  assert.equal(bia.last().t, "upsert");
  assert.equal(gm.last().t, "upsert");
});

test("splitRoll separa expressão e rótulo", () => {
  assert.deepEqual(Room.splitRoll("2d6 + 3 dano de fogo"), { expr: "2d6 + 3", label: "dano de fogo" });
  assert.deepEqual(Room.splitRoll("1d20"), { expr: "1d20", label: undefined });
});

test("barra de vida do token acompanha a ficha (e vice-versa)", () => {
  const { gm, ana, camp } = setup();
  gm.msg({ t: "create", coll: "characters", data: { id: "hero", name: "Herói", template: "dnd5e", data: { hp: 10, hp_max: 12 }, controlledBy: ["ana"], shared: false } });
  gm.msg({ t: "create", coll: "graphics", data: token("ht", { characterId: "hero" }) });
  assert.deepEqual(camp.colls.graphics.ht.bar, { value: 10, max: 12 });
  ana.msg({ t: "update", coll: "characters", id: "hero", patch: { "data.hp": 4 } });
  assert.deepEqual(camp.colls.graphics.ht.bar, { value: 4, max: 12 });
  ana.msg({ t: "update", coll: "graphics", id: "ht", patch: { "bar.value": 7 } });
  assert.equal(camp.colls.characters.hero.data.hp, 7);
});

test("presença: online ao entrar, offline ao sair", () => {
  const { ana, camp } = setup();
  assert.equal(camp.colls.players.ana.online, true);
  ana.close();
  assert.equal(camp.colls.players.ana.online, false);
});
