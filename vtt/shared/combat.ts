// Regras do combate, usadas pelo servidor (que resolve o ataque) e pelo cliente (prévia na janela de ataque):
// ações da ficha (armas, magias…), alcance, distância entre tokens, cobertura por paredes, condições que dão
// vantagem/desvantagem, testes de resistência e resistências a tipos de dano.
import type { Graphic, Page, SheetField, SheetTemplate } from "./types.ts";
import { expand, fieldIndex, resolver, type Row } from "./sheet.ts";
import { blockingSegments, crossesWall } from "./vision.ts";

export type Resolve = "attack" | "save" | "auto";
export type Save = "for" | "des" | "con" | "int" | "sab" | "car";

export const SAVE_LABEL: Record<Save, string> = {
  for: "Força", des: "Destreza", con: "Constituição", int: "Inteligência", sab: "Sabedoria", car: "Carisma",
};

/** Alcance em metros: reach = corpo a corpo; normal/long = à distância (entre os dois, com penalidade). */
export interface Range { reach?: number; normal?: number; long?: number }

export type Test =
  | { kind: "d20"; expr: string }                 // "1d20 + (3 + 2)"
  | { kind: "op"; dice: number; bonus: number }   // Ordem Paranormal: nº de d20 (fica o maior) + bônus
  | { kind: "coc"; skill: number };               // Call of Cthulhu: d100 ≤ perícia

export interface Action {
  key: string;        // "lista:linha" (o servidor recalcula a partir dela)
  group: string;      // rótulo da lista ("Ataques", "Magias"…)
  label: string;
  spell: boolean;     // lista de magias/poderes/rituais/habilidades
  test?: Test;        // teste da própria linha
  spellTest?: Test;   // ataque mágico da ficha (magia sem teste próprio)
  dmg?: string;
  dmgType?: string;   // tipo canônico (ver DAMAGE_TYPES)
  range?: Range;
  rangeText?: string;
  area?: number;      // raio em metros, se o texto disser ("6 m de raio")
  crit: { min: number; mult: number };
  save?: Save;        // resistência citada no texto ("resistência de DES")
  half: boolean;      // passar na resistência reduz à metade (senão, anula)
  dc?: number;        // CD/DT da linha ou da ficha
  qty?: number;       // munição/quantidade (undefined = sem controle)
  qtyCol?: string;    // coluna da quantidade na linha
  cost?: Cost;        // mana, PE, PM, espaço de magia… gasto ao usar
}

/** Recurso gasto: campo da ficha (tipo resource) e quanto. */
export interface Cost { field: string; amount: number; label: string }

// ─── Texto ───────────────────────────────────────────────────────────────────

/** Minúsculas e sem acentos, para comparar textos livres. */
export const fold = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const num = (s: string) => Number(s.replace(",", "."));
const FT = 0.3; // 5 pés = 1,5 m
const unitOf = (u?: string) => (u && /^(ft|pes|pe\b|feet|foot)/.test(u) ? FT : 1);

const SAVE_WORDS: [Save, RegExp][] = [
  ["for", /\b(for|forca|str|strength)\b/], ["des", /\b(des|destreza|dex|dexterity|reflexos?|refl)\b/],
  ["con", /\b(con|constituicao|constitution|fortitude|fort)\b/], ["int", /\b(int|inteligencia|intelligence)\b/],
  ["sab", /\b(sab|sabedoria|wis|wisdom|vontade|vont)\b/], ["car", /\b(car|carisma|cha|charisma)\b/],
];

/** Resistência citada no texto: "Resistência de DES contra a CD", "DC 13 Dexterity saving throw", "CD 15 de Constituição". */
export function parseSave(text: string): { save?: Save; dc?: number; half: boolean } {
  const s = fold(text);
  const half = /metade|half/.test(s);
  let save: Save | undefined;
  for (const re of [/(?:resistencia|salvaguarda|teste de)\s+(?:de\s+)?(\w+)/g, /(?:cd|dc|dt)\s*\d+\s+(?:de\s+)?(\w+)/g, /(\w+)\s+saving throw/g]) {
    for (const m of s.matchAll(re)) save ??= SAVE_WORDS.find(([, w]) => w.test(m[1]))?.[0];
  }
  const dcm = /\b(?:cd|dc|dt)\s*(\d+)/.exec(s);
  return { save, dc: dcm ? Number(dcm[1]) : undefined, half };
}

