// Modelos de ficha prontos. Todos usam o mesmo formato dos modelos criados pelo mestre.
// Convenção: o campo de vida tem id "hp" (recurso) — tokens vinculados sincronizam a barra com ele.
import type { SheetField, SheetSection, SheetTemplate } from "../../shared/types.ts";

const F = (type: SheetField["type"], id: string, label: string, extra: Partial<SheetField> = {}): SheetField => ({ type, id, label, ...extra });
const notes = (id: string, label: string): SheetField => F("textarea", id, label, { span: 99 });

// ─── Base D20 (D&D 5e e SW5e) ────────────────────────────────────────────────

const ABIL: [string, string][] = [["str", "FOR"], ["dex", "DES"], ["con", "CON"], ["int", "INT"], ["wis", "SAB"], ["cha", "CAR"]];
const ABIL_NAME: Record<string, string> = { str: "Força", dex: "Destreza", con: "Constituição", int: "Inteligência", wis: "Sabedoria", cha: "Carisma" };

function d20Skill(id: string, label: string, ab: string): SheetField {
  return F("skill", id, label, { ability: ABIL.find(([k]) => k === ab)![1], formula: `@{${ab}_mod} + @{pb} * @{${id}_prof}`, roll: `1d20 + @{${id}}` });
}

function d20Sections(opts: { identity: SheetField[]; skills: [string, string, string][]; extra: SheetSection[] }): SheetSection[] {
  return [
    { title: "Personagem", columns: 4, fields: [...opts.identity, F("number", "pb", "Bônus de proficiência", { default: 2 })] },
    {
      title: "Atributos",
      columns: 6,
      fields: ABIL.map(([k, abbr]) => F("attribute", k, abbr, { default: 10, formula: `floor((@{${k}} - 10) / 2)`, roll: `1d20 + @{${k}_mod}` })),
    },
    {
      title: "Combate",
      columns: 4,
      fields: [
        F("number", "ac", "Classe de armadura", { default: 10 }),
        F("computed", "init", "Iniciativa", { formula: "@{dex_mod} + @{init_bonus}", roll: "1d20 + @{init}", tracker: true }),
        F("text", "speed", "Deslocamento", { default: "9 m" }),
        F("number", "init_bonus", "Bônus de iniciativa", { default: 0 }),
        F("resource", "hp", "Pontos de vida", { default: 10 }),
        F("number", "hp_temp", "PV temporários", { default: 0 }),
        F("text", "hit_dice", "Dados de vida", { default: "1d8" }),
        F("text", "death", "Testes contra a morte", { default: "✓ 0 / ✗ 0" }),
      ],
    },
    {
      title: "Testes de resistência",
      columns: 2,
      fields: ABIL.map(([k, abbr]) => F("skill", `save_${k}`, ABIL_NAME[k], { ability: abbr, formula: `@{${k}_mod} + @{pb} * @{save_${k}_prof}`, roll: `1d20 + @{save_${k}}` })),
    },
    {
      title: "Perícias",
      columns: 2,
      fields: [
        ...opts.skills.map(([id, label, ab]) => d20Skill(id, label, ab)),
        F("computed", "passive", "Percepção passiva", { formula: "10 + @{perception}" }),
      ],
    },
    {
      title: "Ataques",
      fields: [
        F("list", "attacks", "Ataques", {
          span: 99,
          columns: [
            F("text", "name", "Nome"),
            F("text", "atk", "Acerto", { default: "@{str_mod} + @{pb}" }),
            F("text", "dmg", "Dano", { default: "1d8 + @{str_mod}" }),
            F("text", "kind", "Tipo"),
            F("roll", "r_atk", "Ataque", { roll: "1d20 + @{.atk}" }),
            F("roll", "r_dmg", "Dano", { roll: "@{.dmg}" }),
          ],
        }),
      ],
    },
    ...opts.extra,
  ];
}

