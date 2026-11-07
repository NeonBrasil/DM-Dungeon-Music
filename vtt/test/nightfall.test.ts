import { test } from "node:test";
import assert from "node:assert/strict";
import { expand, resolver } from "../client/sheets/engine.ts";
import { NIGHTFALL } from "../client/sheets/templates.ts";
import { parse } from "../shared/dice.ts";
import { CLASSES, RACES, hpMax, manaMax, mod, parseTrait, totalPoints, traitLine } from "../client/nightfall/rules.ts";
import { classAbilities, derived, fromData, newState, pickRace, toData, type NfState } from "../client/nightfall/state.ts";
import { isOldSheet, parseOldHtml, parseOldTxt } from "../client/nightfall/importOld.ts";
import { NATIONS } from "../client/nightfall/world.ts";

const elfMage = (): NfState => {
  const s = pickRace({ ...newState(), nome: "Lyra Noctis", classe: "mago", nivel: 4 }, "elfo");
  s.atributos = { ...s.atributos, int: 13, des: 12 }; // base INT 10, DES 10 + 5 pontos
  return s;
};

test("contas iguais às do criador antigo", () => {
  // calcularPVMaximo / calcularManaMaximo / pontos do criador antigo
  assert.equal(hpMax(1, 8), 6);
  assert.equal(hpMax(4, 6), 14);
  assert.equal(hpMax(1, 1), 2); // mod(1) = −5
  assert.equal(manaMax(4, "mago", elfMage().atributos), 3 + 1 + 6);
  assert.equal(manaMax(4, "guerreiro", elfMage().atributos), 0);
  assert.equal(totalPoints(1), 4);
  assert.equal(totalPoints(6), 6);
  assert.equal(Object.values(RACES).filter((r) => r.grupo === "originais").length, 19);
});

test("pontos de atributo: gastos a partir da base da raça", () => {
  const d = derived(elfMage());
  assert.equal(d.pontos, 5);
  assert.equal(d.livres, 0);
  assert.equal(d.ca, 11);
  assert.equal(d.bt, 2);
});

test("raças proíbem só classes que existem; trocar raça solta classe proibida", () => {
  for (const [id, r] of Object.entries(RACES)) for (const c of r.proibidas) assert.ok(CLASSES[c], `${id}: ${c}`);
  const s = pickRace({ ...newState(), classe: "guerreiro" }, "elfo");
  assert.equal(s.classe, "");
  assert.deepEqual(s.atributos, RACES.elfo.base);
});

test("toda habilidade vira rolagem válida na ficha, em todo nível", () => {
  for (const cid of Object.keys(CLASSES)) {
    for (let n = 1; n <= 20; n++) {
      const data = toData({ ...newState(), classe: cid, nivel: n });
      for (const row of classAbilities(cid, n)) {
        for (const k of ["teste", "dano"] as const) {
          if (!row[k]) continue;
          const expr = expand(NIGHTFALL, data, "@{.x}", { x: row[k] });
          assert.doesNotThrow(() => parse(expr), `${cid} nv${n} ${row.name}: ${row[k]} → ${expr}`);
        }
      }
    }
  }
});

test("ficha: atributo-chave, treino e resistências da classe", () => {
  const data = toData(elfMage());
  const { resolve } = resolver(NIGHTFALL, data);
  assert.equal(resolve("int_mod"), 1);
  assert.equal(resolve("atq_hab"), 2 + 1);
  assert.equal(resolve("cd"), 8 + 3);
  assert.equal(resolve("save_int"), 1 + 2);
  assert.equal(resolve("save_for"), mod(5) - 1); // "Fisicamente fraco [res.for-1]"
  assert.equal(resolve("ca"), 11);
  assert.equal(data.hp_max, 14);
  assert.equal(data.raca, "Elfo");
  assert.equal((data.habilidades as unknown[]).length, 3);
});

test("ida e volta: criador → ficha → criador", () => {
  const s = {
    ...elfMage(), dano: 4, manaGasta: 3, cicatrizes: [{ name: "Olho perdido", efeito: "x" }], historia: "Nasceu numa torre.",
    origem: "chegado", era: "outra", eraOutra: "Japão feudal",
  };
  const back = fromData(s.nome, undefined, toData(s));
  for (const k of ["raca", "classe", "nivel", "atributos", "dano", "manaGasta", "cicatrizes", "historia", "origem", "era", "eraOutra"] as const) {
    assert.deepEqual(back[k], s[k], k);
  }
  assert.equal(toData(s).origem, "Chegado · Japão feudal");
});

