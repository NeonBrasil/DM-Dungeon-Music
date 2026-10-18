// Sala ao vivo de uma campanha: aplica operações, checa permissões e envia a cada
// cliente só o que ele pode ver (jogadores nunca recebem camada do mestre, notas, etc.).
import crypto from "node:crypto";
import type { WebSocket } from "ws";
import type { C2S, S2C } from "../shared/protocol.ts";
import type {
  ChatMsg, CollName, Colls, Deck, Graphic, Page, Role, RollResult, Settings,
} from "../shared/types.ts";
import { COLL_NAMES, DRAWING_KINDS } from "../shared/types.ts";
import { applyPatch, ID_RE, newId } from "../shared/util.ts";
import { DiceError, parse, roll, rollCoc } from "../shared/dice.ts";
import { blockingSegments, crossesWall } from "../shared/vision.ts";
import type { CampaignFile } from "./store.ts";

export interface Client {
  ws: WebSocket;
  role: Role;
  playerId: string | null;
  known: Map<CollName, Set<string>>;
}

type AnyEntity = { id: string } & Record<string, any>;

const rng = (sides: number) => crypto.randomInt(1, sides + 1);

const CHAT_LIMIT = 500;
const GM_COLOR = "#c9a227";

// Campos que um jogador pode alterar em tokens que controla.
const PLAYER_TOKEN_KEYS = ["x", "y", "bar.value", "markers", "aura", "light"];
// …e em desenhos/moldes que criou.
const PLAYER_DRAWING_KEYS = ["x", "y", "w", "h", "pts", "stroke", "fill", "strokeWidth", "shape", "text", "color", "tpl", "name"];
// Coleções que dependem da página dos jogadores (settings.playerPageId).
const PAGE_DEPENDENT: CollName[] = ["pages", "graphics"];

const keyIn = (k: string, allowed: string[]) => allowed.some((a) => k === a || k.startsWith(`${a}.`));

export class Room {
  readonly clients = new Set<Client>();
  private onlineCount = new Map<string, number>();
  readonly camp: CampaignFile;
  private readonly changed: () => void;

  constructor(camp: CampaignFile, changed: () => void) {
    this.camp = camp;
    this.changed = changed;
  }

  private get c(): Colls {
    return this.camp.colls;
  }

  private get settings(): Settings {
    return this.c.settings.main;
  }

  // ─── Conexões ──────────────────────────────────────────────────────────────

  join(ws: WebSocket, role: Role, playerId: string | null): Client {
    const client: Client = {
      ws, role, playerId,
      known: new Map(COLL_NAMES.map((n) => [n, new Set<string>()])),
    };
    this.clients.add(client);
    if (playerId) {
      this.onlineCount.set(playerId, (this.onlineCount.get(playerId) ?? 0) + 1);
      this.setOnline(playerId, true);
    }
    const colls: Record<string, Record<string, unknown>> = {};
    for (const coll of COLL_NAMES) {
      colls[coll] = {};
      for (const [id, e] of Object.entries(this.c[coll] ?? {})) {
        const v = this.view(coll, e as AnyEntity, client);
        if (v) {
          colls[coll][id] = v;
          client.known.get(coll)!.add(id);
        }
      }
    }
    this.send(client, { t: "welcome", role, playerId, colls: colls as Partial<Colls>, now: Date.now() });
    ws.on("message", (raw) => {
      let msg: C2S;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      try {
        this.handle(client, msg);
      } catch (err) {
        this.send(client, { t: "error", msg: err instanceof Error ? err.message : "erro" });
      }
    });
    ws.on("close", () => this.leave(client));
    return client;
  }

  private leave(client: Client) {
    this.clients.delete(client);
    const pid = client.playerId;
    if (pid) {
      const n = (this.onlineCount.get(pid) ?? 1) - 1;
      this.onlineCount.set(pid, n);
      if (n <= 0) this.setOnline(pid, false);
    }
  }

  private setOnline(pid: string, online: boolean) {
    const p = this.c.players[pid];
    if (!p || p.online === online) return;
    p.online = online;
    this.push("players", pid);
  }

  /** Fecha conexões de um jogador removido. */
  kick(playerId: string) {
    for (const cl of this.clients) if (cl.playerId === playerId) cl.ws.close(4001, "removido");
  }

