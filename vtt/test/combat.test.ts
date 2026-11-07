// Combate: ações da ficha, alcance, distância, cobertura, condições, resistências e o ataque do jogador no servidor.
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import {
  applyDefenses, conditionEdge, coverBetween, defensesOf, parseCrit, parseRange, parseSave, rangeFromText, rangeState, saveTest, sheetActions,
  tokenDistance,
} from "../shared/combat.ts";
import { COC7E, DND5E, DND5E_NPC, NIGHTFALL, ORDEM, T20 } from "../client/sheets/templates.ts";
import { Room } from "../server/room.ts";
import type { CampaignFile } from "../server/store.ts";
import type { S2C } from "../shared/protocol.ts";
import type { Colls } from "../shared/types.ts";
import { COLL_NAMES } from "../shared/types.ts";

// ─── Regras puras ────────────────────────────────────────────────────────────

test("alcance: corpo a corpo, normal/longo, categorias, pés, magia sem longo", () => {
  assert.deepEqual(parseRange("1,5 m"), { reach: 1.5 });
  assert.deepEqual(parseRange("Corpo a corpo"), { reach: 1.5 });
  assert.deepEqual(parseRange("24/96 m"), { normal: 24, long: 96 });
  assert.deepEqual(parseRange("30/120 ft"), { normal: 9, long: 36 });
  assert.deepEqual(parseRange("9 m"), { normal: 9, long: 18 });
  assert.deepEqual(parseRange("36 m", { spell: true }), { normal: 36, long: 36 });
  assert.deepEqual(parseRange("Médio"), { normal: 30, long: 60 });            // Tormenta20
  assert.deepEqual(parseRange("Médio", { ordem: true }), { normal: 18, long: 36 }); // Ordem Paranormal
  assert.equal(parseRange("Pessoal"), undefined);
  assert.equal(parseRange(""), undefined);
  // descrição de criatura do compêndio (en e pt)
  assert.deepEqual(rangeFromText("Melee or Ranged Weapon Attack: +4 to hit, reach 1,5 m or range 9/36 m, one target.", false), { reach: 1.5, normal: 9, long: 36 });
  assert.deepEqual(rangeFromText("Ataque à distância: +3 para acertar, distância 24/96 m, um alvo.", false), { normal: 24, long: 96 });
  assert.deepEqual(rangeFromText("Explosão de 6 m de raio a até 45 m.", true), { normal: 45, long: 45 });
});

test("estado do alcance: dentro, longa distância, fora; arremesso vale nos dois", () => {
  const javelin = { reach: 1.5, normal: 9, long: 36 };
  assert.equal(rangeState(javelin, 1.5), "melee");
  assert.equal(rangeState(javelin, 6), "normal");
  assert.equal(rangeState(javelin, 20), "long");
  assert.equal(rangeState(javelin, 40), "far");
  assert.equal(rangeState({ reach: 1.5 }, 3), "far");
  assert.equal(rangeState(undefined, 99), "unknown");
});

test("crítico da ficha: margem e multiplicador", () => {
  assert.deepEqual(parseCrit("19/x2"), { min: 19, mult: 2 });
  assert.deepEqual(parseCrit("x3"), { min: 20, mult: 3 });
  assert.deepEqual(parseCrit("18-20/x2"), { min: 18, mult: 2 });
  assert.deepEqual(parseCrit(""), { min: 20, mult: 2 });
});

test("resistência citada no texto: atributo, CD e metade", () => {
  assert.deepEqual(parseSave("Explosão de 6 m de raio. Resistência de DES contra a CD: metade do dano se passar."), { save: "des", dc: undefined, half: true });
  assert.deepEqual(parseSave("Each creature must make a DC 13 Dexterity saving throw, taking 22 (5d8) fire damage on a failed save, or half as much"), { save: "des", dc: 13, half: true });
  assert.deepEqual(parseSave("o alvo faz um teste de ataque"), { save: undefined, dc: undefined, half: false });
});

