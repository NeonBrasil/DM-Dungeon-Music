// Sala: recursos da segunda leva (desenhos, portas, paredes, textos por jogador, iniciativa, trilha, baralhos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { Room } from "../server/room.ts";
import type { CampaignFile } from "../server/store.ts";
import type { S2C } from "../shared/protocol.ts";
import type { Colls, Page } from "../shared/types.ts";
import { COLL_NAMES } from "../shared/types.ts";

class FakeWs extends EventEmitter {
  readyState = 1;
  sent: S2C[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.emit("close"); }
  msg(obj: unknown) { this.emit("message", Buffer.from(JSON.stringify(obj))); }
  last() { return this.sent[this.sent.length - 1]; }
  lastOf(coll: string, id: string) {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i];
      if (m.t === "upsert" && m.coll === coll && m.e.id === id) return m.e as Record<string, any>;
    }
    return null;
  }
}

function setup() {
  const colls = Object.fromEntries(COLL_NAMES.map((n) => [n, {}])) as unknown as Colls;
  colls.settings.main = { id: "main", name: "T", playerPageId: "p1", diagonal: "dnd", turns: { entries: [], current: 0, round: 1, open: false }, gmMacros: [{ id: "m", label: "Segredo", text: "/gr 1d20" }] };
  const base = { cols: 20, rows: 20, gridSize: 70, grid: "square", gridColor: "#000", gridOpacity: 0.2, scale: 1.5, unit: "m", bg: "#fff", fogOn: false, fog: "" } as const;
  const p1: Page = {
    id: "p1", name: "A", order: 0, ...base,
    light: { on: true, global: true, explore: false },
    walls: [700, 0, 700, 1400],
    doors: [
      { id: "d1", x1: 0, y1: 700, x2: 140, y2: 700, open: false },
      { id: "d2", x1: 140, y1: 700, x2: 280, y2: 700, open: false, locked: true },
      { id: "d3", x1: 280, y1: 700, x2: 420, y2: 700, open: false, secret: true },
    ],
  };
  colls.pages.p1 = p1;
  colls.pages.p2 = { id: "p2", name: "B", order: 1, ...base, music: ["mus2"], musicReplace: true };
  colls.players.ana = { id: "ana", name: "Ana", color: "#f00" };
  colls.players.bia = { id: "bia", name: "Bia", color: "#0f0" };
  colls.tracks.mus1 = { id: "mus1", name: "Taverna", src: "/x.mp3", kind: "music", volume: 1, loop: true, playing: true, startedAt: 1 };
  colls.tracks.mus2 = { id: "mus2", name: "Batalha", src: "/y.mp3", kind: "music", volume: 1, loop: true, playing: false, startedAt: 0 };
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
  id, pageId: "p1", layer: "tokens", z: 0, kind: "token", x: 560, y: 560, w: 70, h: 70, controlledBy: ["ana"], ...extra,
});

test("jogador desenha, mexe e apaga o próprio desenho, mas não apaga token", () => {
  const { gm, ana, bia, camp } = setup();
  ana.msg({ t: "create", coll: "graphics", data: { id: "dr1", pageId: "p1", layer: "gm", z: 0, kind: "path", x: 0, y: 0, w: 10, h: 10, pts: [0, 0, 10, 10], controlledBy: ["all"], vision: { on: true } } });
  const d = camp.colls.graphics.dr1;
  assert.deepEqual(d.controlledBy, ["ana"]);
  assert.equal(d.layer, "tokens");
  assert.equal(d.vision, undefined);
  bia.msg({ t: "delete", coll: "graphics", id: "dr1" });
  assert.ok(camp.colls.graphics.dr1, "outra jogadora não apaga");
  ana.msg({ t: "update", coll: "graphics", id: "dr1", patch: { stroke: "#00f", x: 5 } });
  assert.equal(camp.colls.graphics.dr1.stroke, "#00f");
  ana.msg({ t: "delete", coll: "graphics", id: "dr1" });
  assert.equal(camp.colls.graphics.dr1, undefined);
  gm.msg({ t: "create", coll: "graphics", data: token("t1") });
  ana.msg({ t: "delete", coll: "graphics", id: "t1" });
  assert.ok(camp.colls.graphics.t1, "token não é apagado pelo jogador");
});

test("portas: jogadora abre a comum, não abre a trancada, não vê a secreta", () => {
  const { ana, camp } = setup();
  const welcome = ana.sent.find((m) => m.t === "welcome");
  assert.ok(welcome && welcome.t === "welcome");
  const page = welcome.colls.pages!.p1;
  assert.deepEqual(page.doors!.map((d) => d.id), ["d1", "d2"]);
  assert.ok(page.walls!.length === 8, "secreta virou parede");
  ana.msg({ t: "door", pageId: "p1", doorId: "d1" });
  assert.equal(camp.colls.pages.p1.doors![0].open, true);
  ana.msg({ t: "door", pageId: "p1", doorId: "d2" });
  assert.equal(camp.colls.pages.p1.doors![1].open, false);
  assert.equal(ana.last().t, "error");
  ana.msg({ t: "door", pageId: "p1", doorId: "d3" });
  assert.equal(camp.colls.pages.p1.doors![2].open, false);
});