  private send(client: Client, msg: S2C) {
    if (client.ws.readyState === 1) client.ws.send(JSON.stringify(msg));
  }

  // ─── Visibilidade ──────────────────────────────────────────────────────────

  private controls(client: Client, controlledBy: string[] | undefined): boolean {
    if (client.role === "gm") return true;
    if (!controlledBy) return false;
    return controlledBy.includes("all") || (!!client.playerId && controlledBy.includes(client.playerId));
  }

  /** Versão da entidade que o cliente pode ver, ou null. */
  view(coll: CollName, e: AnyEntity, client: Client): AnyEntity | null {
    if (client.role === "gm") return e;
    const playerPage = this.settings.playerPageId;
    const pid = client.playerId ?? "";
    switch (coll) {
      case "pages": {
        if (e.id !== playerPage) return null;
        const p = e as unknown as Page;
        // portas secretas fechadas viram parede comum: jogador não sabe que é porta
        const hidden = (p.doors ?? []).filter((d) => d.secret && !d.open);
        if (!hidden.length) return e;
        return {
          ...p,
          doors: (p.doors ?? []).filter((d) => !(d.secret && !d.open)),
          walls: [...(p.walls ?? []), ...hidden.flatMap((d) => [d.x1, d.y1, d.x2, d.y2])],
        } as unknown as AnyEntity;
      }
      case "graphics": {
        if (e.pageId !== playerPage || e.layer === "gm") return null;
        const g = e as unknown as Graphic;
        if (g.kind === "card" && g.card && !g.card.faceUp && !this.controls(client, g.controlledBy)) {
          return { ...g, card: { ...g.card, cardId: "" } } as unknown as AnyEntity;
        }
        return e;
      }
      case "characters": {
        if (!this.controls(client, e.controlledBy) && !e.shared) return null;
        const { gmNotes: _omit, ...rest } = e;
        return rest as AnyEntity;
      }
      case "chat":
        return !e.whisper || e.from === pid || e.whisper.includes(pid) ? e : null;
      case "tracks":
        return e.playing ? e : null;
      case "handouts":
        return e.shared || (e.visibleTo ?? []).includes(pid) ? e : null;
      case "assets":
        return null;
      case "decks": {
        const d = e as unknown as Deck;
        return {
          ...d,
          pile: [],
          pileCount: d.pile.length,
          hands: { [pid]: d.hands[pid] ?? [] },
          handCounts: Object.fromEntries(Object.entries(d.hands).map(([k, v]) => [k, v.length])),
        } as unknown as AnyEntity;
      }
      case "settings": {
        const s = e as unknown as Settings;
        const hidden = (gid?: string) => !!gid && this.c.graphics[gid]?.layer === "gm";
        const curId = s.turns.entries[s.turns.current]?.id;
        const entries = s.turns.entries.filter((en) => !hidden(en.graphicId));
        const { gmMacros: _omit, ...rest } = s;
        return {
          ...rest,
          turns: { ...s.turns, entries, current: entries.findIndex((en) => en.id === curId) },
        } as unknown as AnyEntity;
      }
      default:
        return e;
    }
  }

  private pushTo(client: Client, coll: CollName, id: string) {
    const known = client.known.get(coll)!;
    const e = this.c[coll][id] as AnyEntity | undefined;
    const v = e ? this.view(coll, e, client) : null;
    if (v) {
      known.add(id);
      this.send(client, { t: "upsert", coll, e: v });
    } else if (known.has(id)) {
      known.delete(id);
      this.send(client, { t: "remove", coll, id });
    }
  }

  /** Envia a mudança de uma entidade a todos (upsert, remove ou nada). */
  push(coll: CollName, id: string) {
    for (const cl of this.clients) this.pushTo(cl, coll, id);
  }

  /** Reavalia visibilidade de coleções inteiras (ex.: mestre trocou a página dos jogadores). */
  private resync(colls: CollName[]) {
    for (const cl of this.clients) {
      for (const coll of colls) {
        const known = cl.known.get(coll)!;
        const ids = new Set([...known, ...Object.keys(this.c[coll])]);
        for (const id of ids) {
          const e = this.c[coll][id] as AnyEntity | undefined;
          const visible = !!e && !!this.view(coll, e, cl);
          if (visible !== known.has(id)) this.pushTo(cl, coll, id);
        }
      }
    }
  }