test("distância entre tokens: adjacente = 1 casa (também na diagonal), contando de borda a borda", () => {
  const page = { gridSize: 70, scale: 1.5 };
  const at = (cx: number, cy: number, size = 1) => ({ x: cx * 70, y: cy * 70, w: 70 * size, h: 70 * size });
  assert.equal(tokenDistance(at(0, 0), at(1, 0), page, "dnd"), 1.5);
  assert.equal(tokenDistance(at(0, 0), at(1, 1), page, "dnd"), 1.5);
  assert.equal(tokenDistance(at(0, 0), at(1, 1), page, "euclid"), 1.5);
  assert.equal(tokenDistance(at(0, 0), at(4, 0), page, "dnd"), 6);
  assert.equal(tokenDistance(at(0, 0), at(3, 3), page, "alt"), 6);  // 3 + 1 (diagonais 5-10-5)
  assert.equal(tokenDistance(at(0, 0), at(2, 0, 2), page, "dnd"), 3); // criatura grande: conta da borda
  assert.equal(tokenDistance(at(0, 0), at(0, 0), page, "dnd"), 0);
});

test("cobertura pelas paredes: nenhuma, meia, três quartos, total", () => {
  const a = { x: 0, y: 0, w: 70, h: 70 };
  const b = { x: 280, y: 0, w: 70, h: 70 };
  assert.equal(coverBetween(a, b, {}), "none");
  assert.equal(coverBetween(a, b, { walls: [175, -100, 175, 200] }), "total");
  assert.equal(coverBetween(a, b, { walls: [175, 30, 175, 200] }), "three");   // tapa o centro e os cantos de baixo
  assert.equal(coverBetween(a, b, { walls: [175, 40, 175, 200] }), "half");    // só os cantos de baixo
  assert.equal(coverBetween(a, b, { walls: [175, -100, 175, 200], doors: [] }), "total");
  assert.equal(coverBetween(a, b, { doors: [{ id: "d", x1: 175, y1: -100, x2: 175, y2: 200, open: true }] }), "none");
});

test("condições: vantagem/desvantagem do atacante e do alvo; caído depende da distância; paralisado perto = crítico", () => {
  assert.deepEqual(conditionEdge(["poisoned"], [], 1.5), { adv: [], dis: ["atacante envenenado"], autoCrit: false });
  assert.deepEqual(conditionEdge([], ["prone"], 1.5).adv, ["alvo caído (perto)"]);
  assert.deepEqual(conditionEdge([], ["prone"], 9).dis, ["alvo caído (longe)"]);
  assert.equal(conditionEdge([], ["paralyzed"], 1.5).autoCrit, true);
  assert.equal(conditionEdge([], ["paralyzed"], 6).autoCrit, false);
  assert.deepEqual(conditionEdge(["invisible"], ["invisible"], 3), { adv: ["atacante invisível"], dis: ["alvo invisível"], autoCrit: false });
});

test("resistências: metade, redução fixa (Ordem), imunidade, vulnerabilidade", () => {
  const npc = defensesOf(DND5E_NPC, { resist: "fire; bludgeoning, piercing, and slashing from nonmagical attacks", immune: "poison", vuln: "cold" });
  assert.deepEqual(applyDefenses(11, "fogo", npc), { dmg: 5, note: "resistente a fogo (metade)" });
  assert.deepEqual(applyDefenses(11, "cortante", npc).dmg, 5);
  assert.deepEqual(applyDefenses(11, "veneno", npc), { dmg: 0, note: "imune a veneno" });
  assert.deepEqual(applyDefenses(6, "frio", npc).dmg, 12);
  assert.equal(applyDefenses(6, "radiante", npc).note, undefined);
  const agente = defensesOf(ORDEM, { resistencias: "Balístico 5, Sangue 10" });
  assert.deepEqual(applyDefenses(8, "balistico", agente), { dmg: 3, note: "resistência 5 a balistico" });
  assert.equal(applyDefenses(8, "sangue", agente).dmg, 0);
});

test("resistência do alvo em cada sistema", () => {
  const dnd = { str: 10, dex: 14, pb: 2, save_dex_prof: 1 };
  assert.deepEqual(saveTest(DND5E, dnd, "des"), { kind: "d20", expr: "1d20 + 4" });
  assert.deepEqual(saveTest(DND5E_NPC, { dex: 14, saves: "Des +5, Sab +3" }, "des"), { kind: "d20", expr: "1d20 + 5" });
  assert.deepEqual(saveTest(DND5E_NPC, { dex: 8 }, "des"), { kind: "d20", expr: "1d20 + (-1)" });
  assert.deepEqual(saveTest(T20, { nivel: 1, des: 3, refl_prof: 1 }, "des"), { kind: "d20", expr: "1d20 + 5" });
  assert.deepEqual(saveTest(ORDEM, { agi: 3, reflexos_train: 5 }, "des"), { kind: "op", dice: 3, bonus: 5 });
  assert.deepEqual(saveTest(COC7E, { dex: 60 }, "des"), { kind: "coc", skill: 60 });
  assert.deepEqual(saveTest(NIGHTFALL, { des: 14, nivel: 1, save_des_prof: 1 }, "des"), { kind: "d20", expr: "1d20 + 4" });
});