// Categorias de alcance: Tormenta20 (curto 9 m, médio 30 m, longo 90 m) e Ordem Paranormal (9/18/36/90 m).
const T20_CAT: Record<string, number> = { curto: 9, medio: 30, longo: 90 };
const OP_CAT: Record<string, number> = { curto: 9, medio: 18, longo: 36, extremo: 90 };

/**
 * Coluna "Alcance": "1,5 m" (até 3 m = corpo a corpo), "24/96 m", "30/120 ft", "Curto", "Toque", "Pessoal".
 * Arma com um só valor: até o dobro com penalidade. Magia: só até o valor.
 */
export function parseRange(text: unknown, opts: { ordem?: boolean; spell?: boolean } = {}): Range | undefined {
  const s = fold(text);
  if (!s || /pessoal|self/.test(s)) return undefined;
  const out: Range = {};
  if (/corpo a corpo|corpo-a-corpo|toque|touch|adjacente|melee|\bcac\b/.test(s)) out.reach = 1.5;
  const cat = /\b(curto|medio|longo|extremo)\b/.exec(s);
  const pair = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*([a-z]+)?/.exec(s);
  const one = /(\d+(?:[.,]\d+)?)\s*([a-z]+)?/.exec(s);
  if (pair) {
    const u = unitOf(pair[3]);
    out.normal = num(pair[1]) * u;
    out.long = num(pair[2]) * u;
  } else if (cat) {
    const v = (opts.ordem ? OP_CAT : T20_CAT)[cat[1]] ?? 9;
    out.normal = v;
    out.long = opts.spell ? v : v * 2;
  } else if (one) {
    const v = num(one[1]) * unitOf(one[2]);
    if (v <= 3 && !opts.spell) out.reach = Math.max(out.reach ?? 0, v);
    else {
      out.normal = v;
      out.long = opts.spell ? v : v * 2;
    }
  }
  return out.reach || out.normal ? out : undefined;
}

/** Alcance escrito na descrição (criaturas do compêndio, efeitos): "reach 1,5 m or range 6/18 m", "distância 24/96 m", "a até 45 m". */
export function rangeFromText(text: string, spell: boolean): Range | undefined {
  const s = fold(text);
  const out: Range = {};
  const reach = /\b(?:reach|alcance)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*([a-z]+)?/.exec(s);
  if (reach) {
    const v = num(reach[1]) * unitOf(reach[2]);
    if (v <= 3) out.reach = v;
    else Object.assign(out, parseRange(reach[0].replace(/^\D+/, ""), { spell }));
  }
  const far = /\b(?:range|distancia|a ate)\s+(?:de\s+)?(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*[a-z]*)/.exec(s);
  if (far) {
    const r = parseRange(far[1], { spell: spell && !far[1].includes("/") });
    if (r?.normal) {
      out.normal = r.normal;
      out.long = r.long;
    }
  }
  return out.reach || out.normal ? out : undefined;
}

/** "19/x3", "x3", "18-20/x2", "19". Padrão: 20 natural, dados ×2. */
export function parseCrit(text: unknown): { min: number; mult: number } {
  const s = fold(text);
  const min = /^(\d+)\s*(?:-\s*20)?\s*(?:\/|$)/.exec(s);
  const mult = /x\s*(\d+)/.exec(s);
  const m = min ? Number(min[1]) : 20;
  return { min: m >= 2 && m <= 20 ? m : 20, mult: mult ? Math.max(2, Math.min(10, Number(mult[1]))) : 2 };
}

