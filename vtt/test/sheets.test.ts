import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultData, expand, resolver } from "../client/sheets/engine.ts";
import { BUILTIN, COC7E, DND5E, FREE } from "../client/sheets/templates.ts";
import { parse } from "../shared/dice.ts";
import type { SheetTemplate } from "../shared/types.ts";

test("D&D: modificador, proficiência e perícia", () => {
  const data = { ...defaultData(DND5E), str: 16, athletics_prof: 1, stealth_prof: 2, dex: 14 };
  const { resolve } = resolver(DND5E, data);
  assert.equal(resolve("str_mod"), 3);
  assert.equal(resolve("athletics"), 5);
  assert.equal(resolve("stealth"), 6); // especialista: 2 + 2×2
  assert.equal(expand(DND5E, data, "1d20 + @{athletics}"), "1d20 + 5");
});

test("modificador negativo vira (-1)", () => {
  const data = { ...defaultData(DND5E), str: 8 };
  assert.equal(expand(DND5E, data, "1d20 + @{str_mod}"), "1d20 + (-1)");
});

test("linha de ataque: acerto calculado e dano com dados", () => {
  const data = { ...defaultData(DND5E), str: 16 };
  const row = { name: "Espada", atk: "@{str_mod} + @{pb}", dmg: "1d8 + @{str_mod}" };
  assert.equal(expand(DND5E, data, "1d20 + @{.atk}", row), "1d20 + (3 + 2)");
  assert.equal(expand(DND5E, data, "@{.dmg}", row), "(1d8 + 3)");
  assert.doesNotThrow(() => parse(expand(DND5E, data, "@{.dmg}", row)));
});

test("CoC: valor da perícia e padrão", () => {
  const { resolve } = resolver(COC7E, { spot: 60 });
  assert.equal(resolve("spot"), 60);
  assert.equal(resolve("listen"), 20);
});

test("referência circular não trava", () => {
  const t: SheetTemplate = { id: "x", name: "x", sections: [{ title: "s", fields: [{ type: "computed", id: "a", formula: "@{b} + 1" }, { type: "computed", id: "b", formula: "@{a} + 1" }] }] };
  assert.doesNotThrow(() => resolver(t, {}).resolve("a"));
});

test("dados iniciais: recursos com máximo e listas vazias", () => {
  const d = defaultData(DND5E);
  assert.equal(d.hp, 10);
  assert.equal(d.hp_max, 10);
  assert.deepEqual(d.attacks, []);
  assert.deepEqual(defaultData(FREE).attrs, []);
});

test("toda rolagem dos modelos prontos vira expressão válida", () => {
  for (const t of BUILTIN) {
    const data = defaultData(t);
    for (const s of t.sections) {
      for (const f of s.fields) {
        if (f.roll && !f.check) assert.doesNotThrow(() => parse(expand(t, data, f.roll!)), `${t.id}.${f.id}: ${f.roll}`);
        for (const c of f.columns ?? []) {
          if (!c.roll || c.check) continue;
          const row = Object.fromEntries((f.columns ?? []).filter((x) => x.id).map((x) => [x.id!, x.default ?? (x.type === "number" ? 0 : "")]));
          assert.doesNotThrow(() => parse(expand(t, data, c.roll!, row)), `${t.id}.${f.id}.${c.id}: ${c.roll}`);
        }
      }
    }
  }
});

test("Ordem Paranormal: nº de d20 pelo atributo, 0 = pior de 2", async () => {
  const { opExpr } = await import("../client/sheets/engine.ts");
  assert.equal(opExpr(3, 5), "3d20kh1 + 5");
  assert.equal(opExpr(0, 0), "2d20kl1");
  assert.equal(opExpr(2, -1), "2d20kh1 - 1");
  assert.doesNotThrow(() => parse(opExpr(4, 10)));
});

test("Tormenta20: treino por nível e perícia treinada", async () => {
  const { T20 } = await import("../client/sheets/templates.ts");
  const at = (nivel: number) => resolver(T20, { ...defaultData(T20), nivel, des: 3, furt_prof: 1 }).resolve;
  assert.equal(at(1)("treino"), 2);
  assert.equal(at(7)("treino"), 4);
  assert.equal(at(15)("treino"), 6);
  assert.equal(at(7)("furt"), 3 + 3 + 4); // metade do nível + DES + treino
  assert.equal(at(7)("refl"), 3 + 3);     // sem treino
});

test("perguntas na rolagem ?{…}", async () => {
  const { parseQueries, fillQueries } = await import("../client/chat/prepare.ts");
  const qs = parseQueries("/r 1d20 + ?{Bônus|2} ?{Modo|Normal,1d20|Vantagem,2d20kh1} ?{Bônus|2}");
  assert.deepEqual(qs.map((q) => q.q), ["Bônus", "Modo"]);
  assert.equal(qs[0].def, "2");
  assert.deepEqual(qs[1].options, [["Normal", "1d20"], ["Vantagem", "2d20kh1"]]);
  assert.equal(fillQueries("/r 1d20 + ?{Bônus|2}", new Map([["Bônus", "5"]])), "/r 1d20 + 5");
});