test("ações da ficha: alcance, quantidade, tipo; Ordem e CoC com o teste do sistema; criatura sem acerto = resistência", () => {
  const dnd = sheetActions(DND5E, {
    str: 16, pb: 2, spell_dc: 13,
    attacks: [
      { name: "Arco", atk: "2", dmg: "1d8", kind: "perfurante", alcance: "24/96 m", qtd: 20 },
      { name: "Granada", atk: "", dmg: "3d6", kind: "fogo", alcance: "9 m", qtd: 2 },
    ],
    spells: [{ name: "Bola de Fogo", level: 3, alcance: "45 m", dmg: "8d6", notes: "Resistência de DES, metade se passar. 6 m de raio" }],
  });
  assert.deepEqual(dnd.map((a) => [a.label, a.test?.kind, a.range, a.qty, a.dmgType]), [
    ["Arco", "d20", { normal: 24, long: 96 }, 20, "perfurante"],
    ["Granada", undefined, { normal: 9, long: 18 }, 2, "fogo"],
    ["Bola de Fogo", undefined, { normal: 45, long: 45 }, undefined, "fogo"],
  ]);
  const fb = dnd[2];
  assert.deepEqual([fb.save, fb.half, fb.dc, fb.area, fb.spellTest?.kind], ["des", true, 13, 6, "d20"]);

  const op = sheetActions(ORDEM, { ataques: [{ name: "Fuzil", attr: 3, bonus: 5, dmg: "2d10", crit: "19/x3", alcance: "Médio" }] })[0];
  assert.deepEqual([op.test, op.crit, op.range], [{ kind: "op", dice: 3, bonus: 5 }, { min: 19, mult: 3 }, { normal: 18, long: 36 }]);

  const coc = sheetActions(COC7E, { weapons: [{ name: "Revólver .38", skill: 45, dmg: "1d10", range: "15 m", qtd: 6 }] })[0];
  assert.deepEqual([coc.test, coc.range, coc.qty], [{ kind: "coc", skill: 45 }, { normal: 15, long: 30 }, 6]);

  const dragon = sheetActions(DND5E_NPC, { actions: [
    { name: "Mordida", atk: "6", dmg: "1d10+4", desc: "Melee Weapon Attack: +6 to hit, reach 1,5 m, one target. Hit: 9 (1d10 + 4) piercing damage." },
    { name: "Sopro de Fogo", atk: "", dmg: "7d6", desc: "Each creature in a 4,5 m cone must make a DC 13 Dexterity saving throw, taking 24 (7d6) fire damage on a failed save, or half as much damage on a successful one." },
  ] });
  assert.deepEqual(dragon.map((a) => [a.test?.kind, a.range, a.dmgType, a.save, a.dc]), [
    ["d20", { reach: 1.5 }, "perfurante", undefined, undefined],
    [undefined, undefined, "fogo", "des", 13],
  ]);
});

// ─── Servidor ────────────────────────────────────────────────────────────────

class FakeWs extends EventEmitter {
  readyState = 1;
  sent: S2C[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.emit("close"); }
  msg(obj: unknown) { this.emit("message", Buffer.from(JSON.stringify(obj))); }
}

/** Dados viciados: todo dado mostra v (ou o máximo dele, se for menor). */
const dice = (t: TestContext, v: number) => t.mock.method(crypto, "randomInt", (_min: number, max: number) => Math.min(v, max - 1));

const at = (cx: number, cy: number) => ({ x: cx * 70, y: cy * 70 });

