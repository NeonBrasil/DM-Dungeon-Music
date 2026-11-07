// Mensagens WebSocket entre cliente e servidor.
import type { Resolve, Save } from "./combat.ts";
import type { RollMode } from "./sheet.ts";
import type { Colls, CollName, Role } from "./types.ts";

/** Lutador: um token (o PV vem da ficha vinculada ou da barra) ou uma ficha sem token. */
export interface FightRef { graphicId?: string; characterId?: string }

export type DeckOp ="shuffle" | "reset" | "draw" | "drawTable" | "play" | "discard" | "take" | "flip" | "show";

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
    // ataque: o servidor rola contra a CA (ou a resistência do alvo) e, se acertar, o dano já sai do PV.
    // use = ação da ficha do atacante ("lista:linha"); o servidor recalcula tudo a partir dela.
    t: "attack"; from: FightRef; to: FightRef; secret?: boolean;
    use?: string;
    how?: Resolve;          // como resolver (padrão: pela ação)
    save?: Save;            // atributo da resistência (how = "save")
    mode?: RollMode;        // vantagem/desvantagem escolhida à mão (soma às das condições)
    bonus?: number;         // bônus situacional no teste
    also?: FightRef[];      // outros alvos na área (resistência ou acerto automático)
    area?: number;          // raio da área, em unidades da página
    force?: boolean;        // mestre: ignora alcance, cobertura total, turno e condições que impedem
    // só mestre: ataque personalizado e CA ajustada à mão
    label?: string; ca?: number; atk?: string; dmg?: string;
  }
  // consumível da ficha (poção, medpac…): o servidor rola o efeito, restaura o recurso e gasta 1
  | { t: "consume"; characterId: string; list: string; row: number; secret?: boolean }
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