test("marcadores de efeito nos traços", () => {
  assert.deepEqual(parseTrait("Casco natural (armadura grátis) [ca+2]"), { text: "Casco natural (armadura grátis)", effect: { ca: 2 } });
  assert.deepEqual(parseTrait("Resistência mental [res.int+1] [res.sab+1]").effect, { res: { int: 1, sab: 1 } });
  assert.equal(traitLine("Reflexos [init+1] [ca+1]"), "Reflexos — CA +1, Iniciativa +1");
  assert.equal(traitLine("Só texto"), "Só texto");
  // nenhum traço com marcador quebrado (sobrando "[" no texto)
  for (const t of Object.values(RACES).flatMap((r) => [...r.vantagens, ...r.fraquezas])) assert.ok(!parseTrait(t).text.includes("["), t);
});

test("vantagens e fraquezas mexem na ficha: Tortle (CA +2, iniciativa −1)", () => {
  const s = pickRace({ ...newState(), classe: "guerreiro" }, "tortle");
  const data = toData(s);
  const { resolve } = resolver(NIGHTFALL, data);
  assert.equal(resolve("ca"), 10 + mod(3) + 2);
  assert.equal(resolve("init"), mod(3) - 1);
  assert.match(String(data.tracos_raca), /Casco natural \(armadura grátis\) — CA \+2/);
});

test("origem e era: chegado da Grande Guerra, nativo da Terra Oca", () => {
  const base = pickRace({ ...newState(), classe: "guerreiro" }, "humano");
  const war = derived({ ...base, origem: "chegado", era: "guerras" });
  assert.equal(war.hpMax, hpMax(1, 8) + 3);               // Veterano de trincheira
  assert.equal(war.destinoMax, 1 + 1);                    // O tempo te deve uma
  assert.equal(war.fx.res.sab, -2);                       // desorientado + trauma
  const data = toData({ ...base, origem: "chegado", era: "guerras" });
  assert.equal(resolver(NIGHTFALL, data).resolve("save_sab"), mod(8) - 2);
  assert.equal(data.origem, "Chegado · Grandes Guerras");
  assert.match(String(data.tracos_origem), /\+ Veterano de trincheira — PV \+3/);
  const deep = toData({ ...base, origem: "inferior" });
  const r = resolver(NIGHTFALL, deep).resolve;
  assert.equal(r("save_sab"), mod(8) + 1);                // já encarou o impossível
  assert.equal(r("save_car"), mod(8) - 1);                // "coisa lá de baixo"
  // era só vale para chegados
  assert.equal(derived({ ...base, origem: "superior", era: "guerras" }).hpMax, hpMax(1, 8) + 2);
});

test("nação e facção vão para a ficha e voltam para o criador", () => {
  const s = { ...pickRace(newState(), "humano"), origem: "superior", nacao: "verdanth", faccao: "invect" };
  const data = toData(s);
  assert.equal(data.nacao, "Verdanth");
  assert.equal(data.faccao, "Invect");
  const back = fromData("x", undefined, data);
  assert.equal(back.nacao, "verdanth");
  assert.equal(back.faccao, "invect");
  // nação da Terra Inferior sem facções
  assert.equal(toData({ ...s, origem: "inferior", nacao: "avarnheim", faccao: "" }).nacao, "Avarnheim");
  // Grokkar: centenas de bandos, a facção é escrita à mão (e volta para o criador)
  const grok = toData({ ...s, nacao: "grokkar", faccao: "", faccaoOutra: "  Dentes de Ferro " });
  assert.equal(grok.faccao, "Dentes de Ferro");
  assert.equal(fromData("x", undefined, grok).faccaoOutra, "  Dentes de Ferro ");
  // em nação com lista fechada o texto solto não vale
  assert.equal(toData({ ...s, faccao: "", faccaoOutra: "Qualquer" }).faccao, "");
  assert.equal(NATIONS.nexum.terra, "inferior");
  // toda nação aparece dentro do mapa
  for (const [id, n] of Object.entries(NATIONS)) assert.ok(n.pos.every((v) => v > 0 && v < 100), id);
});

