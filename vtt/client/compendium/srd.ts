// Compêndio: magias D&D 5e (SRD 5.1, CC-BY-4.0) para todos, carregadas sob demanda; bestiário e
// itens de cada sistema só para o mestre (o servidor recusa jogadores em /api/compendium).
import type { Character } from "../../shared/types.ts";
import type { CompSystem, Item, Monster } from "../../shared/compendium.ts";
import { newId } from "../../shared/util.ts";
import { gmKey } from "../game.ts";

export type SrdMonster = Monster;

export interface SrdSpell {
  id: string; name: string; level: number; school: string; time: string; range: string; components: string; material?: string;
  duration: string; concentration: boolean; ritual: boolean; classes: string[]; dmg?: string; dmgType?: string; dc?: string; aoe?: string;
  desc: string; higher?: string;
}

let spells: Promise<SrdSpell[]> | null = null;
const gmCache = new Map<string, Promise<unknown>>();

function gmData<T>(name: string): Promise<T> {
  let p = gmCache.get(name);
  if (!p) {
    p = fetch(`/api/compendium/${name}`, { headers: { "x-gm-key": gmKey() } }).then((r) => {
      if (!r.ok) throw new Error("só o mestre");
      return r.json();
    });
    p.catch(() => gmCache.delete(name));
    gmCache.set(name, p);
  }
  return p as Promise<T>;
}

export const loadMonsters = (sys: CompSystem) => gmData<Monster[]>(`bestiary-${sys}`);
export const loadItems = (sys: CompSystem) => gmData<Item[]>(`items-${sys}`);
export function loadSpells(): Promise<SrdSpell[]> {
  spells ??= import("../data/srd-spells.json").then((m) => m.default as unknown as SrdSpell[]);
  return spells;
}

export const mod = (v: number) => Math.floor((v - 10) / 2);
export const fmtMod = (v: number) => (mod(v) >= 0 ? `+${mod(v)}` : String(mod(v)));

/** Ficha de criatura (modelo "dnd5e-npc" ou "sw5e-npc") a partir do bloco do bestiário. */
export function monsterCharacter(m: Monster, sys: CompSystem): Character {
  const [str, dex, con, int, wis, cha] = m.abil;
  const dark = /visão no escuro ([\d,]+) m/.exec(m.senses);
  return {
    id: newId(),
    name: m.name,
    template: sys === "sw" ? "sw5e-npc" : "dnd5e-npc",
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

export const CREDIT: Record<CompSystem, string> = {
  dnd: "Monstros e itens do SRD 5.1 (Wizards of the Coast), licença CC-BY-4.0, via 5e-bits/5e-database. Textos em inglês.",
  sw: "Star Wars: blocos e itens escritos para esta mesa no estilo SW5e (não oficial); números aproximados. Star Wars © Lucasfilm.",
};
export const SPELL_CREDIT = "Magias do SRD 5.1 (Wizards of the Coast), licença CC-BY-4.0, via 5e-bits/5e-database. Textos em inglês.";