  // ─── Operações ─────────────────────────────────────────────────────────────

  handle(client: Client, msg: C2S) {
    switch (msg.t) {
      case "create": return this.create(client, msg.coll, msg.data);
      case "update": return this.update(client, msg.coll, msg.id, msg.patch);
      case "delete": return this.remove(client, msg.coll, msg.id);
      case "chat": return this.chat(client, String(msg.text ?? ""), msg.as);
      case "roll": return this.rollRequest(client, msg);
      case "door": return this.toggleDoor(client, msg.pageId, msg.doorId);
      case "deck": return this.deckOp(client, msg);
      case "ping":
      case "ruler": {
        if (msg.t === "ping" && msg.pull && client.role !== "gm") return;
        const color = this.identity(client).color;
        const out = { ...msg, from: client.playerId ?? "gm", color } as S2C;
        for (const cl of this.clients) {
          if (cl === client) continue;
          if (cl.role === "gm" || this.settings.playerPageId === msg.pageId) this.send(cl, out);
        }
        return;
      }
      case "time":
        return this.send(client, { t: "time", c: msg.c, s: Date.now() });
    }
  }

  private validColl(coll: unknown): coll is CollName {
    return typeof coll === "string" && (COLL_NAMES as string[]).includes(coll);
  }

  private create(client: Client, coll: CollName, data: AnyEntity) {
    if (!this.validColl(coll) || typeof data !== "object" || !data) throw new Error("dados inválidos");
    if (!ID_RE.test(String(data.id)) || this.c[coll][data.id]) throw new Error("id inválido");
    if (coll === "settings" || coll === "players" || coll === "chat") throw new Error("não permitido");
    if (client.role !== "gm") {
      if (coll === "characters") {
        data.controlledBy = [client.playerId!];
        data.shared = false;
      } else if (coll === "graphics" && DRAWING_KINDS.includes(data.kind) && data.pageId === this.settings.playerPageId) {
        // desenhos e moldes dos jogadores: sempre na camada de tokens e só deles
        data.controlledBy = [client.playerId!];
        data.layer = "tokens";
        for (const k of ["characterId", "vision", "light", "link", "card", "locked", "aura", "src"]) delete data[k];
      } else {
        throw new Error("sem permissão");
      }
    }
    const entity = structuredClone(data);
    (this.c[coll] as Record<string, AnyEntity>)[entity.id] = entity;
    this.push(coll, entity.id);
    if (coll === "graphics" && entity.characterId) this.syncBars(entity.characterId);
    this.changed();
  }

  /** Copia hp/hp_max da ficha para as barras dos tokens vinculados. */
  private syncBars(charId: string) {
    const ch = this.c.characters[charId];
    const hp = Number(ch?.data?.hp);
    if (!ch || ch.data?.hp === undefined || !Number.isFinite(hp)) return;
    const max = Number(ch.data.hp_max ?? hp) || hp;
    for (const g of Object.values(this.c.graphics)) {
      if (g.characterId !== charId || g.unlinked || (g.bar && g.bar.value === hp && g.bar.max === max)) continue;
      g.bar = { value: hp, max };
      this.push("graphics", g.id);
    }
  }

  /** Mexeu na barra do token: atualiza a ficha (e os outros tokens dela). */
  private syncCharacter(graphicId: string) {
    const g = this.c.graphics[graphicId];
    const ch = g?.characterId && !g.unlinked ? this.c.characters[g.characterId] : undefined;
    if (!g?.bar || !ch || ch.data?.hp === undefined) return;
    if (ch.data.hp === g.bar.value && ch.data.hp_max === g.bar.max) return;
    ch.data.hp = g.bar.value;
    ch.data.hp_max = g.bar.max;
    this.push("characters", ch.id);
    this.syncBars(ch.id);
  }