test("subir de nível mantém dano, ataques e habilidades escritas à mão", () => {
  const s = { ...elfMage(), dano: 4 };
  const prev = toData(s);
  prev.attacks = [{ name: "Cajado", atk: "@{for_mod} + @{bt}", dmg: "1d6" }];
  prev.habilidades = [...(prev.habilidades as Record<string, unknown>[]), { name: "Truque da avó", custo: "", efeito: "", teste: "", dano: "" }];
  const next = toData({ ...fromData(s.nome, undefined, prev), nivel: 5 }, prev);
  const habs = next.habilidades as Record<string, unknown>[];
  assert.equal(next.hp_max, 17);
  assert.equal(next.hp, 13);
  assert.deepEqual(next.attacks, prev.attacks);
  assert.ok(habs.some((h) => String(h.name).startsWith("Bola de Fogo")));
  assert.ok(habs.some((h) => h.name === "Truque da avó"));
  assert.equal(habs.filter((h) => String(h.name).startsWith("Conjuração Arcana")).length, 1);
});

// ─── Fichas do criador antigo (mesmo formato que ele gerava) ────────────────

const OLD_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ficha de Personagem - Lyra Noctis</title>
</head>
<body>
  <h1>🎲 FICHA DE PERSONAGEM - D&D 5e 🎲</h1>

  <div class="section">
    <h2>📋 Informações Básicas</h2>
    <div class="info-grid">
      <div class="info-item"><strong>Nome:</strong> Lyra Noctis</div>
      <div class="info-item"><strong>Jogador:</strong> Ana</div>
      <div class="info-item"><strong>Raça:</strong> Elfo</div>
      <div class="info-item"><strong>Classe:</strong> Mago</div>
      <div class="info-item"><strong>Nível:</strong> 4</div>
      <div class="info-item"><strong>XP:</strong> 3000 / 6,500</div>
      <div class="info-item"><strong>Alinhamento:</strong> Caótico e Bom</div>
      <div class="info-item"><strong>Antecedência:</strong> Sábio</div>
      <div class="info-item"><strong>Idade:</strong> 120 anos</div>
      <div class="info-item"><strong>Peso:</strong> ___</div>
    </div>
  </div>

  <div class="section atributos">
    <h2>⚔️ Estatísticas de Combate</h2>
    <div class="info-grid">
      <div class="info-item"><strong>PV:</strong> 10 / 14</div>
      <div class="info-item"><strong>CA:</strong> 11</div>
      <div class="info-item"><strong>Mana:</strong> 7 / 10</div>
    </div>
  </div>

  <div class="section vantagens">
    <h2>✅ Vantagens Raciais</h2>
    <ul>
      <li class="advantage">Visão no escuro</li><li class="advantage">Imune a sono mágico</li>
    </ul>
  </div>

  <div class="section atributos">
    <h2>💪 Atributos e Modificadores</h2>
    <div class="attributes">
      ${[["Força", 5], ["Destreza", 12], ["Constituição", 6], ["Inteligência", 13], ["Sabedoria", 9], ["Carisma", 8], ["Sorte", 7]].map(([n, v]) => `<div class="attribute">
          <strong>${n}:</strong>
          <span>${v} (${mod(Number(v)) >= 0 ? "+" : ""}${mod(Number(v))})</span>
        </div>`).join("")}
    </div>
  </div>

  <div class="section">
    <h2>🎒 Inventário</h2>
    <p>Cajado
Grimório</p>
  </div>

  <div class="section magias">
    <h2>✨ Magias e Habilidades</h2>
    <p>Mísseis Mágicos</p>
      <p style="margin-top: 12px;"><strong>Habilidades de Classe:</strong> Conjuração Arcana, Arcane Recovery, Ritual Casting</p>
  </div>

  <div class="section fraquezas">
    <h2>⚠️ Fraquezas</h2>
      <p><strong>Fraquezas Raciais:</strong></p>
      <ul>
        <li class="weakness">Fisicamente fraco</li>
      </ul>
      <p style="margin-top: 12px;"><strong>Fraquezas Adicionais:</strong></p>
      <p>Medo de altura</p>
  </div>

  <div class="section personalidade">
    <h2>🎭 Personalidade</h2>
      <p><strong>Ideais:</strong></p>
      <p>Conhecimento acima de tudo</p>
      <p style="margin-top: 12px;"><strong>Traços de Personalidade:</strong></p>
      <p>Fala sozinho</p>
  </div>

  <div class="section">
    <h2>📜 História do Personagem</h2>
    <p>Nasceu numa torre.

Fugiu.</p>
  </div>

  <div class="footer">
    Ficha gerada em 01/11/2026 às 20:00:00
  </div>
