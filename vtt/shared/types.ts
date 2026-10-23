// Modelo de dados da campanha. Servidor e cliente usam os mesmos tipos.

export type Role = "gm" | "player";
export type Layer = "map" | "tokens" | "gm";

export interface Rect { x: number; y: number; w: number; h: number }

export interface TurnEntry {
  id: string;
  name: string;
  value: number;
  graphicId?: string;
}

/** Botão da barra de macros: texto enviado ao chat (aceita ?{pergunta} e @{Ficha|campo}). */
export interface Macro { id: string; label: string; text: string }

export interface Settings {
  id: "main";
  name: string;
  playerPageId: string | null;
  diagonal: "dnd" | "alt" | "euclid"; // contagem de diagonais da régua
  turns: { entries: TurnEntry[]; current: number; round: number; open: boolean };
  gmMacros?: Macro[];    // só o mestre recebe
}

export interface Player {
  id: string;
  name: string;
  color: string;
  online?: boolean;
  macros?: Macro[];
}

/** Porta: segmento que bloqueia visão/movimento enquanto fechada. */
export interface DoorSeg {
  id: string;
  x1: number; y1: number; x2: number; y2: number; // px do mundo
  open: boolean;
  locked?: boolean;      // jogadores não abrem
  secret?: boolean;      // jogadores não veem a porta (é parede até o mestre abrir)
  seeThrough?: boolean;  // grade levadiça: bloqueia passagem, não a visão
}

export type WeatherType = "none" | "rain" | "storm" | "snow" | "fog" | "embers" | "ash" | "leaves" | "sand";

export interface Page {
  id: string;
  name: string;
  order: number;
  cols: number;          // tamanho em células
  rows: number;
  gridSize: number;      // px por célula
  grid: "square" | "none";
  gridColor: string;
  gridOpacity: number;
  scale: number;         // distância por célula (ex.: 1.5)
  unit: string;          // ex.: "m"
  bg: string;
  fogOn: boolean;
  fog: string;           // bitset base64, 1 = célula revelada
  rooms?: Rect[][];      // áreas (em células) para revelar com um clique
  walls?: number[];      // segmentos [x1, y1, x2, y2, …] em px do mundo
  doors?: DoorSeg[];
  light?: { on: boolean; global: boolean; explore: boolean };
  weather?: { type: WeatherType; intensity: number };
  music?: string[];      // trilha da cena (ids de faixas)
  musicReplace?: boolean; // ao levar os jogadores, para as outras músicas
  source?: WorldLink;    // lugar gerado que virou esta página (marcadores levam até ela)
}

export interface Aura { radius: number; color: string }               // raio em unidades da página
export interface Vision { on: boolean; range: number; dark: number }  // unidades; range 0 = ilimitado
export interface Light { bright: number; dim: number; color: string } // unidades

export type TemplateType = "circle" | "cone" | "line" | "square";
/** Molde de área: origem relativa a (x, y); size em px (raio/comprimento/lado); angle em radianos. */
export interface Tpl { type: TemplateType; ox: number; oy: number; size: number; angle: number }

export type GraphicKind = "image" | "token" | "text" | "path" | "shape" | "template" | "card";

export interface WorldLink {
  kind: "dungeon" | "cave" | "city" | "region";
  seed: string;
  params: Record<string, unknown>;
  label: string;
  pageId?: string;       // local feito à mão que leva a uma página que já existe
}

export interface Graphic {
  id: string;
  pageId: string;
  layer: Layer;
  z: number;
  kind: GraphicKind;
  x: number;             // px do mundo (canto superior esquerdo)
  y: number;
  w: number;
  h: number;
  src?: string;
  color?: string;
  text?: string;
  name?: string;
  showName?: boolean;
  characterId?: string;
  unlinked?: boolean;    // barra de vida própria (ex.: vários goblins da mesma ficha)
  controlledBy: string[]; // ids de jogadores ou "all"
  bar?: { value: number; max: number } | null;
  markers?: string[];    // condições
  aura?: Aura | null;
  vision?: Vision | null;
  light?: Light | null;
  locked?: boolean;
  // desenhos
  pts?: number[];        // caminho: pontos relativos a (x, y)
  stroke?: string;
  fill?: string | null;
  strokeWidth?: number;
  shape?: "rect" | "ellipse";
  tpl?: Tpl;
  card?: { deckId: string; cardId: string; faceUp: boolean };
  link?: WorldLink | null; // marcador do mestre que abre um gerador
}

