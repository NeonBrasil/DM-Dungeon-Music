// Gera client/data/srd-spells.json (todos leem) e server/compendium/bestiary-dnd.json e items-dnd.json
// (só o mestre recebe) a partir do SRD 5.1 (5e-bits/5e-database).
// Conteúdo: System Reference Document 5.1, Wizards of the Coast, licença CC-BY-4.0.
// Uso: node scripts/build-srd.ts   (precisa de internet)
import fs from "node:fs";
import path from "node:path";

const BASE = "https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/";
const OUT = path.resolve(import.meta.dirname, "..", "client", "data");
const OUT_GM = path.resolve(import.meta.dirname, "..", "server", "compendium");

type Any = Record<string, any>;

const SIZE: Record<string, string> = { Tiny: "Miúdo", Small: "Pequeno", Medium: "Médio", Large: "Grande", Huge: "Enorme", Gargantuan: "Imenso" };
const TOKEN: Record<string, number> = { Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 };
const TYPE: Record<string, string> = {
  aberration: "aberração", beast: "besta", celestial: "celestial", construct: "constructo", dragon: "dragão", elemental: "elemental",
  fey: "fada", fiend: "corruptor", giant: "gigante", humanoid: "humanoide", monstrosity: "monstruosidade", ooze: "limo",
  plant: "planta", undead: "morto-vivo", swarm: "enxame",
};
const ALIGN: Record<string, string> = {
  "lawful good": "leal e bom", "neutral good": "neutro e bom", "chaotic good": "caótico e bom", "lawful neutral": "leal e neutro",
  neutral: "neutro", "chaotic neutral": "caótico e neutro", "lawful evil": "leal e mau", "neutral evil": "neutro e mau",
  "chaotic evil": "caótico e mau", unaligned: "sem tendência", "any alignment": "qualquer tendência",
};
const SKILL: Record<string, string> = {
  Acrobatics: "Acrobacia", "Animal Handling": "Lidar com animais", Arcana: "Arcanismo", Athletics: "Atletismo", Deception: "Enganação",
  History: "História", Insight: "Intuição", Intimidation: "Intimidação", Investigation: "Investigação", Medicine: "Medicina", Nature: "Natureza",
  Perception: "Percepção", Performance: "Atuação", Persuasion: "Persuasão", Religion: "Religião", "Sleight of Hand": "Prestidigitação",
  Stealth: "Furtividade", Survival: "Sobrevivência",
};
const SAVE: Record<string, string> = { STR: "For", DEX: "Des", CON: "Con", INT: "Int", WIS: "Sab", CHA: "Car" };
const SCHOOL: Record<string, string> = {
  Abjuration: "Abjuração", Conjuration: "Conjuração", Divination: "Adivinhação", Enchantment: "Encantamento", Evocation: "Evocação",
  Illusion: "Ilusão", Necromancy: "Necromancia", Transmutation: "Transmutação",
};

/** "30 ft." → "9 m" (1,5 m por quadrado de 5 pés). */
const m = (n: string) => (Number(n) * 0.3).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const meters = (s: string) => s
  .replace(/(\d+)\/(\d+)\s*ft\.?/g, (_, a: string, b: string) => `${m(a)}/${m(b)} m`)
  .replace(/(\d+)-foot/g, (_, n: string) => `${m(n)}-meter`)
  .replace(/(\d+)\s*(?:ft\.?|feet|foot)/g, (_, n: string) => `${m(n)} m`);

const SENSE: Record<string, string> = { darkvision: "visão no escuro", blindsight: "percepção às cegas", truesight: "visão verdadeira", tremorsense: "sentido sísmico" };

function cr(v: number): string {
  return v === 0.125 ? "1/8" : v === 0.25 ? "1/4" : v === 0.5 ? "1/2" : String(v);
}

async function get(name: string): Promise<Any[]> {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
}