  private canUpdate(client: Client, coll: CollName, e: AnyEntity, keys: string[]): boolean {
    if (keys.some((k) => k === "id" || k.startsWith("id."))) return false;
    if (client.role === "gm") return true;
    if (coll === "graphics") {
      if (!this.controls(client, e.controlledBy)) return false;
      const allowed = DRAWING_KINDS.includes(e.kind) ? PLAYER_DRAWING_KEYS : PLAYER_TOKEN_KEYS;
      return keys.every((k) => keyIn(k, allowed));
    }
    if (coll === "characters") {
      return this.controls(client, e.controlledBy)
        && keys.every((k) => k === "name" || k === "avatar" || k === "template" || k === "data" || k.startsWith("data."));
    }
    if (coll === "players") return e.id === client.playerId && keys.every((k) => keyIn(k, ["name", "color", "macros"]));
    return false;
  }

  /** Jogador não atravessa paredes quando a iluminação dinâmica está ligada. */
  private checkMove(e: AnyEntity, patch: Record<string, unknown>) {
    if (!("x" in patch) && !("y" in patch)) return;
    const page = this.c.pages[e.pageId];
    if (!page?.light?.on || (!page.walls?.length && !page.doors?.length)) return;
    const nx = Number(patch.x ?? e.x);
    const ny = Number(patch.y ?? e.y);
    if (crossesWall(e.x + e.w / 2, e.y + e.h / 2, nx + e.w / 2, ny + e.h / 2, blockingSegments(page, false))) {
      throw new Error("Há uma parede no caminho.");
    }
  }

  private update(client: Client, coll: CollName, id: string, patch: Record<string, unknown>) {
    if (!this.validColl(coll) || typeof patch !== "object" || !patch) throw new Error("dados inválidos");
    const e = this.c[coll][id] as AnyEntity | undefined;
    if (!e) return;
    if (!this.canUpdate(client, coll, e, Object.keys(patch))) throw new Error("sem permissão");
    if (coll === "graphics" && client.role !== "gm" && e.kind === "token") this.checkMove(e, patch);
    const prevPlayerPage = this.settings.playerPageId;
    if (!applyPatch(e, structuredClone(patch))) throw new Error("campo inválido");
    this.push(coll, id);
    const keys = Object.keys(patch);
    if (coll === "characters" && keys.some((k) => k === "data" || k === "data.hp" || k === "data.hp_max")) this.syncBars(id);
    if (coll === "graphics" && keys.includes("characterId") && e.characterId) this.syncBars(e.characterId);
    else if (coll === "graphics" && keys.some((k) => k === "bar" || k.startsWith("bar."))) this.syncCharacter(id);
    if (coll === "settings") {
      this.resync(PAGE_DEPENDENT);
      if (this.settings.playerPageId && this.settings.playerPageId !== prevPlayerPage) this.sceneMusic(this.settings.playerPageId);
    }
    if (coll === "graphics" && this.settings.turns.entries.some((en) => en.graphicId === id)) this.push("settings", "main");
    this.changed();
  }

  private remove(client: Client, coll: CollName, id: string) {
    if (!this.validColl(coll)) throw new Error("dados inválidos");
    const e = this.c[coll][id] as AnyEntity | undefined;
    if (!e || coll === "settings") return;
    const own = this.controls(client, e.controlledBy);
    const allowed = client.role === "gm"
      || (coll === "characters" && own)
      || (coll === "graphics" && own && DRAWING_KINDS.includes(e.kind));
    if (!allowed) throw new Error("sem permissão");
    delete this.c[coll][id];
    this.push(coll, id);
    if (coll === "pages") {
      for (const g of Object.values(this.c.graphics)) {
        if (g.pageId === id) {
          delete this.c.graphics[g.id];
          this.push("graphics", g.id);
        }
      }
      if (this.settings.playerPageId === id) {
        const next = Object.values(this.c.pages).sort((a, b) => a.order - b.order)[0];
        this.settings.playerPageId = next?.id ?? null;
        this.push("settings", "main");
        this.resync(PAGE_DEPENDENT);
      }
    }
    if (coll === "players") {
      delete this.camp.secrets[id];
      this.kick(id);
    }
    if (coll === "decks") {
      for (const g of Object.values(this.c.graphics)) {
        if (g.card?.deckId === id) {
          delete this.c.graphics[g.id];
          this.push("graphics", g.id);
        }
      }
    }
    this.changed();
  }

  // ─── Portas e trilha da cena ───────────────────────────────────────────────

