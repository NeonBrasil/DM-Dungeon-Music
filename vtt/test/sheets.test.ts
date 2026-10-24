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

test("ids de campo não se repetem dentro de um modelo", () => {
  for (const t of BUILTIN) {
    const ids = t.sections.flatMap((s) => s.fields.map((f) => f.id).filter(Boolean));
    assert.equal(new Set(ids).size, ids.length, t.id);
  }
});

test("importa a página HTML do criador SW e os números batem", async () => {
  const { parseSheetHtml } = await import("../client/sheets/importHtml.ts");
  const { SWCW } = await import("../client/sheets/templates.ts");
  const row = (n: string, v: string, d: string) => `<tr><td>${n}</td><td style="text-align:right;">${v}</td><td style="color:#8a7d5a;">${d}</td></tr>`;
  const stat = (n: string, v: number) => `<div class="stat"><div class="name">${n}</div><div class="val">${v}</div><div class="mod">x</div></div>`;
  const html = `<h1>Kel Varo</h1><div class="meta"><div><strong>JOGADOR</strong><br>Ana &amp; Bia</div><div><strong>ESPÉCIE</strong><br>Cathar</div>
    <div><strong>VOCAÇÃO</strong><br>Mandaloriano</div><div><strong>NÍVEL</strong><br>5 <span>(6500 XP)</span></div></div>
    <h2>ATRIBUTOS</h2><div class="grid">${stat("FOR", 16)}${stat("DES", 14)}${stat("CON", 14)}${stat("INT", 12)}${stat("SAB", 10)}${stat("CAR", 8)}</div>
    <h2>COMBATE</h2>
    <p><strong>HP:</strong> 30 &nbsp;|&nbsp; <strong>Proficiência:</strong> +3 &nbsp;|&nbsp; <strong>Velocidade:</strong> 11m &nbsp;|&nbsp; <strong>Tamanho:</strong> Médio</p>
    <table>${row("Blaster", "+8", "mod +2 · prof +3 · aptidão +3")}${row("Uso da Força", "+0", "mod +0 · sem treinamento")}</table>
    <h2>PERÍCIAS</h2><table>${row("★ Sigilo", "+6", "mod +2 · treino +3 · vocação +1")}${row("Pilotagem", "+3", "mod +2 · vocação +1")}${row("Dança", "+1", "mod +1")}</table>
    <h2>COMO ESTES NÚMEROS FUNCIONAM</h2><div class="nota">…</div>
    <h2>TRAITS DE ORIGEM</h2><ul><li>Garras retráteis</li><li>Faro caçador</li></ul>
    <h2>EQUIPAMENTO</h2><p><strong>Sabres:</strong></p><ul><li>(nenhum — ainda não conquistou)</li></ul><p><strong>Blasters:</strong></p><ul><li>Pistola WESTAR-34</li></ul>
    <p><strong>Utilitários:</strong></p><ul><li>Jetpack</li><li>Visor noturno</li></ul>
    <h2>ALINHAMENTO MORAL</h2><div class="badge">Inclinado à Luz</div><p>Pontuação: <strong>-7</strong> <span>(criação -7)</span></p>
    <h2>HISTÓRIA</h2><p><strong>Aparência:</strong> Alto.</p><p><strong>Background:</strong> Linha 1.\n\nLinha 2.</p>
    <p style="text-align:center">QUE A FORÇA ESTEJA COM VOCÊ</p>
    <div class="dados">DADOS DA FICHA:<br>&lt;&lt;&lt;SWFICHA:v2:e30=&gt;&gt;&gt;</div>`;
  const s = parseSheetHtml(html)!;
  const { resolve } = resolver(SWCW, s.data);
  assert.equal(s.name, "Kel Varo");
  assert.equal(s.template, "swcw");
  assert.equal(s.data.jogador, "Ana & Bia");
  assert.equal(s.data.nivel, 5);
  assert.equal(s.data.xp, 6500);
  assert.equal(resolve("pb"), 3);
  assert.equal(s.data.hp_max, 30);
  assert.equal(s.data.deslocamento, "11m");
  assert.equal(resolve("atk_blaster"), 8);
  assert.equal(s.data.atk_blaster_bonus, 3);
  assert.equal(resolve("atk_forca"), 0);
  assert.equal(s.data.atk_forca_prof, 0);
  assert.equal(resolve("sigilo"), 6);
  assert.equal(s.data.sigilo_prof, 1);
  assert.equal(resolve("pilotagem"), 3);
  assert.equal(s.data.alinhamento, -7);
  assert.equal(s.data.tracos, "Garras retráteis\nFaro caçador");
  assert.deepEqual(s.data.armas, [{ name: "Pistola WESTAR-34", atk: "@{atk_blaster}", dmg: "", kind: "Blasters" }]);
  assert.equal(s.data.equipamento, "Utilitários: Jetpack, Visor noturno");
  assert.equal(s.data.background, "Linha 1.\n\nLinha 2.");
  assert.match(String(s.data.notes), /Dança: \+1/); // perícia que o modelo não tem não se perde
  assert.equal(parseSheetHtml("<html><body>outra coisa</body></html>"), null);
});
