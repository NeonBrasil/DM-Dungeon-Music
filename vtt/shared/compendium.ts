// Compêndio do mestre: bestiário e itens por sistema. O servidor só entrega ao mestre (/api/compendium/<nome>).

export type CompSystem = "dnd" | "sw";
export const COMP_SYSTEMS: [CompSystem, string][] = [["dnd", "D&D 5e"], ["sw", "Star Wars"]];

export interface Monster {
  id: string; name: string; size: string; token: number; type: string; alignment: string;
  ac: number; acNote?: string; hp: number; hd: string; speed: string; abil: number[];
  saves: string; skills: string; senses: string; languages: string; cr: string; crNum: number; xp: number; pb: number;
  vuln?: string; resist?: string; immune?: string; condImmune?: string;
  group?: string;        // facção / pasta (Star Wars)
  traits: { name: string; desc: string }[];
  actions: { name: string; desc: string; atk?: number; dmg?: string }[];
  reactions: { name: string; desc: string }[];
  legendary: { name: string; desc: string }[];
}

export interface Item {
  id: string;
  name: string;
  cat: string;           // pasta: Armas, Armaduras, Blasters…
  sub?: string;          // linha curta abaixo do nome
  cost?: string;
  weight?: string;
  dmg?: string;          // arma: dado de dano (vira ataque na ficha)
  dmgType?: string;
  abil?: "str" | "dex";  // atributo do ataque
  props?: string;
  ac?: string;           // armadura / escudo
  rarity?: string;
  desc?: string;
}