const DND_SKILLS: [string, string, string][] = [
  ["acrobatics", "Acrobacia", "dex"], ["arcana", "Arcanismo", "int"], ["athletics", "Atletismo", "str"], ["performance", "Atuação", "cha"],
  ["deception", "Enganação", "cha"], ["stealth", "Furtividade", "dex"], ["history", "História", "int"], ["intimidation", "Intimidação", "cha"],
  ["insight", "Intuição", "wis"], ["investigation", "Investigação", "int"], ["animal", "Lidar com animais", "wis"], ["medicine", "Medicina", "wis"],
  ["nature", "Natureza", "int"], ["perception", "Percepção", "wis"], ["persuasion", "Persuasão", "cha"], ["sleight", "Prestidigitação", "dex"],
  ["religion", "Religião", "int"], ["survival", "Sobrevivência", "wis"],
];

const SW_SKILLS: [string, string, string][] = [
  ["acrobatics", "Acrobacia", "dex"], ["animal", "Adestrar animais", "wis"], ["athletics", "Atletismo", "str"], ["performance", "Atuação", "cha"],
  ["lore", "Conhecimento (Lore)", "int"], ["deception", "Enganação", "cha"], ["stealth", "Furtividade", "dex"], ["intimidation", "Intimidação", "cha"],
  ["insight", "Intuição", "wis"], ["investigation", "Investigação", "int"], ["medicine", "Medicina", "wis"], ["nature", "Natureza", "int"],
  ["perception", "Percepção", "wis"], ["persuasion", "Persuasão", "cha"], ["piloting", "Pilotagem", "int"], ["sleight", "Prestidigitação", "dex"],
  ["survival", "Sobrevivência", "wis"], ["technology", "Tecnologia", "int"],
];

const spellList = (id: string, label: string): SheetField =>
  F("list", id, label, {
    span: 99,
    columns: [F("text", "name", "Nome"), F("number", "level", "Nível"), F("text", "dmg", "Efeito / dano"), F("text", "notes", "Notas"), F("roll", "r", "Rolar", { roll: "@{.dmg}" })],
  });

const slots = Array.from({ length: 9 }, (_, i) => F("resource", `slot${i + 1}`, `Espaços ${i + 1}º`, { default: 0 }));

export const DND5E: SheetTemplate = {
  id: "dnd5e",
  name: "D&D 5e",
  builtin: true,
  advantage: true,
  sections: d20Sections({
    identity: [F("text", "class", "Classe e nível"), F("text", "race", "Raça"), F("text", "background", "Antecedente"), F("text", "alignment", "Tendência"), F("number", "xp", "XP", { default: 0 })],
    skills: DND_SKILLS,
    extra: [
      {
        title: "Magia",
        columns: 3,
        fields: [
          F("text", "spell_ability", "Atributo de conjuração"),
          F("number", "spell_dc", "CD de magia", { default: 10 }),
          F("text", "spell_atk", "Ataque mágico", { default: "@{pb} + @{int_mod}", roll: "1d20 + @{spell_atk}" }),
          ...slots,
          spellList("spells", "Magias"),
        ],
      },
      { title: "Equipamento e moedas", columns: 5, fields: [F("number", "cp", "PC"), F("number", "sp", "PP"), F("number", "ep", "PE"), F("number", "gp", "PO"), F("number", "pp", "PL"), notes("equipment", "Equipamento")] },
      { title: "Características", fields: [notes("features", "Características e talentos"), notes("traits", "Personalidade, ideais, vínculos e defeitos"), notes("notes", "Anotações")] },
    ],
  }),
};

export const SW5E: SheetTemplate = {
  id: "sw5e",
  name: "Star Wars 5e (SW5e)",
  builtin: true,
  advantage: true,
  sections: d20Sections({
    identity: [F("text", "class", "Classe e nível"), F("text", "species", "Espécie"), F("text", "archetype", "Arquétipo"), F("text", "background", "Antecedente"), F("text", "alignment", "Tendência"), F("number", "credits", "Créditos", { default: 0 }), F("number", "xp", "XP", { default: 0 })],
    skills: SW_SKILLS,
    extra: [
      {
        title: "Força e tecnologia",
        columns: 4,
        fields: [
          F("resource", "force_points", "Pontos de Força", { default: 0 }),
          F("number", "force_dc", "CD (Força)", { default: 10 }),
          F("text", "force_atk", "Ataque de Força", { default: "@{pb} + @{wis_mod}", roll: "1d20 + @{force_atk}" }),
          F("text", "alignment_force", "Alinhamento na Força"),
          F("resource", "tech_points", "Pontos de Tecnologia", { default: 0 }),
          F("number", "tech_dc", "CD (tecnologia)", { default: 10 }),
          F("text", "tech_atk", "Ataque tecnológico", { default: "@{pb} + @{int_mod}", roll: "1d20 + @{tech_atk}" }),
          F("resource", "superiority", "Dados de superioridade", { default: 0 }),
          spellList("force_powers", "Poderes da Força"),
          spellList("tech_powers", "Poderes tecnológicos"),
        ],
      },
      { title: "Equipamento", fields: [notes("equipment", "Equipamento e nave"), notes("features", "Características e talentos"), notes("notes", "Anotações")] },
    ],
  }),
};