test("parede bloqueia o movimento do jogador (iluminação ligada)", () => {
  const { gm, ana, camp } = setup();
  gm.msg({ t: "create", coll: "graphics", data: token("t2") });
  ana.msg({ t: "update", coll: "graphics", id: "t2", patch: { x: 770 } }); // centro cruza x = 700
  assert.equal(camp.colls.graphics.t2.x, 560);
  assert.equal(ana.last().t, "error");
  ana.msg({ t: "update", coll: "graphics", id: "t2", patch: { x: 490 } });
  assert.equal(camp.colls.graphics.t2.x, 490);
  gm.msg({ t: "update", coll: "graphics", id: "t2", patch: { x: 900 } }); // mestre atravessa
  assert.equal(camp.colls.graphics.t2.x, 900);
});

test("texto só para uma jogadora", () => {
  const { gm, ana, bia } = setup();
  gm.msg({ t: "create", coll: "handouts", data: { id: "h1", name: "Carta", text: "segredo", shared: false, visibleTo: ["bia"] } });
  assert.ok(bia.lastOf("handouts", "h1"));
  assert.equal(ana.lastOf("handouts", "h1"), null);
});

test("macros do mestre não vão para jogadores; jogador edita as próprias", () => {
  const { ana, camp } = setup();
  const w = ana.sent.find((m) => m.t === "welcome");
  assert.ok(w && w.t === "welcome");
  assert.equal(w.colls.settings!.main.gmMacros, undefined);
  ana.msg({ t: "update", coll: "players", id: "ana", patch: { macros: [{ id: "a", label: "Ataque", text: "/r 1d20+5" }] } });
  assert.equal(camp.colls.players.ana.macros?.length, 1);
});

test("rolagem de iniciativa entra na ordem, decrescente", () => {
  const { gm, ana, camp } = setup();
  gm.msg({ t: "create", coll: "graphics", data: token("t3", { name: "Ana Guerreira" }) });
  ana.msg({ t: "roll", expr: "20", label: "Iniciativa", tracker: true });
  gm.msg({ t: "chat", text: "/r 5 &{tracker}" });
  const e = camp.colls.settings.main.turns.entries;
  assert.deepEqual(e.map((x) => [x.name, x.value]), [["Ana Guerreira", 20], ["Mestre", 5]]);
  assert.equal(e[0].graphicId, "t3");
});

test("levar jogadores para página com trilha troca a música", () => {
  const { gm, camp } = setup();
  gm.msg({ t: "update", coll: "settings", id: "main", patch: { playerPageId: "p2" } });
  assert.equal(camp.colls.tracks.mus2.playing, true);
  assert.equal(camp.colls.tracks.mus1.playing, false);
});

test("baralho: mão secreta, monte só com contagem, carta virada para baixo esconde a face", () => {
  const { gm, ana, bia, camp } = setup();
  const cards = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, name: `Carta ${i}` }));
  gm.msg({ t: "create", coll: "decks", data: { id: "dk", name: "Teste", kind: "custom", cards, pile: cards.map((c) => c.id), discard: [], hands: {} } });
  gm.msg({ t: "deck", op: "shuffle", deckId: "dk" });
  gm.msg({ t: "deck", op: "draw", deckId: "dk", to: "ana" });
  const dk = camp.colls.decks.dk;
  assert.equal(dk.pile.length, 4);
  assert.equal(dk.hands.ana.length, 1);
  const anaView = ana.lastOf("decks", "dk")!;
  const biaView = bia.lastOf("decks", "dk")!;
  assert.deepEqual(anaView.pile, []);
  assert.equal(anaView.pileCount, 4);
  assert.equal(anaView.hands.ana.length, 1);
  assert.equal(biaView.hands.ana, undefined);
  assert.equal(biaView.handCounts.ana, 1);
  const cid = dk.hands.ana[0];
  ana.msg({ t: "deck", op: "play", deckId: "dk", cardId: cid, x: 0, y: 0, faceUp: false });
  const g = Object.values(camp.colls.graphics).find((x) => x.card?.deckId === "dk")!;
  assert.equal(g.card!.cardId, cid);
  assert.equal(bia.lastOf("graphics", g.id)!.card.cardId, "");
  assert.equal(ana.lastOf("graphics", g.id)!.card.cardId, cid);
  ana.msg({ t: "deck", op: "flip", graphicId: g.id });
  assert.equal(bia.lastOf("graphics", g.id)!.card.cardId, cid);
});