function setup() {
  const colls = Object.fromEntries(COLL_NAMES.map((n) => [n, {}])) as unknown as Colls;
  colls.settings.main = { id: "main", name: "T", playerPageId: "p1", diagonal: "dnd", turns: { entries: [], current: 0, round: 1, open: false } };
  colls.pages.p1 = { id: "p1", name: "A", order: 0, cols: 20, rows: 10, gridSize: 70, grid: "square", gridColor: "#000", gridOpacity: 0.2, scale: 1.5, unit: "m", bg: "#fff", fogOn: false, fog: "" };
  colls.players.ana = { id: "ana", name: "Ana", color: "#f00" };
  colls.characters.heroi = {
    id: "heroi", name: "Herói", template: "dnd5e", controlledBy: ["ana"], shared: false,
    data: {
      hp: 12, hp_max: 12, str: 16, dex: 14, pb: 2, spell_dc: 12,
      attacks: [
        { name: "Espada", atk: "@{str_mod} + @{pb}", dmg: "1d8 + @{str_mod}", kind: "cortante", alcance: "1,5 m" },
        { name: "Arco", atk: "@{dex_mod} + @{pb}", dmg: "1d8", kind: "perfurante", alcance: "24/96 m", qtd: 2 },
        { name: "Granada", atk: "", dmg: "3d6", kind: "fogo", alcance: "9 m", qtd: 1 },
      ],
    },
  };
  colls.characters.orc = { id: "orc", name: "Orc", template: "dnd5e-npc", controlledBy: [], shared: false, data: { hp: 15, hp_max: 15, ac: 13, dex: 12, resist: "cortante", hp_temp: 0 } };
  colls.characters.ogro = { id: "ogro", name: "Ogro", template: "dnd5e", controlledBy: [], shared: false, data: { hp: 30, hp_max: 30, ac: 11, hp_temp: 4 } };
  const tok = (id: string, pos: { x: number; y: number }, extra: Record<string, unknown>) => ({ id, pageId: "p1", layer: "tokens", z: 0, kind: "token", ...pos, w: 70, h: 70, controlledBy: [], ...extra });
  colls.graphics.t1 = tok("t1", at(0, 0), { characterId: "heroi", bar: { value: 12, max: 12 } }) as never;
  colls.graphics.t2 = tok("t2", at(1, 0), { characterId: "orc", bar: { value: 15, max: 15 } }) as never;
  colls.graphics.g1 = tok("g1", at(10, 0), { name: "Goblin", bar: { value: 7, max: 7 } }) as never;   // 15 m do herói
  colls.graphics.g2 = tok("g2", at(11, 0), { name: "Goblin 2", bar: { value: 7, max: 7 } }) as never; // colado no Goblin
  colls.graphics.og = tok("og", at(0, 1), { characterId: "ogro", bar: { value: 30, max: 30 } }) as never;
  const camp: CampaignFile = { id: "c1", createdAt: 0, invite: "x", secrets: { ana: "s1" }, colls };
  const room = new Room(camp, () => {});
  const gm = new FakeWs();
  const ana = new FakeWs();
  room.join(gm as unknown as WebSocket, "gm", null);
  room.join(ana as unknown as WebSocket, "player", "ana");
  const errors = () => ana.sent.filter((m) => m.t === "error").map((m) => (m as { msg: string }).msg);
  const texts = () => Object.values(camp.colls.chat).sort((a, b) => a.ts - b.ts).map((m) => m.label ?? m.text ?? "");
  return { camp, gm, ana, errors, texts };
}

const hit = (from: string, to: string, use: string, extra: Record<string, unknown> = {}) => ({ t: "attack", from: { graphicId: from }, to: { graphicId: to }, use, ...extra });

test("jogador ataca pelo mapa com a arma da ficha: servidor calcula acerto, resistência e PV (sem mostrar CA/PV da criatura)", (t) => {
  dice(t, 10);
  const { camp, ana, errors, texts } = setup();
  ana.msg(hit("t1", "t2", "attacks:0")); // 1d20(10) + 5 = 15 contra CA 13; dano 1d8(8) + 3 = 11, resistente a cortante → 5
  assert.deepEqual(errors(), []);
  assert.equal(camp.colls.characters.orc.data.hp, 10);
  assert.equal(camp.colls.graphics.t2.bar!.value, 10);
  const [atk, dmg] = texts();
  assert.match(atk, /^Herói: Espada → Orc \(1,5 m\): acertou$/);
  assert.match(dmg, /^Dano em Orc: 5 \(resistente a cortante \(metade\)\) · ferido$/);
});

test("jogador não ataca com personagem dos outros nem manda ataque inventado", (t) => {
  dice(t, 10);
  const { camp, ana, errors } = setup();
  ana.msg(hit("t2", "t1", "actions:0"));
  ana.msg({ t: "attack", from: { graphicId: "t1" }, to: { graphicId: "t2" }, atk: "99", dmg: "99" });
  assert.deepEqual(errors(), ["Você só ataca com um personagem seu.", "Escolha uma arma ou magia da ficha."]);
  assert.equal(camp.colls.characters.heroi.data.hp, 12);
  assert.equal(camp.colls.characters.orc.data.hp, 15);
});