// ─── Call of Cthulhu 7e ──────────────────────────────────────────────────────

const coc = (id: string, label: string, base: number): SheetField => F("skill", id, label, { check: "coc", default: base });

const COC_SKILLS: [string, string, number][] = [
  ["accounting", "Contabilidade", 5], ["anthropology", "Antropologia", 1], ["appraise", "Avaliação", 5], ["archaeology", "Arqueologia", 1],
  ["art", "Arte/Ofício", 5], ["charm", "Charme", 15], ["climb", "Escalar", 20], ["credit", "Nível de crédito", 0],
  ["mythos", "Mitos de Cthulhu", 0], ["disguise", "Disfarce", 5], ["dodge", "Esquivar (DES/2)", 25], ["drive", "Dirigir automóveis", 20],
  ["elec", "Consertos elétricos", 10], ["fasttalk", "Lábia", 5], ["brawl", "Lutar (briga)", 25], ["handgun", "Armas de fogo (pistolas)", 20],
  ["rifle", "Armas de fogo (rifles)", 25], ["firstaid", "Primeiros socorros", 30], ["history", "História", 5], ["intimidate", "Intimidação", 15],
  ["jump", "Saltar", 20], ["lang_other", "Outra língua", 1], ["lang_own", "Língua nativa (EDU)", 50], ["law", "Direito", 5],
  ["library", "Usar bibliotecas", 20], ["listen", "Escutar", 20], ["locksmith", "Chaveiro", 1], ["mech", "Consertos mecânicos", 10],
  ["medicine", "Medicina", 1], ["natural", "Mundo natural", 10], ["navigate", "Navegação", 10], ["occult", "Ocultismo", 5],
  ["heavy", "Operar maquinário pesado", 1], ["persuade", "Persuasão", 10], ["pilot", "Pilotar", 1], ["psychology", "Psicologia", 10],
  ["psychoanalysis", "Psicanálise", 1], ["ride", "Cavalgar", 5], ["science", "Ciência", 1], ["sleight", "Prestidigitação", 10],
  ["spot", "Encontrar", 25], ["stealth", "Furtividade", 20], ["survival", "Sobrevivência", 10], ["swim", "Natação", 20],
  ["throw", "Arremessar", 20], ["track", "Rastrear", 10],
];

