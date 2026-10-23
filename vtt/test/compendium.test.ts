// Compêndio do mestre: nomes aceitos pela rota e consistência dos dados (escritos à mão ou do SRD).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../shared/dice.ts";
import type { Item, Monster } from "../shared/compendium.ts";
import { compendium } from "../server/compendium/index.ts";
import { avg } from "../server/compendium/author.ts";

const load = <T>(name: string) => JSON.parse(compendium(name)!) as T[];
const mod = (v: number) => Math.floor((v - 10) / 2);

test("rota: só os quatro nomes conhecidos", () => {
  for (const n of ["bestiary-dnd", "bestiary-sw", "items-dnd", "items-sw"]) assert.ok(load(n).length > 0, n);
  for (const n of ["__proto__", "constructor", "hasOwnProperty", "spells", ""]) assert.equal(compendium(n), null, n);
});

test("média de dano como nos livros", () => {
  assert.equal(avg("2d6+3"), 10);
  assert.equal(avg("1d8+1d6"), 8);
  assert.equal(avg("1d4-1"), 1);
  assert.equal(avg("4d10"), 22);
});

test("bestiário Star Wars: ids únicos, dados válidos, bônus de ataque coerente", () => {
  const sw = load<Monster>("bestiary-sw");
  const dnd = new Set(load<Monster>("bestiary-dnd").map((m) => m.id));
  const ids = new Set<string>();
  for (const m of sw) {
    assert.ok(m.id.startsWith("sw-") && !ids.has(m.id) && !dnd.has(m.id), `id ${m.id}`);
    ids.add(m.id);
    assert.ok(m.group && m.xp > 0 && m.hp > 0 && m.token > 0, `campos de ${m.name}`);
    assert.equal(m.abil.length, 6, m.name);
    for (const a of m.actions) {
      if (a.dmg) assert.doesNotThrow(() => parse(a.dmg!), `${m.name}: ${a.name} (${a.dmg})`);
      // acerto = proficiência + modificador de algum atributo
      if (a.atk !== undefined) assert.ok(m.abil.some((v) => m.pb + mod(v) === a.atk), `${m.name}: ${a.name} +${a.atk}`);
    }
  }
});

test("itens: ids únicos; armas têm dano válido", () => {
  for (const name of ["items-dnd", "items-sw"]) {
    const items = load<Item>(name);
    assert.equal(new Set(items.map((i) => i.id)).size, items.length, name);
    for (const i of items) {
      assert.ok(i.name && i.cat, `${name}: ${i.id}`);
      if (i.abil) assert.ok(i.dmg, `${name}: ${i.id} sem dano`);
      if (i.dmg) assert.doesNotThrow(() => parse(i.dmg!), `${name}: ${i.id} (${i.dmg})`);
    }
  }
});
