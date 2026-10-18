// Mensagens WebSocket entre cliente e servidor.
import type { Colls, CollName, Role } from "./types.ts";

export type DeckOp = "shuffle" | "reset" | "draw" | "drawTable" | "play" | "discard" | "take" | "flip" | "show";

export type C2S =
  | { t: "create"; coll: CollName; data: { id: string } & Record<string, unknown> }
  | { t: "update"; coll: CollName; id: string; patch: Record<string, unknown> }
  | { t: "delete"; coll: CollName; id: string }
  | { t: "chat"; text: string; as?: string }
  | {
    t: "roll"; expr: string; label?: string; gm?: boolean; as?: string;
    coc?: { target: number; mod: number }; tracker?: boolean; graphicId?: string;
  }
  | { t: "ping"; pageId: string; x: number; y: number; pull?: boolean }
  | { t: "ruler"; pageId: string; pts: number[] | null }
  | { t: "door"; pageId: string; doorId: string }
  | {
    t: "deck"; op: DeckOp; deckId?: string; cardId?: string; graphicId?: string;
    to?: string; pageId?: string; x?: number; y?: number; faceUp?: boolean;
  }
  | { t: "time"; c: number };

export type S2C =
  | { t: "welcome"; role: Role; playerId: string | null; colls: Partial<Colls>; now: number }
  | { t: "upsert"; coll: CollName; e: { id: string } }
  | { t: "remove"; coll: CollName; id: string }
  | { t: "ping"; from: string; color: string; pageId: string; x: number; y: number; pull?: boolean }
  | { t: "ruler"; from: string; color: string; pageId: string; pts: number[] | null }
  | { t: "time"; c: number; s: number }
  | { t: "error"; msg: string };
