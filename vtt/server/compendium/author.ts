// Ajudantes para escrever blocos de criatura à mão: XP, proficiência, PV médios, Percepção passiva
// e o texto dos ataques saem das regras do 5e, para os números não se contradizerem.
import type { Monster } from "../../shared/compendium.ts";

const XP: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000,
  10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
  21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000,
};
const TOKEN: Record<string, number> = { Miúdo: 0.5, Pequeno: 1, Médio: 1, Grande: 2, Enorme: 3, Imenso: 4 };

export const crNum = (cr: string) => (cr.includes("/") ? Number(cr.split("/")[0]) / Number(cr.split("/")[1]) : Number(cr));
export const profBonus = (cr: string) => Math.max(2, Math.floor((crNum(cr) - 1) / 4) + 2);

/** Média de "2d6+3" / "1d8+1d6-1", arredondada para baixo como nos livros. */
export function avg(expr: string): number {
  let total = 0;
  for (const [, sign, n, s, k] of expr.replace(/\s/g, "").matchAll(/([+-]?)(?:(\d+)d(\d+)|(\d+))/g)) {
    const v = s ? (Number(n) * (Number(s) + 1)) / 2 : Number(k);
    total += sign === "-" ? -v : v;
  }
  return Math.floor(total);
}

/** "2d6+3" → "2d6 + 3". */
const show = (expr: string) => expr.replace(/\s/g, "").replace(/([+-])/g, " $1 ");
/** "7 (2d6 + 3) de dano de energia". */
export const dmgText = (expr: string, type: string) => `${avg(expr)} (${show(expr)}) de dano ${type}`;

const HOW = {
  melee: "Ataque corpo a corpo com arma",
  ranged: "Ataque à distância com arma",
  both: "Ataque corpo a corpo ou à distância com arma",
  power: "Ataque de poder à distância",
};

/**
 * Ataque com jogada: o texto e os botões (acerto / dano) da ficha.
 * reach: "1,5 m" (corpo a corpo) ou "24/96 m" (à distância). plus: dano extra de outro tipo.
 */
export function hit(
  name: string, how: keyof typeof HOW, atk: number, reach: string, dmg: string, type: string,
  o: { plus?: [string, string]; extra?: string; targets?: string } = {},
): Monster["actions"][number] {
  const where = how === "ranged" || how === "power" ? `distância ${reach}` : `alcance ${reach}`;
  const plus = o.plus ? ` mais ${dmgText(o.plus[0], o.plus[1])}` : "";
  return {
    name, atk, dmg: o.plus ? `${dmg}+${o.plus[0]}` : dmg,
    desc: `${HOW[how]}: +${atk} para acertar, ${where}, ${o.targets ?? "um alvo"}. Acerto: ${dmgText(dmg, type)}${plus}.${o.extra ? ` ${o.extra}` : ""}`,
  };
}

/** Ação sem jogada de ataque (salvaguarda, recarga…); dmg vira botão de dano. */
export const act = (name: string, desc: string, dmg?: string): Monster["actions"][number] => ({ name, desc, ...(dmg ? { dmg } : {}) });

type Pair = [string, string];
export interface Spec {
  id: string; name: string; group: string; size: string; type: string; alignment: string;
  ac: number; acNote?: string; hd: string; speed: string; abil: number[]; cr: string;
  saves?: string; skills?: string; senses?: string; languages?: string;
  vuln?: string; resist?: string; immune?: string; condImmune?: string;
  traits?: Pair[]; actions: Monster["actions"]; reactions?: Pair[]; legendary?: Pair[];
}

const pairs = (list?: Pair[]) => (list ?? []).map(([name, desc]) => ({ name, desc }));

export function mon(s: Spec): Monster {
  const perception = /Percepção \+(\d+)/.exec(s.skills ?? "");
  const passive = 10 + (perception ? Number(perception[1]) : Math.floor((s.abil[4] - 10) / 2));
  return {
    id: s.id, name: s.name, group: s.group, size: s.size, token: TOKEN[s.size] ?? 1, type: s.type, alignment: s.alignment,
    ac: s.ac, acNote: s.acNote, hp: avg(s.hd), hd: s.hd, speed: s.speed, abil: s.abil,
    saves: s.saves ?? "", skills: s.skills ?? "",
    senses: [s.senses, `Percepção passiva ${passive}`].filter(Boolean).join(", "),
    languages: s.languages ?? "—",
    cr: s.cr, crNum: crNum(s.cr), xp: XP[s.cr], pb: profBonus(s.cr),
    vuln: s.vuln, resist: s.resist, immune: s.immune, condImmune: s.condImmune,
    traits: pairs(s.traits), actions: s.actions, reactions: pairs(s.reactions), legendary: pairs(s.legendary),
  };
}