export const COC7E: SheetTemplate = {
  id: "coc7e",
  name: "Call of Cthulhu 7e",
  builtin: true,
  sections: [
    {
      title: "Investigador",
      columns: 4,
      fields: [F("text", "occupation", "Ocupação"), F("number", "age", "Idade"), F("text", "residence", "Residência"), F("text", "birthplace", "Local de nascimento")],
    },
    {
      title: "Características",
      columns: 4,
      fields: [
        coc("str", "FOR", 50), coc("con", "CON", 50), coc("siz", "TAM", 50), coc("dex", "DES", 50),
        coc("app", "APA", 50), coc("int", "INT", 50), coc("pow", "POD", 50), coc("edu", "EDU", 50),
      ],
    },
    {
      title: "Condição",
      columns: 4,
      fields: [
        F("resource", "hp", "Pontos de vida", { default: 10 }),
        F("resource", "mp", "Pontos de magia", { default: 10 }),
        F("resource", "san", "Sanidade", { default: 50 }),
        coc("luck", "Sorte", 50),
        F("number", "mov", "Movimento", { default: 8 }),
        F("text", "db", "Dano extra", { default: "0" }),
        F("number", "build", "Corpo", { default: 0 }),
        F("text", "status", "Estado", { default: "Normal" }),
      ],
    },
    { title: "Perícias", columns: 3, fields: COC_SKILLS.map(([id, label, base]) => coc(id, label, base)) },
    {
      title: "Armas",
      fields: [
        F("list", "weapons", "Armas", {
          span: 99,
          columns: [
            F("text", "name", "Arma"),
            F("number", "skill", "Perícia %", { default: 25 }),
            F("text", "dmg", "Dano", { default: "1d3 + @{db}" }),
            F("text", "range", "Alcance"),
            F("text", "attacks", "Ataques"),
            F("roll", "r_hit", "Teste", { check: "coc", roll: "@{.skill}" }),
            F("roll", "r_dmg", "Dano", { roll: "@{.dmg}" }),
          ],
        }),
      ],
    },
    {
      title: "Antecedentes",
      columns: 2,
      fields: [
        F("textarea", "description", "Descrição pessoal"), F("textarea", "ideology", "Ideologia e crenças"),
        F("textarea", "people", "Pessoas significativas"), F("textarea", "places", "Locais importantes"),
        F("textarea", "possessions", "Pertences queridos"), F("textarea", "traits", "Características"),
        F("textarea", "injuries", "Ferimentos e cicatrizes"), F("textarea", "phobias", "Fobias e manias"),
        F("textarea", "tomes", "Tomos, magias e artefatos"), F("textarea", "encounters", "Encontros com entidades estranhas"),
      ],
    },
    { title: "Equipamento e dinheiro", columns: 3, fields: [F("text", "spending", "Nível de gastos"), F("text", "cash", "Dinheiro"), F("text", "assets", "Bens"), notes("gear", "Equipamento")] },
  ],
};

// ─── Ficha livre ─────────────────────────────────────────────────────────────

export const FREE: SheetTemplate = {
  id: "free",
  name: "Ficha livre",
  builtin: true,
  sections: [
    { title: "Personagem", columns: 3, fields: [F("text", "concept", "Conceito"), F("text", "level", "Nível"), F("text", "origin", "Origem")] },
    { title: "Recursos", columns: 3, fields: [F("resource", "hp", "Vida", { default: 10 }), F("resource", "energy", "Energia", { default: 10 }), F("number", "defense", "Defesa", { default: 10 })] },
    {
      title: "Atributos",
      fields: [F("list", "attrs", "Atributos", { span: 99, columns: [F("text", "name", "Atributo"), F("number", "value", "Valor"), F("roll", "r", "Rolar", { roll: "1d20 + @{.value}" })] })],
    },
    {
      title: "Perícias",
      fields: [F("list", "skills", "Perícias", { span: 99, columns: [F("text", "name", "Perícia"), F("number", "value", "Bônus"), F("roll", "r", "Rolar", { roll: "1d20 + @{.value}" })] })],
    },
    {
      title: "Ataques",
      fields: [
        F("list", "attacks", "Ataques", {
          span: 99,
          columns: [F("text", "name", "Nome"), F("text", "atk", "Acerto", { default: "0" }), F("text", "dmg", "Dano", { default: "1d6" }), F("roll", "r_atk", "Ataque", { roll: "1d20 + @{.atk}" }), F("roll", "r_dmg", "Dano", { roll: "@{.dmg}" })],
        }),
      ],
    },
    { title: "Notas", fields: [notes("inventory", "Inventário"), notes("notes", "Anotações")] },
  ],
};

// ─── Ordem Paranormal ────────────────────────────────────────────────────────
// Teste: nº de d20 = atributo, fica com o maior (atributo 0: 2d20, o menor) + treino (0/5/10/15).

