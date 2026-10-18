// Estado da campanha no cliente: espelho das coleções que o servidor libera para este usuário.
import type { C2S, S2C } from "../shared/protocol.ts";
import type { CollName, Colls, Role } from "../shared/types.ts";
import { COLL_NAMES } from "../shared/types.ts";
import { applyPatch } from "../shared/util.ts";
import { createStore } from "./lib/store.ts";

export type Status = "connecting" | "open" | "closed" | "kicked";

interface GameState {
  campaignId: string;
  role: Role | null;
  playerId: string | null;
  colls: Colls;
  status: Status;
  serverOffset: number; // relógio do servidor - relógio local (ms)
}

const emptyColls = () => Object.fromEntries(COLL_NAMES.map((n) => [n, {}])) as unknown as Colls;

export const game = createStore<GameState>({
  campaignId: "", role: null, playerId: null, colls: emptyColls(), status: "connecting", serverOffset: 0,
});

type Listener = (msg: S2C) => void;
const eventListeners = new Set<Listener>();
/** Eventos efêmeros (ping, régua) para componentes que precisam deles. */
export function onEvent(fn: Listener) {
  eventListeners.add(fn);
  return () => {
    eventListeners.delete(fn);
  };
}

export function useColl<C extends CollName>(coll: C): Colls[C] {
  return game.use((s) => s.colls[coll]);
}

export const serverNow = () => Date.now() + game.get().serverOffset;

// ─── Credenciais ─────────────────────────────────────────────────────────────

export const gmKey = () => localStorage.getItem("dm.gmKey") ?? "";

export interface PlayerAuth { playerId: string; secret: string }
export function playerAuth(cid: string): PlayerAuth | null {
  try {
    return JSON.parse(localStorage.getItem(`dm.player.${cid}`) ?? "null");
  } catch {
    return null;
  }
}
export function setPlayerAuth(cid: string, auth: PlayerAuth | null) {
  if (auth) localStorage.setItem(`dm.player.${cid}`, JSON.stringify(auth));
  else localStorage.removeItem(`dm.player.${cid}`);
}

/** Cabeçalhos para a API HTTP (upload etc.). */
export function authHeader(): Record<string, string> {
  const s = game.get();
  if (s.role === "gm") return { "x-auth": gmKey() };
  return { "x-auth": playerAuth(s.campaignId)?.secret ?? "" };
}

// ─── Conexão ─────────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let retry = 0;
let closedByUs = false;
const outbox: string[] = [];

function apply(msg: S2C) {
  switch (msg.t) {
    case "welcome":
      game.set({ role: msg.role, playerId: msg.playerId, colls: { ...emptyColls(), ...msg.colls }, status: "open" });
      syncClock();
      break;
    case "upsert":
      game.set((s) => ({ colls: { ...s.colls, [msg.coll]: { ...s.colls[msg.coll], [msg.e.id]: msg.e } } }));
      break;
    case "remove":
      game.set((s) => {
        const next = { ...s.colls[msg.coll] } as Record<string, unknown>;
        delete next[msg.id];
        return { colls: { ...s.colls, [msg.coll]: next } };
      });
      break;
    case "time":
      clockSamples.push({ rtt: Date.now() - msg.c, offset: msg.s - (msg.c + Date.now()) / 2 });
      if (clockSamples.length >= 5) {
        const best = clockSamples.sort((a, b) => a.rtt - b.rtt)[0];
        game.set({ serverOffset: best.offset });
      }
      break;
  }
  for (const l of eventListeners) l(msg);
}

let clockSamples: { rtt: number; offset: number }[] = [];
function syncClock() {
  clockSamples = [];
  for (let i = 0; i < 5; i++) setTimeout(() => send({ t: "time", c: Date.now() }), i * 200);
}

/** asGm: entra com a chave do mestre; senão, com o segredo do jogador salvo para a campanha. */
export function connect(cid: string, asGm: boolean) {
  closedByUs = false;
  game.set({ campaignId: cid, status: "connecting" });
  const auth = asGm ? `k=${encodeURIComponent(gmKey())}` : `s=${encodeURIComponent(playerAuth(cid)?.secret ?? "")}`;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${location.host}/ws?c=${encodeURIComponent(cid)}&${auth}`);
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    while (outbox.length) sock.send(outbox.shift()!);
  };
  sock.onmessage = (ev) => apply(JSON.parse(ev.data));
  sock.onclose = (ev) => {
    if (ws !== sock) return;
    ws = null;
    if (closedByUs) return;
    if (ev.code === 4001 || ev.code === 4004) {
      game.set({ status: "kicked" });
      return;
    }
    game.set({ status: "closed" });
    retry = Math.min(retry + 1, 6);
    setTimeout(() => connect(cid, asGm), 500 * 2 ** retry);
  };
}

export function disconnect() {
  closedByUs = true;
  ws?.close();
  ws = null;
}

export function send(msg: C2S) {
  const data = JSON.stringify(msg);
  if (ws?.readyState === WebSocket.OPEN) ws.send(data);
  else if (msg.t !== "ruler" && msg.t !== "ping" && msg.t !== "time") outbox.push(data);
}

// ─── Ações ───────────────────────────────────────────────────────────────────

export const api = {
  create<C extends CollName>(coll: C, data: Colls[C][string]) {
    send({ t: "create", coll, data: data as never });
  },
  /** Aplica localmente (resposta imediata) e envia ao servidor. */
  update(coll: CollName, id: string, patch: Record<string, unknown>) {
    game.set((s) => {
      const cur = s.colls[coll][id];
      if (!cur) return {};
      const copy = structuredClone(cur) as unknown as Record<string, unknown>;
      applyPatch(copy, patch);
      return { colls: { ...s.colls, [coll]: { ...s.colls[coll], [id]: copy } } };
    });
    send({ t: "update", coll, id, patch });
  },
  remove(coll: CollName, id: string) {
    send({ t: "delete", coll, id });
  },
  chat(text: string, as?: string) {
    send({ t: "chat", text, as });
  },
  roll(expr: string, opts: { label?: string; gm?: boolean; as?: string; coc?: { target: number; mod: number }; tracker?: boolean; graphicId?: string } = {}) {
    send({ t: "roll", expr, ...opts });
  },
};

export async function uploadFile(file: Blob, name: string): Promise<string> {
  const cid = game.get().campaignId;
  const res = await fetch(`/api/campaigns/${cid}/upload?name=${encodeURIComponent(name)}`, {
    method: "POST", headers: authHeader(), body: file,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "falha no upload");
  return body.url as string;
}