function monster(m: Any) {
  const speed = Object.entries(m.speed ?? {})
    .map(([k, v]) => (k === "walk" ? meters(String(v)) : k === "hover" ? "flutua" : `${({ fly: "voo", swim: "natação", climb: "escalada", burrow: "escavação" } as Any)[k] ?? k} ${meters(String(v))}`))
    .join(", ");
  const prof = (m.proficiencies ?? []) as Any[];
  const saves = prof.filter((p) => p.proficiency.index.startsWith("saving-throw")).map((p) => `${SAVE[p.proficiency.name.split(": ")[1]] ?? p.proficiency.name} +${p.value}`).join(", ");
  const skills = prof.filter((p) => p.proficiency.index.startsWith("skill")).map((p) => `${SKILL[p.proficiency.name.split(": ")[1]] ?? p.proficiency.name} +${p.value}`).join(", ");
  const senses = Object.entries(m.senses ?? {})
    .map(([k, v]) => (k === "passive_perception" ? `Percepção passiva ${v}` : `${SENSE[k] ?? k} ${meters(String(v))}`))
    .join(", ");
  const ac = (m.armor_class ?? [])[0] ?? {};
  const actions = ((m.actions ?? []) as Any[]).map((a) => {
    const dmg = ((a.damage ?? []) as Any[]).map((d) => d.damage_dice).filter(Boolean).join(" + ");
    return { name: a.name, desc: meters(a.desc ?? ""), atk: typeof a.attack_bonus === "number" ? a.attack_bonus : undefined, dmg: dmg || undefined };
  });
  const list = (arr?: Any[]) => (arr ?? []).map((t) => ({ name: t.name, desc: meters(t.desc ?? "") }));
  const join = (arr?: Any[]) => (arr ?? []).map((x) => (typeof x === "string" ? x : x.name)).join(", ");
  return {
    id: m.index,
    name: m.name,
    size: SIZE[m.size] ?? m.size,
    token: TOKEN[m.size] ?? 1,
    type: TYPE[m.type] ?? m.type,
    alignment: ALIGN[m.alignment] ?? m.alignment,
    ac: ac.value ?? 10,
    acNote: ac.type === "armor" ? join(ac.armor) : ac.type === "natural" ? "armadura natural" : undefined,
    hp: m.hit_points,
    hd: m.hit_points_roll ?? m.hit_dice,
    speed,
    abil: [m.strength, m.dexterity, m.constitution, m.intelligence, m.wisdom, m.charisma],
    saves, skills, senses,
    languages: m.languages || "—",
    cr: cr(m.challenge_rating),
    crNum: m.challenge_rating,
    xp: m.xp,
    pb: m.proficiency_bonus,
    vuln: m.damage_vulnerabilities?.join(", ") || undefined,
    resist: m.damage_resistances?.join(", ") || undefined,
    immune: m.damage_immunities?.join(", ") || undefined,
    condImmune: join(m.condition_immunities) || undefined,
    traits: list(m.special_abilities),
    actions,
    reactions: list(m.reactions),
    legendary: list(m.legendary_actions),
  };
}

function spell(s: Any) {
  const dmg = Array.isArray(s.damage) ? s.damage[0] : s.damage;
  const dmgSlot = dmg?.damage_at_slot_level ?? dmg?.damage_at_character_level;
  const firstDmg = dmgSlot ? String(Object.values(dmgSlot)[0]) : undefined;
  return {
    id: s.index,
    name: s.name,
    level: s.level,
    school: SCHOOL[s.school?.name] ?? s.school?.name,
    time: s.casting_time,
    range: meters(s.range ?? ""),
    components: (s.components ?? []).join(", "),
    material: s.material || undefined,
    duration: s.duration,
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    classes: (s.classes ?? []).map((c: Any) => c.name),
    dmg: firstDmg,
    dmgType: dmg?.damage_type?.name,
    dc: s.dc ? `${s.dc.dc_type?.name ?? ""}` : undefined,
    aoe: s.area_of_effect ? `${s.area_of_effect.type} ${(s.area_of_effect.size * 0.3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m` : undefined,
    desc: meters((s.desc ?? []).join("\n\n")),
    higher: s.higher_level?.length ? meters(s.higher_level.join("\n")) : undefined,
  };
}

