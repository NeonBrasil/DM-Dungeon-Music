// Catálogo de geradores e seus parâmetros (o formulário do estúdio é montado daqui).
import { buildDungeon } from "./buildDungeon.ts";
import { STYLES, type StyleName } from "./ink.ts";
import { THEMES, type Theme, type Title } from "./names.ts";
import type { Built, GenKind } from "./types.ts";
import type { DungeonSize } from "./dungeon.ts";
import { buildCave, type CaveSize } from "./cave.ts";
import { buildCity, CITY_STYLES, type CitySize, type CityStyle } from "./city.ts";
import { buildRegion, REGION_STYLES, type RegionShape, type RegionStyle } from "./region.ts";

export type ParamDef =
  | { key: string; label: string; type: "select"; options: [string, string][] }
  | { key: string; label: string; type: "check" }
  | { key: string; label: string; type: "range"; min: number; max: number; step?: number };

export interface KindDef {
  id: GenKind;
  label: string;
  icon: string;
  desc: string;
  battlemap: boolean;
  params: ParamDef[];
  defaults: Record<string, unknown>;
  build(p: Record<string, unknown> & { seed: string }): Built;
}

const styleOptions = Object.entries(STYLES).map(([k, s]) => [k, s.label] as [string, string]);

export const KINDS: KindDef[] = [
  {
    id: "dungeon",
    label: "Masmorra",
    icon: "door",
    desc: "Salas, corredores e segredos",
    battlemap: true,
    params: [
      { key: "size", label: "Tamanho", type: "select", options: [["small", "Pequena"], ["medium", "Média"], ["large", "Grande"], ["huge", "Enorme"]] },
      { key: "theme", label: "Tema", type: "select", options: THEMES.map((t) => [t.id, t.label]) },
      { key: "style", label: "Estilo", type: "select", options: styleOptions },
    ],
    defaults: { size: "medium", theme: "cripta", style: "classic" },
    build: (p) => buildDungeon({ seed: p.seed, size: p.size as DungeonSize, theme: p.theme as Theme, style: p.style as StyleName, title: p.title as Title | undefined }),
  },
  {
    id: "cave",
    label: "Caverna",
    icon: "target",
    desc: "Grutas naturais e lagos",
    battlemap: true,
    params: [
      { key: "size", label: "Tamanho", type: "select", options: [["small", "Pequena"], ["medium", "Média"], ["large", "Grande"]] },
      { key: "style", label: "Estilo", type: "select", options: styleOptions },
      { key: "open", label: "Espaço aberto", type: "range", min: 1, max: 5 },
      { key: "water", label: "Lagos subterrâneos", type: "check" },
    ],
    defaults: { size: "medium", style: "dark", open: 3, water: true },
    build: (p) => buildCave({ seed: p.seed, size: p.size as CaveSize, style: p.style as StyleName, water: !!p.water, open: Number(p.open), name: p.name as string | undefined }),
  },
  {
    id: "city",
    label: "Cidade / Vila",
    icon: "home",
    desc: "Muralhas, bairros e porto",
    battlemap: false,
    params: [
      { key: "size", label: "Tamanho", type: "select", options: [["village", "Aldeia"], ["town", "Vila"], ["city", "Cidade"], ["capital", "Grande cidade"]] },
      { key: "style", label: "Estilo", type: "select", options: Object.entries(CITY_STYLES).map(([k2, v]) => [k2, v.label] as [string, string]) },
      { key: "walls", label: "Muralhas", type: "check" },
      { key: "citadel", label: "Castelo", type: "check" },
      { key: "river", label: "Rio", type: "check" },
      { key: "coast", label: "Litoral", type: "check" },
    ],
    defaults: { size: "town", style: "parchment", walls: true, citadel: true, river: false, coast: false },
    build: (p) => buildCity({
      seed: p.seed, size: p.size as CitySize, style: p.style as CityStyle,
      walls: !!p.walls, citadel: !!p.citadel, river: !!p.river, coast: !!p.coast, name: p.name as string | undefined,
    }),
  },
  {
    id: "region",
    label: "Região",
    icon: "map",
    desc: "Costas, rios, reinos",
    battlemap: false,
    params: [
      { key: "shape", label: "Formato", type: "select", options: [["coast", "Litoral"], ["island", "Ilha"], ["continent", "Interior"], ["archipelago", "Arquipélago"]] },
      { key: "size", label: "Tamanho", type: "select", options: [["small", "Pequena"], ["medium", "Média"], ["large", "Grande"]] },
      { key: "style", label: "Estilo", type: "select", options: Object.entries(REGION_STYLES).map(([k2, v]) => [k2, v.label] as [string, string]) },
      { key: "hex", label: "Grade hexagonal", type: "check" },
    ],
    defaults: { shape: "coast", size: "medium", style: "parchment", hex: false },
    build: (p) => buildRegion({ seed: p.seed, shape: p.shape as RegionShape, size: p.size as "small" | "medium" | "large", style: p.style as RegionStyle, hex: !!p.hex, name: p.name as string | undefined }),
  },
];
