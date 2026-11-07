import type { DoorSeg, Rect, WorldLink } from "../../shared/types.ts";
import type { Dungeon } from "./dungeon.ts";

/** Resultado pronto de um gerador: sabe se desenhar em qualquer escala. */
export interface Built {
  title: string;
  notes?: string;
  cols: number;           // células (grade da mesa)
  rows: number;
  grid: boolean;          // a mesa deve mostrar grade por cima?
  bg: string;             // cor de fundo da página
  scale: { value: number; unit: string };
  /** Desenha o mapa com `cell` px por célula; gm = inclui números/segredos. */
  render(cell: number, gm: boolean): HTMLCanvasElement;
  rooms?: Rect[][];
  gmLabels?: { x: number; y: number; text: string; color: string; size?: number }[]; // em células (centro)
  walls?: number[];       // segmentos [x1, y1, x2, y2, …] em células (iluminação dinâmica)
  doors?: { x1: number; y1: number; x2: number; y2: number; open?: boolean; locked?: boolean; secret?: boolean; seeThrough?: boolean; seal?: DoorSeg["seal"] }[];
  /** Lugares que abrem outro gerador (mundo interligado): posição do símbolo, em células. */
  links?: { x: number; y: number; link: WorldLink }[];
  /** Masmorra editável à mão: o mapa original e como redesenhar a partir de uma cópia editada. */
  editable?: { dungeon: Dungeon; rebuild(d: Dungeon): Built };
}

export type GenKind = "dungeon" | "cave" | "city" | "region";