// Tipos de dano (canônico → como aparecem nas fichas, pt e en). D&D, SW5e, Ordem Paranormal e T20.
export const DAMAGE_TYPES: [string, RegExp][] = [
  ["fogo", /\b(fogo|fire|flamejante|chamas?)\b/], ["frio", /\b(frio|cold|gelo)\b/], ["eletrico", /\b(eletric\w*|lightning|eletricidade)\b/],
  ["trovao", /\b(trov\w*|thunder)\b/], ["sonico", /\b(sonic\w*)\b/], ["acido", /\b(acid\w*)\b/], ["veneno", /\b(venen\w*|poison\w*)\b/],
  ["necrotico", /\b(necrotic\w*)\b/], ["radiante", /\b(radiant\w*)\b/], ["psiquico", /\b(psiquic\w*|psychic)\b/],
  ["forca", /\b(force|essencia)\b/], ["cortante", /\b(cortant\w*|slashing|corte)\b/], ["perfurante", /\b(perfura\w*|piercing)\b/],
  ["contundente", /\b(contundent\w*|bludgeoning|impacto)\b/], ["energia", /\b(energia|energy)\b/], ["ion", /\b(ion|ions)\b/],
  ["cinetico", /\b(cinetic\w*|kinetic)\b/], ["balistico", /\b(balistic\w*|ballistic)\b/], ["sangue", /\b(sangue|blood)\b/],
  ["morte", /\b(morte|death)\b/], ["conhecimento", /\b(conhecimento)\b/], ["medo", /\b(medo)\b/], ["luz", /\b(luz)\b/], ["trevas", /\b(trevas)\b/],
];

export function damageType(text: unknown): string | undefined {
  const s = fold(text);
  // na descrição de criatura o tipo vem depois do acerto ("Hit: 11 (2d8 + 2) piercing damage")
  const after = /(?:hit|acerto)\s*:/.exec(s);
  const part = after ? s.slice(after.index) : s;
  let best: [string, number] | undefined;
  for (const [id, re] of DAMAGE_TYPES) {
    const m = re.exec(part);
    if (m && (!best || m.index < best[1])) best = [id, m.index];
  }
  return best?.[0];
}

// ─── Ações da ficha ──────────────────────────────────────────────────────────

const SPELL_LIST_IDS = new Set(["spells", "force_powers", "tech_powers", "poderes", "rituais", "magias", "habilidades"]);
const isSpellList = (f: SheetField) => SPELL_LIST_IDS.has(f.id ?? "") || /magi|poder|ritua|habilidad|spell|power|feiti/i.test(f.label ?? "");
// ataque mágico e CD de cada lista; depois, os campos que costumam existir
const SPELL_ATK: Record<string, string> = { spells: "spell_atk", force_powers: "force_atk", tech_powers: "tech_atk", habilidades: "atq_hab", poderes: "atk_forca" };
const SPELL_DC: Record<string, string> = { spells: "spell_dc", force_powers: "force_dc", tech_powers: "tech_dc", habilidades: "cd", magias: "cd_magia" };
const ATK_FIELDS = ["spell_atk", "atq_hab", "force_atk", "tech_atk", "atk_forca"];
const DC_FIELDS = ["spell_dc", "cd", "cd_magia", "force_dc", "tech_dc"];

const col = (cols: SheetField[], ids: string[], label?: RegExp) => cols.find((c) => ids.includes(c.id ?? "") || (label && label.test(c.label ?? "")));
const filled = (v: unknown) => String(v ?? "").trim() !== "";

/** Rolagem que só usa colunas vazias da linha (ex.: "1d20 + @{.atk}" com acerto em branco) não vale. */
function emptyRefs(roll: string, row: Row): boolean {
  const refs = [...roll.matchAll(/@\{\.(\w+)\}/g)].map((m) => m[1]);
  return refs.length > 0 && refs.every((r) => !filled(row[r]));
}

