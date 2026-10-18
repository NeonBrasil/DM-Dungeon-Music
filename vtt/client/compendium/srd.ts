// Compêndio D&D 5e (SRD 5.1, Wizards of the Coast, CC-BY-4.0): carregado sob demanda.
import type { Character } from "../../shared/types.ts";
import { newId } from "../../shared/util.ts";

export interface SrdMonster {
  id: string; name: string; size: string; token: number; type: string; alignment: string;
  ac: number; acNote?: string; hp: number; hd: string; speed: string; abil: number[];
  saves: string; skills: string; senses: string; languages: string; cr: string; crNum: number; xp: number; pb: number;
  vuln?: string; resist?: string; immune?: string; condImmune?: string;
  traits: { name: string; desc: string }[];
  actions: { name: string; desc: string; atk?: number; dmg?: string }[];
  reactions: { name: string; desc: string }[];
  legendary: { name: string; desc: string }[];
}

export interface SrdSpell {
  id: string; name: string; level: number; school: string; time: string; range: string; components: string; material?: string;
  duration: string; concentration: boolean; ritual: boolean; classes: string[]; dmg?: string; dmgType?: string; dc?: string; aoe?: string;
  desc: string; higher?: string;
}

let monsters: Promise<SrdMonster[]> | null = null;
let spells: Promise<SrdSpell[]> | null = null;

export function loadMonsters(): Promise<SrdMonster[]> {
  monsters ??= import("../data/srd-monsters.json").then((m) => m.default as unknown as SrdMonster[]);
  return monsters;
}
export function loadSpells(): Promise<SrdSpell[]> {
  spells ??= import("../data/srd-spells.json").then((m) => m.default as unknown as SrdSpell[]);
  return spells;
}

export const mod = (v: number) => Math.floor((v - 10) / 2);
export const fmtMod = (v: number) => (mod(v) >= 0 ? `+${mod(v)}` : String(mod(v)));

/** Ficha de criatura (modelo "dnd5e-npc") a partir do bloco do SRD. */
export function monsterCharacter(m: SrdMonster): Character {
  const [str, dex, con, int, wis, cha] = m.abil;
  const dark = /visão no escuro ([\d,]+) m/.exec(m.senses);
  return {
    id: newId(),
    name: m.name,
    template: "dnd5e-npc",
    controlledBy: [],
    shared: false,
    data: {
      srd: m.id, kind: m.type, size: m.size, alignment: m.alignment, cr: m.cr, xp: m.xp, pb: m.pb, token_size: m.token,
      str, dex, con, int, wis, cha, ac: m.ac, hp: m.hp, hp_max: m.hp, hd: m.hd, speed: m.speed,
      saves: m.saves, skills: m.skills, senses: m.senses, languages: m.languages,
      resist: m.resist ?? "", immune: m.immune ?? "", vuln: m.vuln ?? "", condImmune: m.condImmune ?? "",
      darkvision: dark ? Number(dark[1].replace(",", ".")) : 0,
      traits: m.traits.map((t) => ({ name: t.name, desc: t.desc })),
      actions: m.actions.map((a) => ({ name: a.name, atk: a.atk !== undefined ? String(a.atk) : "", dmg: a.dmg ?? "", desc: a.desc })),
      reactions: m.reactions.map((r) => `${r.name}. ${r.desc}`).join("\n\n"),
      legendary: m.legendary.map((r) => `${r.name}. ${r.desc}`).join("\n\n"),
    },
  };
}

export const SRD_CREDIT = "Monstros e magias do SRD 5.1 (Wizards of the Coast), licença CC-BY-4.0, via 5e-bits/5e-database. Textos em inglês.";