test("alcance: espada não chega a 15 m; arco chega e gasta flecha; acabou a munição, não atira", (t) => {
  dice(t, 15);
  const { camp, ana, errors } = setup();
  ana.msg(hit("t1", "g1", "attacks:0"));
  assert.match(errors()[0], /^Goblin está fora do alcance: 15 m \(Espada: 1,5 m\)\.$/);
  ana.msg(hit("t1", "g1", "attacks:1"));
  ana.msg(hit("t1", "g1", "attacks:1"));
  const rows = camp.colls.characters.heroi.data.attacks as { qtd: number }[];
  assert.equal(rows[1].qtd, 0);
  ana.msg(hit("t1", "g1", "attacks:1"));
  assert.equal(errors().at(-1), "Arco: acabou (quantidade 0).");
});

test("longa distância dá desvantagem; parede no caminho bloqueia; mestre pode ignorar", (t) => {
  dice(t, 15);
  const { camp, gm, ana, errors, texts } = setup();
  camp.colls.graphics.g1.x = 70 * 30; // 30 casas = 45 m: além dos 24 m do arco
  ana.msg(hit("t1", "g1", "attacks:1"));
  assert.match(texts()[0], /desvantagem: longa distância/);
  assert.match(camp.colls.chat[Object.keys(camp.colls.chat)[0]].roll!.expr, /^2d20kl1/);
  camp.colls.pages.p1.walls = [70, -200, 70, 400]; // entre o herói e o orc
  ana.msg(hit("t1", "t2", "attacks:0"));
  assert.equal(errors().at(-1), "Sem linha de visão até Orc: tem parede no caminho.");
  gm.msg(hit("t1", "t2", "attacks:0", { force: true }));
  assert.ok(Number(camp.colls.characters.orc.data.hp) < 15);
});

test("condições: alvo caído perto dá vantagem; atacante inconsciente não ataca", (t) => {
  dice(t, 10);
  const { camp, ana, errors, texts } = setup();
  camp.colls.graphics.t2.markers = ["prone"];
  ana.msg(hit("t1", "t2", "attacks:0"));
  assert.match(texts()[0], /vantagem: alvo caído \(perto\)/);
  camp.colls.graphics.t1.markers = ["unconscious"];
  ana.msg(hit("t1", "t2", "attacks:0"));
  assert.equal(errors().at(-1), "Herói está inconsciente e não pode atacar.");
});

test("turno obrigatório: com a iniciativa aberta, jogador só ataca na vez dele", (t) => {
  dice(t, 10);
  const { camp, ana, errors } = setup();
  camp.colls.settings.main.turns = { open: true, current: 0, round: 1, entries: [{ id: "e1", name: "Orc", value: 15, graphicId: "t2" }, { id: "e2", name: "Herói", value: 10, graphicId: "t1" }] };
  ana.msg(hit("t1", "t2", "attacks:0"));
  assert.equal(errors().at(-1), "Não é a vez de Herói (vez de Orc).");
  camp.colls.settings.main.turns.current = 1;
  ana.msg(hit("t1", "t2", "attacks:0"));
  assert.equal(camp.colls.characters.orc.data.hp, 10);
});

test("granada: resistência de Destreza na área; quem passa leva metade; a granada é gasta", (t) => {
  dice(t, 5); // resistências: 1d20 = 5 contra CD 12 → falham; dano 3d6 = 15
  const { camp, ana, errors, texts } = setup();
  camp.colls.graphics.g1.x = 70 * 5; // 7,5 m: dentro dos 9 m
  camp.colls.graphics.g2.x = 70 * 6;
  ana.msg(hit("t1", "g1", "attacks:2", { how: "save", save: "des", area: 1.5, also: [{ graphicId: "g2" }, { graphicId: "t2" }] }));
  assert.deepEqual(errors(), []);
  assert.equal(camp.colls.graphics.g1.bar!.value, 0);
  assert.equal(camp.colls.graphics.g2.bar!.value, 0);
  assert.equal(camp.colls.characters.orc.data.hp, 15); // longe da explosão: fica de fora
  assert.equal((camp.colls.characters.heroi.data.attacks as { qtd: number }[])[2].qtd, 0);
  assert.match(texts()[0], /^Herói: Granada → Goblin, Goblin 2 \(7,5 m\) · resistência de Destreza CD 12 · restam 0$/);
  assert.match(texts()[1], /^Goblin: falhou na resistência → 15 · caiu!$/);
});