const OP_ATTR: [string, string][] = [["agi", "AGI"], ["for", "FOR"], ["int", "INT"], ["pre", "PRE"], ["vig", "VIG"]];
const OP_SKILLS: [string, string, string, boolean?][] = [
  ["acrobacia", "Acrobacia", "agi"], ["adestramento", "Adestramento", "pre", true], ["artes", "Artes", "pre"], ["atletismo", "Atletismo", "for"],
  ["atualidades", "Atualidades", "int"], ["ciencias", "Ciências", "int"], ["crime", "Crime", "agi", true], ["diplomacia", "Diplomacia", "pre"],
  ["enganacao", "Enganação", "pre"], ["fortitude", "Fortitude", "vig"], ["furtividade", "Furtividade", "agi"], ["iniciativa", "Iniciativa", "agi"],
  ["intimidacao", "Intimidação", "pre"], ["intuicao", "Intuição", "pre"], ["investigacao", "Investigação", "int"], ["luta", "Luta", "for"],
  ["medicina", "Medicina", "int"], ["ocultismo", "Ocultismo", "int", true], ["percepcao", "Percepção", "pre"], ["pilotagem", "Pilotagem", "agi", true],
  ["pontaria", "Pontaria", "agi"], ["profissao", "Profissão", "int", true], ["reflexos", "Reflexos", "agi"], ["religiao", "Religião", "pre", true],
  ["sobrevivencia", "Sobrevivência", "int"], ["tatica", "Tática", "int", true], ["tecnologia", "Tecnologia", "int", true], ["vontade", "Vontade", "pre"],
];

export const ORDEM: SheetTemplate = {
  id: "ordem",
  name: "Ordem Paranormal",
  builtin: true,
  sections: [
    {
      title: "Agente",
      columns: 4,
      fields: [
        F("text", "origem", "Origem"), F("text", "classe", "Classe"), F("text", "trilha", "Trilha"), F("number", "nex", "NEX (%)", { default: 5 }),
        F("text", "patente", "Patente"), F("number", "prestigio", "Prestígio (PP)", { default: 0 }), F("text", "deslocamento", "Deslocamento", { default: "9 m" }),
        F("number", "pe_rodada", "PE por rodada", { default: 1 }),
      ],
    },
    { title: "Atributos", columns: 5, fields: OP_ATTR.map(([k, abbr]) => F("attribute", k, abbr, { default: 1, check: "op" })) },
    {
      title: "Condição",
      columns: 4,
      fields: [
        F("resource", "hp", "Pontos de vida", { default: 20 }),
        F("resource", "pe", "Pontos de esforço", { default: 2 }),
        F("resource", "san", "Sanidade", { default: 12 }),
        F("computed", "defesa", "Defesa", { formula: "10 + @{agi} + @{def_bonus}" }),
        F("number", "def_bonus", "Bônus de defesa (equip.)", { default: 0 }),
        F("text", "resistencias", "Resistências", { span: 99 }),
      ],
    },
    {
      title: "Perícias",
      columns: 2,
      fields: OP_SKILLS.map(([id, label, attr, trained]) => F("skill", id, label, { check: "op", ability: attr, hint: trained ? "só treinada" : undefined, tracker: id === "iniciativa" })),
    },
    {
      title: "Ataques",
      fields: [
        F("list", "ataques", "Ataques", {
          span: 99,
          columns: [
            F("text", "name", "Arma"), F("number", "attr", "Dados (atrib.)", { default: 1 }), F("number", "bonus", "Bônus", { default: 0 }),
            F("text", "dmg", "Dano", { default: "1d6" }), F("text", "crit", "Crítico", { default: "19/x2" }), F("text", "alcance", "Alcance"),
            F("roll", "r_hit", "Teste", { check: "op" }), F("roll", "r_dmg", "Dano", { roll: "@{.dmg}" }),
          ],
        }),
      ],
    },
    {
      title: "Rituais",
      fields: [
        F("list", "rituais", "Rituais", {
          span: 99,
          columns: [
            F("text", "name", "Ritual"), F("number", "circulo", "Círculo"), F("text", "elemento", "Elemento"), F("text", "execucao", "Execução"),
            F("text", "alcance", "Alcance"), F("number", "custo", "PE"), F("text", "dt", "DT"), F("text", "efeito", "Efeito / dano"),
            F("roll", "r", "Rolar", { roll: "@{.efeito}" }),
          ],
        }),
      ],
    },
    { title: "Habilidades e inventário", fields: [notes("habilidades", "Habilidades e poderes"), notes("inventario", "Inventário (carga)"), notes("notes", "Anotações")] },
  ],
};