const DMG_TYPE: Record<string, string> = { slashing: "cortante", piercing: "perfurante", bludgeoning: "contundente" };
const PROP: Record<string, string> = {
  ammunition: "munição", finesse: "acuidade", heavy: "pesada", light: "leve", loading: "recarga", monk: "monge",
  reach: "alcance", special: "especial", thrown: "arremesso", "two-handed": "duas mãos", versatile: "versátil",
};
const COIN: Record<string, string> = { cp: "PC", sp: "PP", ep: "PE", gp: "PO", pp: "PL" };
const RARITY: Record<string, string> = {
  Common: "Comum", Uncommon: "Incomum", Rare: "Raro", "Very Rare": "Muito raro", Legendary: "Lendário", Artifact: "Artefato", Varies: "Varia",
};
const ARMOR: Record<string, string> = { Light: "Armadura leve", Medium: "Armadura média", Heavy: "Armadura pesada", Shield: "Escudo" };
const GEAR: Record<string, string> = {
  "standard-gear": "Equipamento geral", ammunition: "Munição", "holy-symbols": "Símbolo sagrado", "arcane-foci": "Foco arcano",
  "druidic-foci": "Foco druídico", kits: "Kit", "equipment-packs": "Pacote de equipamento",
};
const TOOL: Record<string, string> = {
  "Artisan's Tools": "Ferramentas de artesão", "Gaming Sets": "Jogo", "Musical Instrument": "Instrumento musical", "Other Tools": "Outras ferramentas",
};
const kg = (lb: number) => `${(lb * 0.45).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;

function item(e: Any) {
  const base = {
    id: e.index,
    name: e.name,
    cost: e.cost ? `${e.cost.quantity} ${COIN[e.cost.unit] ?? e.cost.unit}` : undefined,
    weight: e.weight ? kg(e.weight) : undefined,
    desc: e.desc?.length ? meters(e.desc.join("\n\n")) : undefined,
  };
  switch (e.equipment_category.index) {
    case "weapon": {
      const props: string[] = ((e.properties ?? []) as Any[]).map((p) =>
        p.index === "versatile" && e.two_handed_damage ? `versátil (${e.two_handed_damage.damage_dice})`
        : p.index === "thrown" && e.throw_range ? `arremesso (${m(e.throw_range.normal)}/${m(e.throw_range.long)} m)`
        : PROP[p.index] ?? p.name);
      if (e.weapon_range === "Ranged" && e.range?.long) props.push(`distância ${m(e.range.normal)}/${m(e.range.long)} m`);
      const finesse = ((e.properties ?? []) as Any[]).some((p) => p.index === "finesse");
      const dmg = e.damage?.damage_dice;
      return {
        ...base,
        cat: "Armas",
        sub: `Arma ${e.weapon_category === "Simple" ? "simples" : "marcial"} ${e.weapon_range === "Melee" ? "corpo a corpo" : "à distância"}`,
        dmg,
        dmgType: DMG_TYPE[e.damage?.damage_type?.index] ?? e.damage?.damage_type?.name,
        abil: dmg ? (e.weapon_range === "Ranged" || finesse ? "dex" : "str") : undefined,
        props: props.join(", ") || undefined,
      };
    }
    case "armor": {
      const a = e.armor_class;
      const dex = a.dex_bonus ? (a.max_bonus ? ` + Des (máx. ${a.max_bonus})` : " + Des") : "";
      const props = [e.str_minimum ? `For ${e.str_minimum}` : "", e.stealth_disadvantage ? "desvantagem em Furtividade" : ""].filter(Boolean).join(", ");
      return { ...base, cat: "Armaduras", sub: ARMOR[e.armor_category], ac: e.armor_category === "Shield" ? `+${a.base}` : `${a.base}${dex}`, props: props || undefined };
    }
    case "adventuring-gear": {
      const contents = ((e.contents ?? []) as Any[]).map((c) => `${c.quantity}× ${c.item.name}`).join(", ");
      return { ...base, cat: "Equipamento", sub: GEAR[e.gear_category?.index] ?? e.gear_category?.name, desc: [base.desc, contents && `Contém: ${contents}.`].filter(Boolean).join("\n\n") || undefined };
    }
    case "tools":
      return { ...base, cat: "Ferramentas", sub: TOOL[e.tool_category] ?? e.tool_category };
    default:
      return { ...base, cat: "Montarias e veículos", sub: e.vehicle_category, props: e.speed ? `deslocamento ${e.speed.quantity} ${e.speed.unit}` : undefined };
  }
}

function magicItem(e: Any) {
  const [sub, ...rest] = (e.desc ?? []) as string[];
  return { id: `magic-${e.index}`, name: e.name, cat: "Itens mágicos", sub, rarity: RARITY[e.rarity?.name] ?? e.rarity?.name, desc: meters(rest.join("\n\n")) };
}

const [monsters, spells, equipment, magic] = await Promise.all([
  get("5e-SRD-Monsters.json"), get("5e-SRD-Spells.json"), get("5e-SRD-Equipment.json"), get("5e-SRD-Magic-Items.json"),
]);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "srd-spells.json"), JSON.stringify(spells.map(spell)));
fs.writeFileSync(path.join(OUT_GM, "bestiary-dnd.json"), JSON.stringify(monsters.map(monster)));
// itens mágicos com variantes (+1/+2/+3…) entram pelas variantes
const items = [...equipment.map(item), ...magic.filter((x) => !x.variants?.length).map(magicItem)];
fs.writeFileSync(path.join(OUT_GM, "items-dnd.json"), JSON.stringify(items));
console.log(`monstros: ${monsters.length}, magias: ${spells.length}, itens: ${items.length}`);