test("resistência que passa leva metade", (t) => {
  dice(t, 15);
  const { camp, gm } = setup();
  gm.msg(hit("t1", "t2", "attacks:2", { how: "save", save: "des" })); // orc: 1d20(15) + 1 = 16 ≥ 12 → metade de 18 = 9
  assert.equal(camp.colls.characters.orc.data.hp, 6);
});

test("PV temporário absorve primeiro", (t) => {
  dice(t, 10);
  const { camp, ana } = setup();
  ana.msg(hit("t1", "og", "attacks:0")); // 15 contra CA 11; dano 11: 4 nos temporários, 7 no PV
  assert.equal(camp.colls.characters.ogro.data.hp_temp, 0);
  assert.equal(camp.colls.characters.ogro.data.hp, 23);
});

test("Ordem Paranormal: o teste conta (antes acertava sempre); crítico pela margem multiplica os dados", (t) => {
  const { camp, gm } = setup();
  camp.colls.characters.agente = {
    id: "agente", name: "Agente", template: "ordem", controlledBy: [], shared: false,
    data: { hp: 20, hp_max: 20, agi: 1, ataques: [{ name: "Faca", attr: 2, bonus: 0, dmg: "1d4", crit: "19/x3", alcance: "corpo a corpo" }] },
  };
  camp.colls.graphics.ag = { id: "ag", pageId: "p1", layer: "tokens", z: 0, kind: "token", x: 0, y: 140, w: 70, h: 70, controlledBy: [], characterId: "agente" } as never;
  const m1 = dice(t, 1);
  gm.msg(hit("ag", "og", "ataques:0")); // 2d20kh1 = 1 → falha
  assert.equal(camp.colls.characters.ogro.data.hp, 30);
  m1.mock.restore();
  dice(t, 19);
  gm.msg(hit("ag", "og", "ataques:0")); // 19 ≥ CA 11, margem 19 → crítico: 3d4 = 12 (4 nos temporários)
  assert.equal(camp.colls.characters.ogro.data.hp, 22);
});

test("Call of Cthulhu: a perícia da arma conta", (t) => {
  const { camp, gm } = setup();
  camp.colls.characters.inv = {
    id: "inv", name: "Investigadora", template: "coc7e", controlledBy: [], shared: false,
    data: { hp: 10, hp_max: 10, weapons: [{ name: "Revólver", skill: 50, dmg: "1d10", range: "15 m" }] },
  };
  camp.colls.graphics.iv = { id: "iv", pageId: "p1", layer: "tokens", z: 0, kind: "token", x: 140, y: 140, w: 70, h: 70, controlledBy: [], characterId: "inv" } as never;
  dice(t, 10); // d100 = 99: falha
  gm.msg(hit("iv", "og", "weapons:0"));
  assert.equal(camp.colls.characters.ogro.data.hp, 30);
});

// ─── Custo (mana, PE, PM, espaços) e consumíveis ─────────────────────────────

test("custo das magias e habilidades: texto da ficha, coluna PE/PM, espaço do círculo, pontos de Força", async () => {
  const { resourceField } = await import("../shared/combat.ts");
  const { SW5E } = await import("../client/sheets/templates.ts");
  const cost = (t: Parameters<typeof sheetActions>[0], data: Record<string, unknown>) => sheetActions(t, data).map((a) => a.cost && [a.cost.field, a.cost.amount, a.cost.label]);
  assert.deepEqual(cost(NIGHTFALL, { habilidades: [
    { name: "Bola de Fogo", custo: "3 mana", dano: "6d6" },
    { name: "Fúria", custo: "1/descanso", dano: "1d6" },
    { name: "Contramágica", custo: "2 mana, reação", teste: "1d20 + 4", dano: "1d4" },
  ] }), [["mana", 3, "3 mana"], undefined, ["mana", 2, "2 mana"]]);
  assert.deepEqual(cost(ORDEM, { rituais: [{ name: "Decadência", custo: 2, efeito: "2d8" }] }), [["pe", 2, "2 PE"]]);
  assert.deepEqual(cost(T20, { magias: [{ name: "Seta Infalível", pm: 1, efeito: "2d4" }] }), [["pm", 1, "1 PM"]]);
  assert.deepEqual(cost(DND5E, { spells: [{ name: "Bola de Fogo", level: 3, dmg: "8d6" }, { name: "Raio de Fogo", level: 0, dmg: "1d10" }] }), [["slot3", 1, "1 espaço de 3º círculo"], undefined]);
  assert.deepEqual(cost(SW5E, { force_powers: [{ name: "Raio da Força", level: 2, dmg: "3d8" }] }), [["force_points", 2, "2 pontos de Força"]]);
  // nomes de recurso nas fichas de cada sistema
  assert.equal(resourceField(T20, "Mana"), "pm");
  assert.equal(resourceField(ORDEM, "PE"), "pe");
  assert.equal(resourceField(NIGHTFALL, "mana"), "mana");
  assert.equal(resourceField(DND5E, "PV"), "hp");
  assert.equal(resourceField(DND5E, "Mana"), undefined);
});