// ─── Tormenta20 (Jogo do Ano) ────────────────────────────────────────────────
// Atributos já são o modificador. Perícia = metade do nível + atributo + treino (+2/+4/+6 nos níveis 1–6/7–14/15+).

const T20_ATTR: [string, string][] = [["for", "FOR"], ["des", "DES"], ["con", "CON"], ["int", "INT"], ["sab", "SAB"], ["car", "CAR"]];
const T20_SKILLS: [string, string, string, boolean?][] = [
  ["acro", "Acrobacia", "des"], ["ades", "Adestramento", "car", true], ["atle", "Atletismo", "for"], ["atua", "Atuação", "car", true],
  ["cava", "Cavalgar", "des"], ["conh", "Conhecimento", "int", true], ["cura", "Cura", "sab"], ["dipl", "Diplomacia", "car"],
  ["enga", "Enganação", "car"], ["fort", "Fortitude", "con"], ["furt", "Furtividade", "des"], ["guer", "Guerra", "int", true],
  ["inic", "Iniciativa", "des"], ["inti", "Intimidação", "car"], ["intu", "Intuição", "sab"], ["inve", "Investigação", "int"],
  ["joga", "Jogatina", "car", true], ["ladi", "Ladinagem", "des", true], ["luta", "Luta", "for"], ["mist", "Misticismo", "int", true],
  ["nobr", "Nobreza", "int", true], ["ofic", "Ofício", "int", true], ["perc", "Percepção", "sab"], ["pilo", "Pilotagem", "des", true],
  ["pont", "Pontaria", "des"], ["refl", "Reflexos", "des"], ["reli", "Religião", "sab", true], ["sobr", "Sobrevivência", "sab"],
  ["vont", "Vontade", "sab"],
];

export const T20: SheetTemplate = {
  id: "t20",
  name: "Tormenta20",
  builtin: true,
  sections: [
    {
      title: "Personagem",
      columns: 4,
      fields: [
        F("text", "raca", "Raça"), F("text", "classe", "Classe"), F("number", "nivel", "Nível", { default: 1 }), F("text", "origem", "Origem"),
        F("text", "divindade", "Divindade"), F("text", "tamanho", "Tamanho", { default: "Médio" }), F("text", "deslocamento", "Deslocamento", { default: "9 m" }),
        F("number", "tibares", "Tibares (T$)", { default: 0 }),
        F("computed", "metade", "Metade do nível", { formula: "floor(@{nivel} / 2)" }),
        F("computed", "treino", "Bônus de treino", { formula: "2 + 2 * min(1, max(0, @{nivel} - 6)) + 2 * min(1, max(0, @{nivel} - 14))" }),
      ],
    },
    { title: "Atributos", columns: 6, fields: T20_ATTR.map(([k, abbr]) => F("attribute", k, abbr, { default: 0, formula: `@{${k}}`, roll: `1d20 + @{${k}}` })) },
    {
      title: "Combate",
      columns: 4,
      fields: [
        F("resource", "hp", "Pontos de vida", { default: 12 }),
        F("resource", "pm", "Pontos de mana", { default: 4 }),
        F("computed", "defesa", "Defesa", { formula: "10 + @{des} + @{def_armadura} + @{def_escudo} + @{def_outros}" }),
        F("number", "penalidade", "Penalidade de armadura", { default: 0 }),
        F("number", "def_armadura", "Armadura", { default: 0 }), F("number", "def_escudo", "Escudo", { default: 0 }), F("number", "def_outros", "Outros (defesa)", { default: 0 }),
      ],
    },
    {
      title: "Perícias",
      columns: 2,
      fields: T20_SKILLS.map(([id, label, attr, trained]) => F("skill", id, label, {
        ability: attr.toUpperCase(), formula: `@{metade} + @{${attr}} + @{treino} * min(1, @{${id}_prof})`, roll: `1d20 + @{${id}}`,
        hint: trained ? "só treinada" : undefined, tracker: id === "inic",
      })),
    },
    {
      title: "Ataques",
      fields: [
        F("list", "ataques", "Ataques", {
          span: 99,
          columns: [
            F("text", "name", "Arma"), F("text", "teste", "Teste", { default: "@{luta}" }), F("text", "dano", "Dano", { default: "1d8 + @{for}" }),
            F("text", "critico", "Crítico", { default: "19/x2" }), F("text", "tipo", "Tipo"), F("text", "alcance", "Alcance"),
            F("roll", "r_atk", "Ataque", { roll: "1d20 + @{.teste}" }), F("roll", "r_dmg", "Dano", { roll: "@{.dano}" }),
          ],
        }),
      ],
    },
    {
      title: "Magias",
      columns: 3,
      fields: [
        F("text", "atrib_chave", "Atributo-chave"), F("number", "cd_magia", "CD das magias", { default: 10 }), F("text", "tradicao", "Tradição"),
        F("list", "magias", "Magias", {
          span: 99,
          columns: [
            F("text", "name", "Magia"), F("number", "circulo", "Círculo"), F("text", "execucao", "Execução"), F("text", "alcance", "Alcance"),
            F("number", "pm", "PM"), F("text", "efeito", "Efeito / dano"), F("roll", "r", "Rolar", { roll: "@{.efeito}" }),
          ],
        }),
      ],
    },
    { title: "Poderes e equipamento", fields: [notes("poderes", "Poderes e habilidades"), notes("equipamento", "Equipamento"), notes("notes", "Anotações")] },
  ],
};