  private toggleDoor(client: Client, pageId: string, doorId: string) {
    const page = this.c.pages[pageId];
    const door = page?.doors?.find((d) => d.id === doorId);
    if (!page || !door) return;
    if (client.role !== "gm") {
      if (page.id !== this.settings.playerPageId || door.secret) return;
      if (door.locked) throw new Error("A porta está trancada.");
    }
    door.open = !door.open;
    this.push("pages", page.id);
    this.changed();
  }

  /** Ao levar os jogadores para uma página com trilha, toca a trilha (e para o resto, se pedido). */
  private sceneMusic(pageId: string) {
    const page = this.c.pages[pageId];
    if (!page?.music?.length) return;
    const wanted = new Set(page.music);
    const now = Date.now();
    for (const t of Object.values(this.c.tracks)) {
      if (t.kind !== "music") continue;
      if (wanted.has(t.id)) {
        if (t.playing) continue;
        t.playing = true;
        t.startedAt = now;
        t.pausedAt = 0;
      } else if (page.musicReplace !== false && t.playing) {
        t.playing = false;
        t.pausedAt = 0;
      } else continue;
      this.push("tracks", t.id);
    }
  }

  // ─── Baralhos ──────────────────────────────────────────────────────────────

  private deckOp(client: Client, msg: Extract<C2S, { t: "deck" }>) {
    const gm = client.role === "gm";
    const me = client.playerId ?? "gm";
    const g = msg.graphicId ? this.c.graphics[msg.graphicId] : undefined;
    const deck = this.c.decks[msg.deckId ?? g?.card?.deckId ?? ""];
    if (!deck) return;
    const card = (id?: string) => deck.cards.find((c) => c.id === id);
    const fromHand = (owner: string, id: string) => {
      const hand = deck.hands[owner] ?? [];
      const i = hand.indexOf(id);
      if (i < 0) return false;
      hand.splice(i, 1);
      return true;
    };
    const onTable = () => Object.values(this.c.graphics).filter((x) => x.card?.deckId === deck.id);
    const placeOnTable = (cardId: string, owner: string) => {
      const pageId = msg.pageId ?? this.settings.playerPageId;
      const page = pageId ? this.c.pages[pageId] : undefined;
      if (!page) return;
      if (!gm && page.id !== this.settings.playerPageId) throw new Error("sem permissão");
      const gs = page.gridSize;
      const gr: Graphic = {
        id: newId(), pageId: page.id, layer: "tokens", z: 1000 + onTable().length, kind: "card",
        x: Math.round(Number(msg.x ?? 0)), y: Math.round(Number(msg.y ?? 0)), w: gs * 1.4, h: gs * 2,
        controlledBy: owner === "gm" ? [] : [owner], card: { deckId: deck.id, cardId, faceUp: msg.faceUp !== false },
      };
      this.c.graphics[gr.id] = gr;
      this.push("graphics", gr.id);
    };

    switch (msg.op) {
      case "shuffle": {
        if (!gm) throw new Error("só o mestre embaralha");
        deck.pile.push(...deck.discard.splice(0));
        for (let i = deck.pile.length - 1; i > 0; i--) {
          const j = crypto.randomInt(0, i + 1);
          [deck.pile[i], deck.pile[j]] = [deck.pile[j], deck.pile[i]];
        }
        break;
      }
      case "reset": {
        if (!gm) throw new Error("só o mestre recolhe as cartas");
        for (const x of onTable()) {
          delete this.c.graphics[x.id];
          this.push("graphics", x.id);
        }
        deck.pile = deck.cards.map((c) => c.id);
        deck.discard = [];
        deck.hands = {};
        for (let i = deck.pile.length - 1; i > 0; i--) {
          const j = crypto.randomInt(0, i + 1);
          [deck.pile[i], deck.pile[j]] = [deck.pile[j], deck.pile[i]];
        }
        break;
      }
      case "draw": {
        const to = gm && msg.to ? msg.to : me;
        if (to !== "gm" && !this.c.players[to]) return;
        const id = deck.pile.pop();
        if (!id) throw new Error("O monte acabou.");
        (deck.hands[to] ??= []).push(id);
        break;
      }
      case "drawTable": {
        const id = deck.pile.pop();
        if (!id) throw new Error("O monte acabou.");
        placeOnTable(id, me);
        break;
      }
      case "play": {
        if (!msg.cardId || !fromHand(me, msg.cardId)) return;
        placeOnTable(msg.cardId, me);
        break;
      }
      case "discard": {
        if (msg.graphicId && g) {
          if (!this.controls(client, g.controlledBy)) throw new Error("sem permissão");
          deck.discard.push(g.card!.cardId);
          delete this.c.graphics[g.id];
          this.push("graphics", g.id);
        } else if (msg.cardId && fromHand(gm && msg.to ? msg.to : me, msg.cardId)) {
          deck.discard.push(msg.cardId);
        } else return;
        break;
      }
      case "take": {
        if (!g?.card || !this.controls(client, g.controlledBy)) throw new Error("sem permissão");
        (deck.hands[me] ??= []).push(g.card.cardId);
        delete this.c.graphics[g.id];
        this.push("graphics", g.id);
        break;
      }
      case "flip": {
        if (!g?.card || !this.controls(client, g.controlledBy)) throw new Error("sem permissão");
        g.card.faceUp = !g.card.faceUp;
        this.push("graphics", g.id);
        this.changed();
        return;
      }
      case "show": {
        const c = card(msg.cardId);
        if (!c || !(deck.hands[me] ?? []).includes(c.id)) return;
        this.post({ ...this.identity(client), kind: "text", text: "mostra uma carta:", card: { deck: deck.name, name: c.name, image: c.image, suit: c.suit, rank: c.rank, text: c.text, deckId: deck.id, cardId: c.id } });
        return;
      }
    }
    this.push("decks", deck.id);
    this.changed();
  }