function caster(camp: CampaignFile, mana: number) {
  camp.colls.characters.maga = {
    id: "maga", name: "Maga", template: "nightfall", controlledBy: ["ana"], shared: false,
    data: { hp: 10, hp_max: 10, mana, mana_max: 8, habilidades: [{ name: "Bola de Fogo", custo: "3 mana", dano: "6d6" }] },
  };
  camp.colls.graphics.mg = { id: "mg", pageId: "p1", layer: "tokens", z: 0, kind: "token", x: 0, y: 140, w: 70, h: 70, controlledBy: ["ana"], characterId: "maga" } as never;
}

test("magia gasta mana; sem mana suficiente não sai", (t) => {
  dice(t, 2);
  const { camp, ana, errors, texts } = setup();
  caster(camp, 2);
  ana.msg(hit("mg", "og", "habilidades:0"));
  assert.equal(errors().at(-1), "Maga não tem 3 mana para Bola de Fogo (tem 2).");
  assert.equal(camp.colls.characters.ogro.data.hp, 30);
  camp.colls.characters.maga.data.mana = 5;
  ana.msg(hit("mg", "og", "habilidades:0")); // acerta sozinho: 6d6 = 12, 4 nos temporários
  assert.equal(camp.colls.characters.maga.data.mana, 2);
  assert.equal(camp.colls.characters.ogro.data.hp, 22);
  assert.match(texts()[0], /gastou 3 mana \(mana: 2\)/);
});

const drink = (row: number, extra: Record<string, unknown> = {}) => ({ t: "consume", characterId: "heroi", list: "consumiveis", row, ...extra });

test("consumir poção: rola o efeito no servidor, cura até o máximo e gasta 1; valor fixo também", (t) => {
  dice(t, 4);
  const { camp, ana, errors, texts } = setup();
  const h = camp.colls.characters.heroi.data;
  h.hp = 5;
  h.consumiveis = [{ name: "Poção de cura pequena", qtd: 2, efeito: "2d4+2", recurso: "PV" }, { name: "Tônico", qtd: 1, efeito: "3", recurso: "" }];
  ana.msg(drink(0)); // 2d4+2 = 10, mas o máximo é 12
  assert.deepEqual(errors(), []);
  assert.equal(h.hp, 12);
  assert.equal(camp.colls.graphics.t1.bar!.value, 12);
  assert.equal((h.consumiveis as { qtd: number }[])[0].qtd, 1);
  assert.equal(texts()[0], "Herói usou Poção de cura pequena: +7 PV (12/12) — chegou ao máximo · restam 1 · Turno inteiro");
  h.hp = 4;
  ana.msg(drink(1)); // fixo, recurso em branco = PV
  assert.equal(h.hp, 7);
  ana.msg(drink(1));
  assert.equal(errors().at(-1), "Tônico: acabou.");
});

test("poção de mana enche a mana (Nightfall); em D&D, que não tem mana, avisa; ficha dos outros, não", (t) => {
  dice(t, 4);
  const { camp, gm, ana, errors } = setup();
  caster(camp, 1);
  camp.colls.characters.maga.data.consumiveis = [{ name: "Poção de mana pequena", qtd: 1, efeito: "1d4+1", recurso: "Mana" }];
  ana.msg({ t: "consume", characterId: "maga", list: "consumiveis", row: 0 });
  assert.equal(camp.colls.characters.maga.data.mana, 6);
  camp.colls.characters.heroi.data.consumiveis = [{ name: "Poção de mana", qtd: 1, efeito: "5", recurso: "" }];
  ana.msg(drink(0));
  assert.equal(errors().at(-1), "A ficha de Herói não tem mana.");
  camp.colls.characters.ogro.data.consumiveis = [{ name: "Poção", qtd: 1, efeito: "5", recurso: "PV" }];
  ana.msg({ t: "consume", characterId: "ogro", list: "consumiveis", row: 0 });
  assert.equal(errors().at(-1), "Essa ficha não é sua.");
  gm.msg({ t: "consume", characterId: "ogro", list: "consumiveis", row: 0 }); // o mestre pode
  assert.equal((camp.colls.characters.ogro.data.consumiveis as { qtd: number }[])[0].qtd, 0);
});