// ─── Criatura de D&D 5e (bloco de estatísticas; usado pelo compêndio) ────────

export const DND5E_NPC: SheetTemplate = {
  id: "dnd5e-npc",
  name: "D&D 5e — Criatura",
  builtin: true,
  advantage: true,
  sections: [
    {
      title: "Criatura",
      columns: 4,
      fields: [
        F("text", "kind", "Tipo"), F("text", "size", "Tamanho"), F("text", "alignment", "Tendência"), F("text", "cr", "ND"),
        F("number", "xp", "XP"), F("number", "pb", "Bônus de proficiência", { default: 2 }), F("number", "token_size", "Token (células)", { default: 1 }),
      ],
    },
    {
      title: "Atributos",
      columns: 6,
      fields: ABIL.map(([k, abbr]) => F("attribute", k, abbr, { default: 10, formula: `floor((@{${k}} - 10) / 2)`, roll: `1d20 + @{${k}_mod}` })),
    },
    {
      title: "Combate",
      columns: 4,
      fields: [
        F("number", "ac", "Classe de armadura", { default: 10 }), F("resource", "hp", "Pontos de vida", { default: 10 }),
        F("text", "hd", "Dados de vida"), F("text", "speed", "Deslocamento", { default: "9 m" }),
        F("computed", "init", "Iniciativa", { formula: "@{dex_mod}", roll: "1d20 + @{init}", tracker: true }),
      ],
    },
    {
      title: "Detalhes",
      columns: 2,
      fields: [
        F("text", "saves", "Testes de resistência"), F("text", "skills", "Perícias"), F("text", "senses", "Sentidos"), F("text", "languages", "Idiomas"),
        F("text", "resist", "Resistências"), F("text", "immune", "Imunidades"), F("text", "vuln", "Vulnerabilidades"), F("text", "condImmune", "Imune a condições"),
      ],
    },
    { title: "Traços", fields: [F("list", "traits", "Traços", { span: 99, columns: [F("text", "name", "Nome"), F("text", "desc", "Descrição")] })] },
    {
      title: "Ações",
      fields: [
        F("list", "actions", "Ações", {
          span: 99,
          columns: [
            F("text", "name", "Nome"), F("text", "atk", "Acerto"), F("text", "dmg", "Dano"), F("text", "desc", "Descrição"),
            F("roll", "r_atk", "Ataque", { roll: "1d20 + @{.atk}" }), F("roll", "r_dmg", "Dano", { roll: "@{.dmg}" }),
          ],
        }),
      ],
    },
    { title: "Reações e ações lendárias", fields: [notes("reactions", "Reações"), notes("legendary", "Ações lendárias"), notes("notes", "Anotações")] },
  ],
};

export const BUILTIN: SheetTemplate[] = [FREE, DND5E, DND5E_NPC, SW5E, COC7E, ORDEM, T20];

export function findTemplate(id: string, custom: Record<string, SheetTemplate>): SheetTemplate {
  return BUILTIN.find((t) => t.id === id) ?? custom[id] ?? FREE;
}