</body>
</html>`;

const OLD_TXT = `FICHA DE PERSONAGEM - D&D 5e
═══════════════════════════════════════════════════════════════════

INFORMAÇÕES BÁSICAS

Nome do Personagem: Lyra Noctis
Jogador: Ana
Raça: Elfo
Classe: Mago
Nível: 4     XP Atual: 3000     XP para Próximo Nível: 6500

Alinhamento: Caótico e Bom
Antecedência: Sábio
Idade: 120     Peso: ___

═══════════════════════════════════════════════════════════════════

ESTATÍSTICAS DE COMBATE

PV: 10 / 14     CA: 11     Mana: 7 / 10

═══════════════════════════════════════════════════════════════════

VANTAGENS RACIAIS

✓ Visão no escuro

═══════════════════════════════════════════════════════════════════

ATRIBUTOS E MODIFICADORES

Força            5  (-3)
Destreza        12  (+1)
Constituição     6  (-2)
Inteligência    13  (+1)
Sabedoria        9  (-1)
Carisma          8  (-1)
Sorte            7  (-2)

Pontos Investidos: 5/4

═══════════════════════════════════════════════════════════════════

INVENTÁRIO

Cajado
Grimório

═══════════════════════════════════════════════════════════════════

MAGIAS E HABILIDADES

Mísseis Mágicos

Habilidades de Classe: Conjuração Arcana, Arcane Recovery, Ritual Casting

═══════════════════════════════════════════════════════════════════

FRAQUEZAS

Fraquezas Raciais:
• Fisicamente fraco

Fraquezas Adicionais:
Medo de altura

═══════════════════════════════════════════════════════════════════

PERSONALIDADE

Ideais:
Conhecimento acima de tudo

Traços de Personalidade:
Fala sozinho

═══════════════════════════════════════════════════════════════════

HISTÓRIA DO PERSONAGEM

Nasceu numa torre.

Fugiu.

═══════════════════════════════════════════════════════════════════

Ficha gerada em 01/11/2026`;

for (const [kind, parseFn, text] of [["html", parseOldHtml, OLD_HTML], ["txt", parseOldTxt, OLD_TXT.replace(/\n/g, "\r\n")]] as const) {
  test(`importa ficha antiga (${kind})`, () => {
    assert.ok(isOldSheet(text));
    const s = parseFn(text);
    assert.equal(s.nome, "Lyra Noctis");
    assert.equal(s.jogador, "Ana");
    assert.equal(s.raca, "elfo");
    assert.equal(s.classe, "mago");
    assert.equal(s.nivel, 4);
    assert.equal(s.xp, 3000);
    assert.equal(s.alinhamento, "Caótico e Bom");
    assert.equal(s.antecedente, "Sábio");
    assert.equal(s.idade, "120");
    assert.equal(s.peso, "");
    assert.deepEqual(s.atributos, { for: 5, des: 12, con: 6, int: 13, sab: 9, car: 8, sor: 7 });
    assert.equal(s.inventario, "Cajado\nGrimório");
    assert.equal(s.magias, "Mísseis Mágicos");
    assert.equal(s.fraquezasExtra, "Medo de altura");
    assert.equal(s.ideais, "Conhecimento acima de tudo");
    assert.equal(s.tracos, "Fala sozinho");
    assert.equal(s.historia, "Nasceu numa torre.\n\nFugiu.");
    // os números da ficha antiga continuam os mesmos
    const d = derived(s);
    assert.equal(d.hp, 10);
    assert.equal(d.hpMax, 14);
    assert.equal(d.mana, 7);
    assert.equal(d.manaMax, 10);
    assert.equal(d.ca, 11);
    assert.equal(d.livres, 0);
  });
}

test("ficha antiga vazia não traz os textos de preenchimento", () => {
  const txt = OLD_TXT.replace("Lyra Noctis", "___________________").replace("Cajado\nGrimório", "Nenhum item no inventário.")
    .replace("Medo de altura", "Nenhuma").replace("Fala sozinho", "Não definido.").replace("Nasceu numa torre.\n\nFugiu.", "A história ainda será escrita...");
  const s = parseOldTxt(txt);
  assert.equal(s.nome, "");
  assert.equal(s.inventario, "");
  assert.equal(s.fraquezasExtra, "");
  assert.equal(s.tracos, "");
  assert.equal(s.historia, "");
  assert.equal(isOldSheet("<html>outra coisa</html>"), false);
});