/** Armas, magias e habilidades da ficha que servem para atacar. Já com os @{…} trocados por números. */
export function sheetActions(t: SheetTemplate, data: Record<string, unknown>): Action[] {
  const out: Action[] = [];
  const idx = fieldIndex(t);
  const calc = resolver(t, data);
  const ordem = t.sections.some((s) => s.fields.some((f) => f.check === "op"));
  const firstField = (ids: (string | undefined)[]) => ids.find((id) => id && idx.has(id));
  for (const s of t.sections) {
    for (const f of s.fields) {
      if (f.type !== "list" || !f.id) continue;
      const cols = f.columns ?? [];
      const rolls = cols.filter((c) => c.type === "roll" && !c.consume); // consumíveis não atacam
      if (!rolls.length) continue;
      const spell = isSpellList(f);
      const cRange = col(cols, ["alcance", "range", "reach"], /alcance|range/i);
      const cType = col(cols, ["kind", "tipo", "type", "elemento"], /^tipo|elemento/i);
      const cCrit = col(cols, ["crit", "critico"], /cr[ií]tico/i);
      const cDc = col(cols, ["dt", "dc"], /^(dt|cd)$/i);
      const cQty = col(cols, ["qtd"], /qtd|quantidade|muni/i);
      const cCost = col(cols, ["custo", "cost", "pm", "pe", "mana"], /custo|^pm$|^pe$|^mana$/i);
      const cLevel = col(cols, ["level", "nivel"]);
      const texts = cols.filter((c) => (c.type === "text" || c.type === "textarea") && c !== cRange && c.id !== "name");
      const atkField = firstField([SPELL_ATK[f.id], ...ATK_FIELDS]);
      const dcField = firstField([SPELL_DC[f.id], ...DC_FIELDS]);
      const rows = (data[f.id] as Row[] | undefined) ?? [];
      rows.forEach((row, i) => {
        if (!row || typeof row !== "object") return;
        if (cCost && /passiv/i.test(String(row[cCost.id!] ?? ""))) return;
        const rc = resolver(t, data, row);
        let test: Test | undefined;
        let dmg: string | undefined;
        for (const c of rolls) {
          if (c.check === "op") {
            test ??= { kind: "op", dice: rc.safeEval("@{.attr}"), bonus: rc.safeEval("@{.bonus}") };
            continue;
          }
          if (c.check === "coc") {
            test ??= { kind: "coc", skill: rc.safeEval(c.roll ?? "0") };
            continue;
          }
          if (!c.roll || emptyRefs(c.roll, row)) continue;
          const expr = expand(t, data, c.roll, row);
          if (/d20/i.test(expr)) test ??= { kind: "d20", expr };
          else if (/\d*d\d+/i.test(expr)) dmg ??= expr;
        }
        const text = texts.map((c) => String(row[c.id!] ?? "")).join(". ");
        const sv = parseSave(text);
        if (!test && !dmg && !sv.save) return;
        const rangeText = cRange ? String(row[cRange.id!] ?? "") : "";
        const range = filled(rangeText) ? parseRange(rangeText, { ordem, spell }) : rangeFromText(text, spell);
        const area = /(\d+(?:[.,]\d+)?)\s*m de raio|raio de (\d+(?:[.,]\d+)?)\s*m|(\d+)-(?:foot|ft)-radius/.exec(fold(text));
        const qty = cQty && filled(row[cQty.id!]) ? Number(row[cQty.id!]) : undefined;
        const dcRaw = cDc ? String(row[cDc.id!] ?? "") : "";
        const rowDc = /@\{/.test(dcRaw) ? rc.safeEval(dcRaw) : Number(/\d+/.exec(dcRaw)?.[0]) || undefined;
        const lvl = cLevel ? Math.trunc(Number(row[cLevel.id!]) || 0) : 0;
        const cost = (cCost ? parseCost(t, row[cCost.id!], cCost.label ?? "") : undefined) ?? levelCost(t, f.id!, lvl);
        out.push({
          key: `${f.id}:${i}`,
          group: f.label || "Ataques",
          label: String(row.name || f.label || "Ataque"),
          spell,
          test,
          spellTest: !test && spell && atkField ? { kind: "d20", expr: expand(t, data, `1d20 + @{${atkField}}`) } : undefined,
          dmg,
          // tipo: coluna Tipo; senão o texto; por último o nome ("Bola de Fogo", "Raio de Gelo")
          dmgType: damageType(cType && filled(row[cType.id!]) ? row[cType.id!] : text) ?? damageType(row.name),
          range,
          rangeText: filled(rangeText) ? rangeText : undefined,
          area: area ? (area[3] ? Number(area[3]) * FT : num(area[1] ?? area[2])) : undefined,
          crit: parseCrit(cCrit ? row[cCrit.id!] : ""),
          save: sv.save,
          half: sv.half || !sv.save,
          dc: rowDc || sv.dc || (dcField ? calc.resolve(dcField) : undefined),
          qty: qty !== undefined && Number.isFinite(qty) ? qty : undefined,
          qtyCol: cQty?.id,
          cost,
        });
      });
    }
  }
  return out;
}

// ─── Recursos (PV, mana, PE, PM…) ────────────────────────────────────────────

// nome escrito na ficha → campos de recurso que servem, em ordem (poção de mana também enche PM, PE…)
const RES_WORDS: [RegExp, string[]][] = [
  [/^(pv|hp|vida|pontos de vida|hit points?)\b/, ["hp"]],
  [/^(mana|pm|mp|magia|pontos de (mana|magia)|energia)\b/, ["mana", "pm", "mp", "pe", "energy", "force_points"]],
  [/^(pe|esforco|pontos de esforco)\b/, ["pe", "mana", "pm"]],
  [/^(pf|forca|pontos de forca|force points?)\b/, ["force_points"]],
  [/^(pt|tecnologia|pontos de tecnologia|tech points?)\b/, ["tech_points"]],
  [/^(san|sanidade)\b/, ["san"]],
  [/^(destino)\b/, ["destino"]],
];
const RES_SHORT: Record<string, string> = {
  hp: "PV", mana: "mana", pm: "PM", mp: "PM", pe: "PE", energy: "energia", force_points: "pontos de Força", tech_points: "pontos de tecnologia", san: "SAN",
};

/** Campo de recurso da ficha pelo nome que a pessoa escreveu ("PV", "Mana", "PM", "PE"…). */
export function resourceField(t: SheetTemplate, text: unknown): string | undefined {
  const idx = fieldIndex(t);
  const s = fold(text);
  if (!s) return undefined;
  const isRes = (id: string) => idx.get(id)?.type === "resource";
  for (const [re, ids] of RES_WORDS) if (re.test(s)) return ids.find(isRes);
  for (const f of idx.values()) if (f.type === "resource" && f.id && (fold(f.id) === s || fold(f.label) === s)) return f.id;
  return undefined;
}

export const resourceLabel = (t: SheetTemplate, field: string) => RES_SHORT[field] ?? fieldIndex(t).get(field)?.label ?? field;

/** Custo escrito na ficha: "3 mana", "2 PE", número na coluna PE/PM. "1/descanso" e "reação" não gastam recurso. */
function parseCost(t: SheetTemplate, raw: unknown, colLabel: string): Cost | undefined {
  const s = fold(raw);
  if (!s || /(\/|\bpor\b)\s*(descanso|dia|rest|turno|cena|combate|rodada)/.test(s)) return undefined;
  const m = /(\d+)\s*([a-z]+(?: de [a-z]+)?)?/.exec(s);
  const amount = m ? Number(m[1]) : 0;
  if (!m || !amount) return undefined;
  const field = (m[2] && resourceField(t, m[2])) || resourceField(t, colLabel) || resourceField(t, "mana");
  return field ? { field, amount, label: `${amount} ${resourceLabel(t, field)}` } : undefined;
}

// sem coluna de custo: D&D gasta um espaço do círculo da magia; Star Wars (SW5e e vocações), pontos = nível do poder
const LEVEL_COST: Record<string, (lvl: number) => [string, number]> = {
  spells: (l) => [`slot${l}`, 1],
  force_powers: (l) => ["force_points", l],
  tech_powers: (l) => ["tech_points", l],
  poderes: (l) => ["force_points", l],
};

function levelCost(t: SheetTemplate, list: string, lvl: number): Cost | undefined {
  if (lvl <= 0 || !LEVEL_COST[list]) return undefined;
  const [field, amount] = LEVEL_COST[list](lvl);
  if (fieldIndex(t).get(field)?.type !== "resource") return undefined;
  return { field, amount, label: field.startsWith("slot") ? `1 espaço de ${lvl}º círculo` : `${amount} ${resourceLabel(t, field)}` };
}

// ─── Tempo de uso dos consumíveis ────────────────────────────────────────────

/** turn = gasta o turno inteiro (só na sua vez; depois não ataca) · inTurn = só na sua vez · free = quando quiser. */
export type ItemTiming = "turn" | "inTurn" | "free";

/** Coluna "Uso": "Turno inteiro"/"Ação" (ou vazio) gasta o turno; "Ação bônus"/"Movimento" não; "Livre"/"Reação" a qualquer hora. */
export function itemTiming(text: unknown): ItemTiming {
  const s = fold(text);
  if (/livre|gratis|reac|instant|sem acao/.test(s)) return "free";
  if (/bonus|movimento|rapid/.test(s)) return "inTurn";
  return "turn";
}

export const TIMING_LABEL: Record<ItemTiming, string> = { turn: "gasta o turno inteiro", inTurn: "só na sua vez", free: "a qualquer momento" };

/** Como resolver por padrão: teste da linha → ataque; resistência no texto → resistência; senão acerta sozinho. */
export function defaultResolve(a: Action): Resolve {
  if (a.test) return "attack";
  if (a.save) return "save";
  return "auto";
}

// ─── Defesa e resistências do alvo ───────────────────────────────────────────

const DEF_FIELDS = ["ca", "ac", "defesa", "defense"];

export function defenseOf(t: SheetTemplate, data: Record<string, unknown>): number | null {
  const f = DEF_FIELDS.find((k) => fieldIndex(t).has(k));
  return f ? resolver(t, data).resolve(f) : null;
}

const SAVE_EN: Record<Save, string> = { for: "str", des: "dex", con: "con", int: "int", sab: "wis", car: "cha" };
// Tormenta20 e Ordem Paranormal: Fortitude, Reflexos, Vontade
const SAVE_SKILL: Record<Save, string[]> = {
  for: ["fort", "fortitude"], con: ["fort", "fortitude"], des: ["refl", "reflexos"],
  int: ["vont", "vontade"], sab: ["vont", "vontade"], car: ["vont", "vontade"],
};
// atributo que o Call of Cthulhu usa no lugar da resistência
const SAVE_COC: Record<Save, string> = { for: "str", des: "dex", con: "con", int: "int", sab: "pow", car: "app" };

/** Teste de resistência do alvo para o atributo pedido, com o que a ficha tiver. */
export function saveTest(t: SheetTemplate, data: Record<string, unknown>, ab: Save): Test {
  const idx = fieldIndex(t);
  const calc = resolver(t, data);
  const op = (id: string, f: SheetField): Test => ({
    kind: "op", dice: Number(data[f.ability ?? ""] ?? 1) || 0, bonus: Number(data[`${id}_train`] ?? 0) + Number(data[`${id}_bonus`] ?? 0),
  });
  for (const id of [`save_${ab}`, `save_${SAVE_EN[ab]}`, ...SAVE_SKILL[ab]]) {
    const f = idx.get(id);
    if (!f) continue;
    if (f.check === "op") return op(id, f);
    return { kind: "d20", expr: `1d20 + ${fmt(calc.resolve(id))}` };
  }
  // criatura: "Des +5, Sab +3" / "Dex +5"
  const listed = new RegExp(`\\b(${ab}|${SAVE_EN[ab]})\\w*\\s*([+-]\\s*\\d+)`).exec(fold(data.saves));
  if (listed) return { kind: "d20", expr: `1d20 + ${fmt(Number(listed[2].replace(/\s/g, "")))}` };
  const coc = idx.get(SAVE_COC[ab]);
  if (coc?.check === "coc") return { kind: "coc", skill: Number(data[SAVE_COC[ab]] ?? coc.default ?? 0) };
  for (const id of [ab, SAVE_EN[ab]]) {
    const f = idx.get(id);
    if (f?.type !== "attribute") continue;
    if (f.check === "op") return { kind: "op", dice: Number(data[id] ?? f.default ?? 1) || 0, bonus: 0 };
    return { kind: "d20", expr: `1d20 + ${fmt(f.formula ? calc.resolve(`${id}_mod`) : calc.resolve(id))}` };
  }
  return { kind: "d20", expr: "1d20" };
}

const fmt = (n: number) => (n < 0 ? `(${n})` : String(n));

export type Defenses = { immune: Set<string>; vuln: Set<string>; resist: Map<string, number | "half"> };

/** Resistências do alvo: campos de criatura (resist/immune/vuln) e "Resistências" da Ordem ("Balístico 5"). */
export function defensesOf(t: SheetTemplate, data: Record<string, unknown>): Defenses {
  const idx = fieldIndex(t);
  const text = (ids: string[]) => ids.filter((id) => idx.has(id)).map((id) => fold(data[id])).join(", ");
  const types = (s: string) => DAMAGE_TYPES.filter(([, re]) => re.test(s)).map(([id]) => id);
  const resist = new Map<string, number | "half">();
  for (const part of text(["resist", "resistencias", "resistances"]).split(/[,;]|\be\b|\band\b/)) {
    const n = /(\d+)/.exec(part);
    for (const ty of types(part)) resist.set(ty, n ? Number(n[1]) : "half");
  }
  return { immune: new Set(types(text(["immune", "imunidades"]))), vuln: new Set(types(text(["vuln", "vulnerabilidades"]))), resist };
}

/** Dano depois de imunidade, resistência (metade ou redução fixa) e vulnerabilidade. */
export function applyDefenses(dmg: number, type: string | undefined, d: Defenses | null): { dmg: number; note?: string } {
  if (!type || !d) return { dmg };
  if (d.immune.has(type)) return { dmg: 0, note: `imune a ${type}` };
  let v = dmg;
  let note: string | undefined;
  const r = d.resist.get(type);
  if (r === "half") {
    v = Math.floor(v / 2);
    note = `resistente a ${type} (metade)`;
  } else if (typeof r === "number") {
    v = Math.max(0, v - r);
    note = `resistência ${r} a ${type}`;
  }
  if (d.vuln.has(type)) {
    v *= 2;
    note = note ? `${note}, vulnerável` : `vulnerável a ${type} (dobro)`;
  }
  return { dmg: v, note };
}

// ─── Mapa: distância, alcance, cobertura ─────────────────────────────────────

type Box = Pick<Graphic, "x" | "y" | "w" | "h">;

/** Distância entre tokens em unidades da página, de casa a casa (adjacentes = 1 casa), pela regra de diagonais. */
export function tokenDistance(a: Box, b: Box, page: Pick<Page, "gridSize" | "scale">, diagonal: "dnd" | "alt" | "euclid"): number {
  const gs = page.gridSize || 70;
  const steps = (a0: number, a1: number, b0: number, b1: number) => {
    const gap = Math.max(a0, b0) - Math.min(a1, b1);
    return gap < -1 ? 0 : Math.round(Math.max(0, gap) / gs) + 1;
  };
  const sx = steps(a.x, a.x + a.w, b.x, b.x + b.w);
  const sy = steps(a.y, a.y + a.h, b.y, b.y + b.h);
  let cells = Math.max(sx, sy);
  if (diagonal === "alt") cells += Math.floor(Math.min(sx, sy) / 2);
  // euclidiana entre as casas mais próximas: adjacente na diagonal continua sendo 1 casa
  else if (diagonal === "euclid" && cells) cells = Math.hypot(Math.max(sx - 1, 0), Math.max(sy - 1, 0)) + 1;
  return Math.round(cells * page.scale * 10) / 10;
}

/** Unidade da página → metros (a página pode estar em pés). */
export const toMeters = (v: number, unit: string) => (/^(ft|pes|pés|pe|pé)/i.test(unit.trim()) ? v * FT : v);
export const fromMeters = (m: number, unit: string) => Math.round((m / toMeters(1, unit)) * 10) / 10;

/** 1.5 → "1,5" */
export const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const meters = (n: number) => `${fmtNum(n)} m`;

/** "corpo a corpo 1,5 m ou 6/18 m" */
export function rangeText(r: Range): string {
  const parts: string[] = [];
  if (r.reach) parts.push(`corpo a corpo ${meters(r.reach)}`);
  if (r.normal) parts.push(r.long && r.long > r.normal ? `${String(r.normal).replace(".", ",")}/${meters(r.long)}` : meters(r.normal));
  return parts.join(" ou ");
}

export type RangeState = "melee" | "normal" | "long" | "far" | "unknown";

/** Onde o alvo está em relação ao alcance (distância e alcance na mesma unidade). */
export function rangeState(r: Range | undefined, dist: number): RangeState {
  if (!r) return "unknown";
  const eps = 0.01;
  if (r.reach && dist <= r.reach + eps) return "melee";
  if (r.normal) {
    if (dist <= r.normal + eps) return "normal";
    if (r.long && dist <= r.long + eps) return "long";
  }
  return "far";
}

export type Cover = "none" | "half" | "three" | "total";
export const COVER_BONUS: Record<Cover, number> = { none: 0, half: 2, three: 5, total: 0 };
export const COVER_LABEL: Record<Cover, string> = { none: "", half: "meia cobertura (+2)", three: "cobertura de três quartos (+5)", total: "cobertura total" };

/** Paredes e portas fechadas entre o atacante e o alvo: linhas do centro do atacante ao centro e aos cantos do alvo. */
export function coverBetween(a: Box, b: Box, page: Pick<Page, "walls" | "doors">): Cover {
  const segs = blockingSegments(page, true);
  if (!segs.length) return "none";
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const ix = b.w * 0.15;
  const iy = b.h * 0.15;
  const pts = [[b.x + b.w / 2, b.y + b.h / 2], [b.x + ix, b.y + iy], [b.x + b.w - ix, b.y + iy], [b.x + ix, b.y + b.h - iy], [b.x + b.w - ix, b.y + b.h - iy]];
  const blocked = pts.filter(([x, y]) => crossesWall(ax, ay, x, y, segs)).length;
  if (blocked === pts.length) return "total";
  if (blocked >= 3) return "three";
  return blocked >= 1 ? "half" : "none";
}

// ─── Condições (marcadores dos tokens) ───────────────────────────────────────

const LABEL: Record<string, string> = {
  blinded: "cego", frightened: "amedrontado", poisoned: "envenenado", prone: "caído", restrained: "impedido", invisible: "invisível",
  hidden: "escondido", paralyzed: "paralisado", petrified: "petrificado", stunned: "atordoado", unconscious: "inconsciente",
  incapacitated: "incapacitado", dead: "morto",
};
const has = (ms: string[], id: string) => ms.some((m) => m === id || m.startsWith(`${id}:`));
const CANT_ACT = ["dead", "incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];

/** O atacante não pode agir por causa de uma condição? */
export function cantAct(markers: string[]): string | null {
  const c = CANT_ACT.find((id) => has(markers, id));
  return c ? LABEL[c] : null;
}

export interface Edge { adv: string[]; dis: string[]; autoCrit: boolean }

/** Vantagens e desvantagens que vêm das condições do atacante e do alvo (regras do SRD 5e). */
export function conditionEdge(attacker: string[], target: string[], dist: number | null): Edge {
  const adv: string[] = [];
  const dis: string[] = [];
  const near = dist !== null && dist <= 1.51;
  for (const id of ["blinded", "frightened", "poisoned", "prone", "restrained"]) if (has(attacker, id)) dis.push(`atacante ${LABEL[id]}`);
  for (const id of ["invisible", "hidden"]) if (has(attacker, id)) adv.push(`atacante ${LABEL[id]}`);
  for (const id of ["blinded", "paralyzed", "petrified", "restrained", "stunned", "unconscious"]) if (has(target, id)) adv.push(`alvo ${LABEL[id]}`);
  for (const id of ["invisible", "hidden"]) if (has(target, id)) dis.push(`alvo ${LABEL[id]}`);
  if (has(target, "prone")) (near ? adv : dis).push(near ? "alvo caído (perto)" : "alvo caído (longe)");
  return { adv, dis, autoCrit: near && (has(target, "paralyzed") || has(target, "unconscious")) };
}

/** Resistência que o alvo falha sozinho, ou desvantagem nela, pelas condições. */
export function saveEdge(target: string[], ab: Save): { autoFail?: string; dis?: string } {
  if (ab === "for" || ab === "des") {
    const c = ["paralyzed", "petrified", "stunned", "unconscious"].find((id) => has(target, id));
    if (c) return { autoFail: LABEL[c] };
  }
  if (ab === "des" && has(target, "restrained")) return { dis: "impedido" };
  return {};
}