  // ─── Chat e dados ──────────────────────────────────────────────────────────

  private identity(client: Client, as?: string): Pick<ChatMsg, "from" | "name" | "color" | "avatar"> {
    const from = client.playerId ?? "gm";
    const player = client.playerId ? this.c.players[client.playerId] : null;
    const color = player?.color ?? GM_COLOR;
    const ch = as ? this.c.characters[as] : undefined;
    if (ch && this.controls(client, ch.controlledBy)) return { from, name: ch.name, color, avatar: ch.avatar };
    return { from, name: player?.name ?? "Mestre", color };
  }

  private post(msg: Omit<ChatMsg, "id" | "ts">) {
    const full: ChatMsg = { id: newId(), ts: Date.now(), ...msg };
    this.c.chat[full.id] = full;
    this.push("chat", full.id);
    const ids = Object.keys(this.c.chat);
    if (ids.length > CHAT_LIMIT) {
      const old = Object.values(this.c.chat).sort((a, b) => a.ts - b.ts).slice(0, ids.length - CHAT_LIMIT);
      for (const m of old) {
        delete this.c.chat[m.id];
        this.push("chat", m.id);
      }
    }
    this.changed();
  }

  /** Separa "1d20+5 Ataque" em expressão (maior prefixo válido) e rótulo. */
  static splitRoll(text: string): { expr: string; label?: string } {
    const words = text.trim().split(/\s+/);
    for (let n = words.length; n > 0; n--) {
      const expr = words.slice(0, n).join(" ");
      try {
        parse(expr);
        const label = words.slice(n).join(" ").replace(/^#\s*/, "");
        return { expr, label: label || undefined };
      } catch {
        /* tenta prefixo menor */
      }
    }
    return { expr: text.trim() };
  }

  private inlineRolls(text: string): { text: string; inline?: RollResult[] } {
    const inline: RollResult[] = [];
    const out = text.replace(/\[\[(.+?)\]\]/g, (whole, expr: string) => {
      if (inline.length >= 20) return whole;
      try {
        inline.push(roll(expr, rng));
        return `[[${inline.length - 1}]]`;
      } catch {
        return whole;
      }
    });
    return inline.length ? { text: out, inline } : { text };
  }

  /** Coloca (ou atualiza) o resultado na ordem de iniciativa, mantendo a ordem decrescente. */
  private addToTracker(client: Client, value: number, name: string, charId?: string, graphicId?: string) {
    const s = this.settings;
    const pageId = s.playerPageId;
    let g = graphicId ? this.c.graphics[graphicId] : undefined;
    if (g && !(client.role === "gm" || this.controls(client, g.controlledBy))) g = undefined;
    if (!g && charId) g = Object.values(this.c.graphics).find((x) => x.pageId === pageId && x.characterId === charId);
    if (!g && client.playerId) {
      g = Object.values(this.c.graphics).find((x) => x.pageId === pageId && x.kind === "token" && x.controlledBy.includes(client.playerId!));
    }
    const entries = [...s.turns.entries];
    const curId = entries[s.turns.current]?.id;
    const i = entries.findIndex((en) => (g ? en.graphicId === g.id : en.name === name));
    if (i >= 0) entries[i] = { ...entries[i], value };
    else entries.push({ id: newId(), name: g?.name || name, value, graphicId: g?.id });
    entries.sort((a, b) => b.value - a.value);
    s.turns = { ...s.turns, entries, current: Math.max(0, entries.findIndex((en) => en.id === curId)), open: true };
    this.push("settings", "main");
  }

  private chat(client: Client, raw: string, as?: string) {
    const text = raw.trim().slice(0, 4000);
    if (!text) return;
    const who = this.identity(client, as);
    const gmOnly = (to?: string[]) => [...new Set(["gm", ...(to ?? []), ...(client.playerId ? [client.playerId] : [])])];
    let m: RegExpExecArray | null;
    try {
      if ((m = /^\/(r|roll|gr|gmroll)\s+(.+)$/is.exec(text))) {
        const tracker = /&\{tracker\}/i.test(m[2]);
        const { expr, label } = Room.splitRoll(m[2].replace(/&\{tracker\}/gi, " ").trim());
        const secret = m[1].toLowerCase().startsWith("g");
        const result = roll(expr, rng);
        this.post({ ...who, kind: "roll", roll: result, label: label ?? (tracker ? "Iniciativa" : undefined), whisper: secret ? gmOnly() : undefined });
        if (tracker) this.addToTracker(client, result.total, who.name, as);
        return;
      }
      if ((m = /^\/w\s+(?:"([^"]+)"|(\S+))\s+(.+)$/is.exec(text))) {
        const target = (m[1] ?? m[2]).toLowerCase();
        const toGm = target === "gm" || target === "mestre";
        const p = Object.values(this.c.players).find((pl) => pl.name.toLowerCase() === target);
        if (!toGm && !p) throw new Error(`Jogador não encontrado: ${m[1] ?? m[2]}`);
        const to = toGm ? ["gm"] : [p!.id];
        return this.post({ ...who, kind: "text", ...this.inlineRolls(m[3]), whisper: gmOnly(to), label: toGm ? "Mestre" : p!.name });
      }
      if ((m = /^\/(me|em)\s+(.+)$/is.exec(text))) {
        return this.post({ ...who, kind: "emote", ...this.inlineRolls(m[2]) });
      }
      if ((m = /^\/desc\s+(.+)$/is.exec(text)) && client.role === "gm") {
        return this.post({ ...who, kind: "desc", ...this.inlineRolls(m[1]) });
      }
      if (text.startsWith("/")) throw new Error("Comando desconhecido. Use /r, /gr, /w, /me" + (client.role === "gm" ? ", /desc" : ""));
      this.post({ ...who, kind: "text", ...this.inlineRolls(text) });
    } catch (err) {
      const msg = err instanceof DiceError ? `Rolagem inválida: ${err.message}` : (err as Error).message;
      this.post({ from: "system", name: "Sistema", color: "#888", kind: "system", text: msg, whisper: gmOnly() });
    }
  }

  private rollRequest(client: Client, msg: Extract<C2S, { t: "roll" }>) {
    const who = this.identity(client, msg.as);
    const whisper = msg.gm ? [...new Set(["gm", ...(client.playerId ? [client.playerId] : [])])] : undefined;
    const label = typeof msg.label === "string" ? msg.label.slice(0, 200) : undefined;
    try {
      const result = msg.coc
        ? rollCoc(Number(msg.coc.target) || 0, Number(msg.coc.mod) || 0, rng)
        : roll(String(msg.expr).slice(0, 500), rng);
      this.post({ ...who, kind: "roll", roll: result, label, whisper });
      if (msg.tracker) this.addToTracker(client, result.total, who.name, msg.as, msg.graphicId);
    } catch (err) {
      this.post({
        from: "system", name: "Sistema", color: "#888", kind: "system",
        text: `Rolagem inválida: ${(err as Error).message}`, whisper: whisper ?? [client.playerId ?? "gm"],
      });
    }
  }
}
