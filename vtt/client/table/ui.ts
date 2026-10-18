// Estado de interface da mesa (local a este navegador).
import type { Layer, Page, TemplateType, WorldLink } from "../../shared/types.ts";
import { createStore } from "../lib/store.ts";
import { game, useColl } from "../game.ts";

export type Tool = "select" | "ruler" | "fog" | "draw" | "template" | "walls";
export type SideTab = "chat" | "journal" | "library" | "music" | "page" | "compendium" | "cards";
export type DrawMode = "free" | "line" | "rect" | "ellipse" | "text";

export const ui = createStore({
  tool: "select" as Tool,
  layer: "tokens" as Layer,
  selected: [] as string[],
  viewPageId: null as string | null,       // página que o mestre está vendo
  fogMode: "reveal" as "reveal" | "hide",
  fogShape: "brush" as "brush" | "rect" | "room",
  fogBrush: 1,
  drawMode: "free" as DrawMode,
  drawColor: "#e74c3c",
  drawWidth: 4,
  drawFill: false,
  tplType: "circle" as TemplateType,
  wallMode: "wall" as "wall" | "door" | "erase",
  showWalls: false,
  lightPreview: false,                     // mestre: ver como o token selecionado
  sheets: [] as string[],                  // fichas abertas
  handouts: [] as string[],
  showTurns: false,
  showTemplates: false,
  srd: [] as string[],                     // janelas do compêndio abertas ("m:id" / "s:id")
  sideTab: "chat" as SideTab,
  sideCollapsed: typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches, // celular começa com o tabuleiro livre
  speakAs: "",                             // id do personagem usado no chat
  generator: null as null | "dungeon" | "cave" | "city" | "region",
  genPreset: null as WorldLink | null,     // abre o gerador já num lugar (mundo interligado)
});

/** Centro da visão do tabuleiro em coordenadas do mundo (o Board preenche). */
export const boardCenter: { get: () => [number, number] | null } = { get: () => null };

export function useViewPage(): Page | null {
  const role = game.use((s) => s.role);
  const pages = useColl("pages");
  const settings = useColl("settings").main;
  const viewPageId = ui.use((s) => s.viewPageId);
  const id = role === "gm" && viewPageId && pages[viewPageId] ? viewPageId : settings?.playerPageId;
  return id ? pages[id] ?? null : null;
}

export function canControl(controlledBy: string[] | undefined): boolean {
  const { role, playerId } = game.get();
  if (role === "gm") return true;
  if (!controlledBy) return false;
  return controlledBy.includes("all") || (!!playerId && controlledBy.includes(playerId));
}

export function openSheet(id: string) {
  ui.set((s) => ({ sheets: s.sheets.includes(id) ? s.sheets : [...s.sheets, id] }));
}
export function closeSheet(id: string) {
  ui.set((s) => ({ sheets: s.sheets.filter((x) => x !== id) }));
}
export function openHandout(id: string) {
  ui.set((s) => ({ handouts: s.handouts.includes(id) ? s.handouts : [...s.handouts, id] }));
}
export function closeHandout(id: string) {
  ui.set((s) => ({ handouts: s.handouts.filter((x) => x !== id) }));
}

/** Distância da régua em unidades da página (regra de diagonais configurável). */
export function measure(pts: number[], page: Page, diagonal: "dnd" | "alt" | "euclid"): string {
  let cells = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const dx = Math.abs(pts[i] - pts[i - 2]) / page.gridSize;
    const dy = Math.abs(pts[i + 1] - pts[i - 1]) / page.gridSize;
    if (diagonal === "euclid") cells += Math.hypot(dx, dy);
    else if (diagonal === "alt") cells += Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
    else cells += Math.max(dx, dy);
  }
  const v = Math.round(cells * page.scale * 10) / 10;
  return `${v} ${page.unit}`;
}

/** Página já criada para um lugar do mundo (mesmo gerador e semente). */
export function linkedPage(link: WorldLink): Page | undefined {
  return Object.values(game.get().colls.pages).find((p) => p.source?.kind === link.kind && p.source.seed === link.seed);
}

/** Cor do usuário (jogador) ou dourado (mestre). */
export function myColor(): string {
  const { playerId, colls } = game.get();
  return (playerId && colls.players[playerId]?.color) || "#d4a73a";
}