export interface Character {
  id: string;
  name: string;
  avatar?: string;
  template: string;
  data: Record<string, unknown>;
  controlledBy: string[];
  shared: boolean;       // visível (leitura) para todos
  gmNotes?: string;
}

export type FieldType =
  | "text" | "number" | "textarea" | "checkbox"
  | "resource" | "computed" | "attribute" | "skill" | "roll" | "list";

export interface SheetField {
  type: FieldType;
  id?: string;
  label?: string;
  default?: string | number | boolean;
  formula?: string;      // computed / attribute (modificador)
  roll?: string;         // fórmula de dados (@{campo} vira número)
  check?: "coc" | "op";  // coc: d100 ≤ valor · op: Ordem Paranormal (valor do atributo = nº de d20)
  ability?: string;      // skill: atributo base (rótulo; em "op" é o id do atributo)
  tracker?: boolean;     // rolagem vai para a iniciativa
  span?: number;         // colunas ocupadas
  columns?: SheetField[]; // list: colunas de cada linha
  hint?: string;         // dica curta (ex.: "só treinada")
}

export interface SheetSection {
  title: string;
  columns?: number;
  fields: SheetField[];
}

export interface SheetTemplate {
  id: string;
  name: string;
  builtin?: boolean;
  advantage?: boolean;   // mostra seletor vantagem/desvantagem (d20)
  sections: SheetSection[];
}

export interface Die { v: number; drop?: boolean; boom?: boolean }
export type RollSeg =
  | { k: "dice"; src: string; sides: number; rolls: Die[] }
  | { k: "txt"; v: string };

export interface RollResult {
  expr: string;
  total: number;
  segs: RollSeg[];
  coc?: { target: number; tens: number[]; units: number; level: CocLevel };
}
export type CocLevel = "critical" | "extreme" | "hard" | "regular" | "failure" | "fumble";

export interface ChatMsg {
  id: string;
  ts: number;
  from: string;          // id do jogador ou "gm"
  name: string;
  color: string;
  avatar?: string;
  kind: "text" | "roll" | "emote" | "desc" | "system";
  text?: string;
  label?: string;
  roll?: RollResult;
  inline?: RollResult[]; // [[ ]] dentro do texto
  whisper?: string[];    // destinatários; ausente = público
  card?: { deck: string; name: string; image?: string; suit?: string; rank?: string; text?: string; deckId?: string; cardId?: string };
}

export interface Track {
  id: string;
  name: string;
  src: string;
  kind: "music" | "sfx";
  volume: number;        // 0..1
  loop: boolean;
  playing: boolean;
  startedAt: number;     // relógio do servidor (ms) em que offset 0 tocaria
  pausedAt?: number;     // posição (s) ao pausar, para retomar
  order?: number;
}

export interface Handout {
  id: string;
  name: string;
  image?: string;
  text: string;
  shared: boolean;       // todos veem
  visibleTo?: string[];  // ou só estes jogadores
}

export interface Asset {
  id: string;
  name: string;
  url: string;
  type: "image" | "audio";
  w?: number;
  h?: number;
}

export interface Card { id: string; name: string; image?: string; text?: string; suit?: string; rank?: string }

export interface Deck {
  id: string;
  name: string;
  kind: "standard" | "tarot" | "custom";
  cards: Card[];
  pile: string[];        // monte (ordem secreta; jogadores recebem só a contagem)
  pileCount?: number;
  discard: string[];
  hands: Record<string, string[]>; // id do jogador ("gm" = mestre) → cartas na mão
  handCounts?: Record<string, number>;
  back?: string;         // imagem do verso
}

export interface Colls {
  settings: Record<string, Settings>;
  players: Record<string, Player>;
  pages: Record<string, Page>;
  graphics: Record<string, Graphic>;
  characters: Record<string, Character>;
  templates: Record<string, SheetTemplate>;
  chat: Record<string, ChatMsg>;
  tracks: Record<string, Track>;
  handouts: Record<string, Handout>;
  assets: Record<string, Asset>;
  decks: Record<string, Deck>;
}

export type CollName = keyof Colls;
export type Entity<C extends CollName> = Colls[C][string];

export const COLL_NAMES: CollName[] = [
  "settings", "players", "pages", "graphics", "characters",
  "templates", "chat", "tracks", "handouts", "assets", "decks",
];

/** Tipos de gráfico que jogadores podem criar e apagar (desenhos e moldes). */
export const DRAWING_KINDS: GraphicKind[] = ["path", "shape", "text", "template"];