test("consumíveis não aparecem como ataque; compêndio D&D tem poções de cura e de mana com efeito", async () => {
  assert.deepEqual(sheetActions(DND5E, { consumiveis: [{ name: "Poção", qtd: 1, efeito: "2d4+2", recurso: "PV" }] }), []);
  const { compendium } = await import("../server/compendium/index.ts");
  const items = JSON.parse(compendium("items-dnd")!) as { id: string; name: string; use?: { expr: string; res: string } }[];
  assert.deepEqual(items.find((i) => i.id === "magic-potion-of-healing-greater")?.use, { expr: "4d4+4", res: "PV", turn: "Turno inteiro" });
  const mine = items.filter((i) => i.id.startsWith("mesa-"));
  assert.equal(mine.length, 12);
  assert.deepEqual(mine.filter((i) => i.use!.res === "Mana").map((i) => i.use!.expr), ["1d4+1", "2d4+2", "4d4+4", "2", "5", "10"]);
});

test("uso do consumível: turno inteiro, ação bônus, livre", async () => {
  const { itemTiming } = await import("../shared/combat.ts");
  assert.deepEqual(["Turno inteiro", "", "Ação", "Ação bônus", "movimento", "Livre", "Reação"].map(itemTiming), ["turn", "turn", "turn", "inTurn", "inTurn", "free", "free"]);
});

test("iniciativa aberta: poção de turno inteiro só na vez e gasta o turno; bônus não gasta; livre a qualquer hora", (t) => {
  dice(t, 10); // ataque: 10 + 5 contra CA 13
  const { camp, ana, errors } = setup();
  const h = camp.colls.characters.heroi.data;
  h.hp = 2;
  h.consumiveis = [
    { name: "Poção de cura média", qtd: 3, efeito: "4", recurso: "PV", uso: "Turno inteiro" },
    { name: "Tônico", qtd: 3, efeito: "1", recurso: "PV", uso: "Ação bônus" },
    { name: "Gole de emergência", qtd: 3, efeito: "1", recurso: "PV", uso: "Livre" },
  ];
  const turns = camp.colls.settings.main.turns = { open: true, current: 0, round: 1, entries: [{ id: "e1", name: "Orc", value: 15, graphicId: "t2" }, { id: "e2", name: "Herói", value: 10, graphicId: "t1" }] };
  ana.msg(drink(0));
  assert.equal(errors().at(-1), "Não é a vez de Herói (vez de Orc). Poção de cura média (Turno inteiro) só pode ser usado na sua vez.");
  ana.msg(drink(2)); // livre: fora da vez
  assert.equal(h.hp, 3);
  turns.current = 1;
  ana.msg(drink(1)); // ação bônus: não gasta o turno
  ana.msg(hit("t1", "t2", "attacks:0"));
  assert.equal(camp.colls.characters.orc.data.hp, 10);
  ana.msg(drink(0)); // turno inteiro: depois disso não ataca nem usa outra coisa da vez
  assert.equal(h.hp, 8);
  ana.msg(hit("t1", "t2", "attacks:0"));
  assert.equal(errors().at(-1), "Herói já gastou o turno (Poção de cura média).");
  ana.msg(drink(1));
  assert.equal(errors().at(-1), "Herói já gastou o turno (Poção de cura média).");
  assert.equal(camp.colls.characters.orc.data.hp, 10);
  turns.round = 2; // próxima rodada, vez dele de novo
  ana.msg(hit("t1", "t2", "attacks:0"));
  assert.equal(camp.colls.characters.orc.data.hp, 5);
});

test("Star Wars (vocações): poder da Força gasta Pontos de Força = nível", async () => {
  const { SWCW } = await import("../client/sheets/templates.ts");
  const [a] = sheetActions(SWCW, { force_points: 4, poderes: [{ name: "Empurrão da Força", level: 2, dmg: "2d6" }] });
  assert.deepEqual(a.cost, { field: "force_points", amount: 2, label: "2 pontos de Força" });
});
