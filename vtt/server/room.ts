// Sala ao vivo de uma campanha: aplica operações, checa permissões e envia a cada
// cliente só o que ele pode ver (jogadores nunca recebem camada do mestre, notas, etc.).
import crypto from "node:crypto";
import type { WebSocket } from "ws";
import type { C2S, FightRef, S2C } from "../shared/protocol.ts";
import type {
  ChatMsg, CollName, Colls, Deck, Graphic, Page, Role, RollResult, Settings,
} from "../shared/types.ts";
import { COLL_NAMES, DRAWING_KINDS } from "../shared/types.ts";
import { applyPatch, ID_RE, newId } from "../shared/util.ts";
import { attackOutcome, COC_LABEL, DiceError, parse, roll, rollCoc } from "../shared/dice.ts";
import {
  type Action, applyDefenses, cantAct, conditionEdge, type Cover, COVER_BONUS, COVER_LABEL, coverBetween, defaultResolve, defenseOf,
  defensesOf, fmtNum, itemTiming, rangeState, rangeText, type Resolve, resourceField, resourceLabel, type Save, SAVE_LABEL, saveEdge, saveTest, sheetActions,
  tokenDistance, toMeters,
} from "../shared/combat.ts";
import { applyMode, expand, fieldIndex, opExpr } from "../shared/sheet.ts";
// modelos de ficha prontos: dados puros, os mesmos do cliente
import { findTemplate } from "../client/sheets/templates.ts";
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
const PLAYER_TOKEN_KEYS = ["x", "y", "bar.value", "markers", "aura", "light", "src"];
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
      case "attack": return this.attack(client, msg);
      case "consume": return this.consume(client, msg);
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
      if (door.seal === "magic") throw new Error("A porta está selada por magia.");
      if (door.seal === "puzzle") throw new Error("A porta está presa por um enigma.");
      if (door.locked) throw new Error("A porta está trancada.");
    }
    door.open = !door.open;
    this.push("pages", page.id);
    this.changed();
  }

  // ─── Combate ───────────────────────────────────────────────────────────────

  /**
   * Lutador: token e/ou ficha. A ficha dá ataques, CA, resistências (mesmo em token desvinculado);
   * o PV vem da ficha vinculada ou da barra do token.
   */
  private fighter(ref: FightRef) {
    const g = ref.graphicId ? this.c.graphics[ref.graphicId] : undefined;
    const sheetId = ref.characterId ?? g?.characterId;
    const sheet = sheetId ? this.c.characters[sheetId] : undefined;
    if (!g && !sheet) return null;
    const t = sheet ? findTemplate(sheet.template, this.c.templates) : null;
    const linked = ref.characterId || (g && !g.unlinked) ? sheet : undefined;
    const onSheet = !!linked && linked.data?.hp !== undefined && Number.isFinite(Number(linked.data.hp));
    const bar = g?.bar;
    const hp = onSheet
      ? {
        get: () => ({ hp: Number(linked!.data.hp), max: Number(linked!.data.hp_max ?? linked!.data.hp) }),
        set: (v: number) => {
          linked!.data.hp = v;
          this.push("characters", linked!.id);
          this.syncBars(linked!.id);
        },
      }
      : bar
        ? { get: () => ({ hp: bar.value, max: bar.max }), set: (v: number) => { bar.value = v; this.push("graphics", g!.id); } }
        : null;
    const temp = onSheet && Number(linked!.data.hp_temp) > 0 ? Number(linked!.data.hp_temp) : 0;
    return {
      g, sheet, t, hp, temp,
      setTemp: (v: number) => {
        linked!.data.hp_temp = v;
        this.push("characters", linked!.id);
      },
      name: g?.name || sheet?.name || "Alvo",
      markers: g?.markers ?? [],
      // personagem de jogador (ou aliado controlado): CA e PV aparecem no chat; de criatura, não
      pc: !!sheet?.controlledBy?.length || !!g?.controlledBy?.length,
      defense: t && sheet ? defenseOf(t, sheet.data) : null,
      defenses: t && sheet ? defensesOf(t, sheet.data) : null,
      owned: (cl: Client) => this.controls(cl, sheet?.controlledBy) || (!!g && this.controls(cl, g.controlledBy)),
    };
  }

  /** Com a iniciativa aberta, jogador só ataca na vez do próprio personagem. */
  private turnError(f: NonNullable<ReturnType<Room["fighter"]>>): string | null {
    const turns = this.settings.turns;
    if (!turns.open || !turns.entries.length) return null;
    const cur = turns.entries[turns.current];
    const cg = cur?.graphicId ? this.c.graphics[cur.graphicId] : undefined;
    const mine = (!!f.g && cg?.id === f.g.id) || (!!f.sheet && cg?.characterId === f.sheet.id) || (!cg && cur?.name === f.name);
    return mine ? null : `Não é a vez de ${f.name}${cur ? ` (vez de ${cur.name})` : ""}.`;
  }

  /** Na vez dele, já gastou o turno inteiro (bebeu uma poção de turno inteiro, por exemplo)? */
  private spentError(f: NonNullable<ReturnType<Room["fighter"]>>): string | null {
    const turns = this.settings.turns;
    const cur = turns.open ? turns.entries[turns.current] : undefined;
    if (!cur || turns.spent?.at !== `${turns.round}:${cur.id}` || this.turnError(f)) return null;
    return `${f.name} já gastou o turno (${turns.spent.what}).`;
  }

  private attack(client: Client, msg: Extract<C2S, { t: "attack" }>) {
    const gm = client.role === "gm";
    const force = gm && !!msg.force;
    const A = this.fighter(msg.from ?? {});
    const T = this.fighter(msg.to ?? {});
    if (!A) throw new Error("Escolha quem ataca.");
    if (!T) throw new Error("Escolha o alvo.");
    if (!gm && !A.owned(client)) throw new Error("Você só ataca com um personagem seu.");
    if (!gm && !msg.use) throw new Error("Escolha uma arma ou magia da ficha.");
    // ficha sem token: usa o token dela que estiver na página do alvo (para medir a distância)
    if (!A.g && A.sheet && T.g) {
      const mine = Object.values(this.c.graphics).filter((x) => x.characterId === A.sheet!.id && x.pageId === T.g!.pageId && x.kind === "token");
      A.g = mine.find((x) => !x.unlinked) ?? mine[0];
    }
    const extras = (Array.isArray(msg.also) ? msg.also.slice(0, 40) : [])
      .map((r) => this.fighter(r ?? {}))
      .filter((f): f is NonNullable<typeof f> => !!f && (!f.g || f.g.id !== T.g?.id));
    if (!gm) {
      const page = this.settings.playerPageId;
      for (const f of [A, T, ...extras]) if (f.g && (f.g.pageId !== page || f.g.layer === "gm")) throw new Error("Esse alvo não está à vista.");
      const turn = this.turnError(A) ?? this.spentError(A);
      if (turn) throw new Error(turn);
    }

    // ação: da ficha (recalculada aqui) ou personalizada (mestre)
    let action: Action;
    if (msg.use) {
      if (!A.sheet || !A.t) throw new Error(`${A.name} não tem ficha.`);
      const found = sheetActions(A.t, A.sheet.data).find((x) => x.key === msg.use);
      if (!found) throw new Error("Essa arma ou magia não está mais na ficha.");
      action = found;
    } else {
      const atk = msg.atk ? String(msg.atk).slice(0, 300) : undefined;
      action = {
        key: "custom", group: "", label: String(msg.label ?? "Ataque").slice(0, 120), spell: false,
        test: atk ? { kind: "d20", expr: atk } : undefined, dmg: msg.dmg ? String(msg.dmg).slice(0, 300) : undefined,
        crit: { min: 20, mult: 2 }, half: true,
      };
    }
    const how: Resolve = msg.how === "attack" || msg.how === "save" || msg.how === "auto" ? msg.how : defaultResolve(action);
    const test = action.test ?? action.spellTest;
    if (how === "attack" && !test) throw new Error(`${action.label} não tem teste de ataque.`);
    if (action.qty !== undefined && action.qty <= 0) throw new Error(`${action.label}: acabou (quantidade 0).`);
    const cost = action.cost && A.sheet ? action.cost : undefined;
    const has = cost ? Number(A.sheet!.data[cost.field] ?? 0) || 0 : 0;
    if (cost && has < cost.amount && !force) throw new Error(`${A.name} não tem ${cost.label} para ${action.label} (tem ${has}).`);
    const stop = cantAct(A.markers);
    if (stop && !force) throw new Error(`${A.name} está ${stop} e não pode atacar.`);
    if (A.hp && A.hp.get().hp <= 0 && !force) throw new Error(`${A.name} está com 0 PV.`);

    // mapa: distância, alcance e cobertura até o alvo principal
    const page = A.g && T.g && A.g.pageId === T.g.pageId ? this.c.pages[A.g.pageId] : undefined;
    const dist = page ? tokenDistance(A.g!, T.g!, page, this.settings.diagonal) : null;
    const meters = page && dist !== null ? toMeters(dist, page.unit) : null;
    const where = meters === null ? "unknown" : rangeState(action.range, meters);
    const cover: Cover = page && A.g !== T.g ? coverBetween(A.g!, T.g!, page) : "none";
    if (!force && where === "far") {
      throw new Error(`${T.name} está fora do alcance: ${fmtNum(dist!)} ${page!.unit} (${action.label}: ${action.rangeText ?? rangeText(action.range!)}).`);
    }
    if (!force && cover === "total") throw new Error(`Sem linha de visão até ${T.name}: tem parede no caminho.`);
    // área: os outros alvos precisam estar dentro do raio, a partir do alvo principal
    const area = Math.max(0, Number(msg.area) || 0);
    const inArea = how === "attack" || !area || !page ? [] : extras.filter((f) => {
      if (!f.g || f.g.pageId !== page.id) return gm;
      return Math.hypot(f.g.x + f.g.w / 2 - (T.g!.x + T.g!.w / 2), f.g.y + f.g.h / 2 - (T.g!.y + T.g!.h / 2)) <= ((area / page.scale) + 0.5) * page.gridSize;
    });

    // gasta munição / granada
    if (action.qty !== undefined && action.qtyCol && A.sheet) {
      const [list, i] = action.key.split(":");
      const rows = A.sheet.data[list] as Record<string, unknown>[] | undefined;
      if (rows?.[Number(i)]) {
        rows[Number(i)][action.qtyCol] = action.qty - 1;
        this.push("characters", A.sheet.id);
      }
    }
    // gasta mana / PE / PM / espaço de magia
    if (cost) {
      A.sheet!.data[cost.field] = Math.max(0, has - cost.amount);
      this.push("characters", A.sheet!.id);
    }

    const who = { ...this.identity(client, A.sheet?.id), name: A.name };
    const whisper = msg.secret ? ["gm"] : undefined;
    const label = msg.use ? `${A.name}: ${action.label}` : action.label;
    const show = (f: { pc: boolean }) => !!msg.secret || f.pc;
    const advT = !!A.t?.advantage;
    const range = dist !== null ? ` (${fmtNum(dist)} ${page!.unit})` : "";
    const left = (action.qty !== undefined ? ` · restam ${action.qty - 1}` : "")
      + (cost ? ` · gastou ${cost.label} (${A.t ? resourceLabel(A.t, cost.field) : cost.field}: ${Math.max(0, has - cost.amount)})` : "");
    const roll1 = (expr: string) => roll(expr.slice(0, 300), rng);

    /** Tira o dano do PV (PV temporário primeiro), depois das resistências. Devolve o texto do resultado. */
    const hurt = (f: NonNullable<typeof T>, raw: number): string => {
      const d = applyDefenses(raw, action.dmgType, f.defenses);
      const notes = d.note ? [d.note] : [];
      let dmg = d.dmg;
      if (!f.hp) return `${dmg}${notes.length ? ` (${notes.join(", ")})` : ""} · sem PV para tirar`;
      if (f.temp > 0 && dmg > 0) {
        const used = Math.min(f.temp, dmg);
        f.setTemp(f.temp - used);
        dmg -= used;
        notes.push(`${used} nos PV temporários`);
      }
      const { hp, max } = f.hp.get();
      const next = Math.max(0, hp - dmg);
      f.hp.set(next);
      const state = show(f) ? `PV ${next}/${max}${next === 0 ? " — caiu!" : ""}` : next === 0 ? "caiu!" : next <= max / 2 ? "muito ferido" : "ferido";
      return `${d.dmg}${notes.length ? ` (${notes.join(", ")})` : ""} · ${state}`;
    };
    const dmgExpr = (crit: boolean, max: boolean) => {
      if (!action.dmg) return "";
      if (max) return action.dmg.replace(/(\d*)d(\d+)/gi, (_, n: string, s: string) => String((Number(n) || 1) * Number(s)));
      if (!crit) return action.dmg;
      return action.dmg.replace(/(\d*)d(\d+)/gi, (_, n: string, s: string) => `${(Number(n) || 1) * action.crit.mult}d${s}`);
    };

    try {
      if (how === "attack") {
        const edge = conditionEdge(A.markers, T.markers, meters);
        if (msg.mode === "adv") edge.adv.push("escolhida");
        if (msg.mode === "dis") edge.dis.push("escolhida");
        if (where === "long") edge.dis.push("longa distância");
        const net = Math.sign(edge.adv.length) - Math.sign(edge.dis.length);
        const bonus = Math.trunc(Number(msg.bonus) || 0);
        const notes = [
          edge.adv.length ? `vantagem: ${edge.adv.join(", ")}` : "",
          edge.dis.length ? `desvantagem: ${edge.dis.join(", ")}` : "",
          bonus ? `bônus ${bonus > 0 ? "+" : ""}${bonus}` : "",
          COVER_LABEL[cover],
        ].filter(Boolean);
        let r: RollResult;
        let hit: boolean;
        let crit: boolean;
        let verdict: string;
        let shownCa = "";
        if (test!.kind === "coc") {
          // CoC: dado de bônus/penalidade no lugar de vantagem; cobertura = dado de penalidade
          r = rollCoc(test!.skill + bonus, net - (cover === "none" ? 0 : 1), rng);
          const level = r.coc!.level;
          hit = level !== "failure" && level !== "fumble";
          crit = level === "critical" || level === "extreme";
          verdict = `${COC_LABEL[level]}${hit ? (crit ? " — dano máximo" : " — acertou") : " — errou"}`;
        } else {
          let expr: string;
          if (test!.kind === "op") expr = opExpr(test!.dice + net, test!.bonus + bonus);
          else {
            // vantagem nos sistemas d20 que têm; nos outros (T20, ficha livre) vale ±5
            expr = advT ? applyMode(test!.expr, net > 0 ? "adv" : net < 0 ? "dis" : "normal") : net ? `${test!.expr} ${net > 0 ? "+" : "-"} 5` : test!.expr;
            if (bonus) expr += ` ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}`;
          }
          r = roll1(expr);
          const ca = (gm && typeof msg.ca === "number" && Number.isFinite(msg.ca) ? msg.ca : T.defense ?? 10) + COVER_BONUS[cover];
          const out = attackOutcome(r, ca);
          hit = out.hit;
          crit = hit && ((out.nat ?? 0) >= action.crit.min || edge.autoCrit);
          verdict = crit ? "CRÍTICO!" : hit ? "acertou" : out.nat === 1 ? "falha crítica" : out.nat === 20 ? "errou (nem o 20 natural alcança a CA)" : "errou";
          if (show(T)) shownCa = ` (CA ${ca})`;
        }
        this.post({ ...who, kind: "roll", roll: r, label: `${label} → ${T.name}${range}${shownCa}: ${verdict}${notes.length ? ` · ${notes.join(" · ")}` : ""}${left}`, whisper });
        if (!hit || !action.dmg) return;
        const dr = roll1(dmgExpr(crit, crit && test!.kind === "coc"));
        const raw = Math.max(0, Math.round(dr.total));
        this.post({ ...who, kind: "roll", roll: dr, label: `Dano em ${T.name}${crit ? " (crítico)" : ""}: ${hurt(T, raw)}`, whisper });
        return;
      }

      // resistência ou acerto automático: todos os alvos da área levam o mesmo dano
      const targets = [T, ...inArea];
      const dr = action.dmg ? roll1(dmgExpr(false, false)) : null;
      const raw = dr ? Math.max(0, Math.round(dr.total)) : 0;
      if (how === "auto") {
        if (!dr) throw new Error(`${action.label} não tem dano.`);
        if (targets.length === 1) {
          this.post({ ...who, kind: "roll", roll: dr, label: `${label} → ${T.name}${range}: Dano em ${T.name}: ${hurt(T, raw)}${left}`, whisper });
          return;
        }
        this.post({ ...who, kind: "roll", roll: dr, label: `${label} → ${targets.map((f) => f.name).join(", ")}${range}${left}`, whisper });
        for (const f of targets) this.post({ ...who, kind: "system", text: `Dano em ${f.name}: ${hurt(f, raw)}`, whisper });
        return;
      }
      const ab: Save = msg.save && msg.save in SAVE_LABEL ? msg.save : action.save ?? "des";
      const dc = action.dc ?? 10;
      const head = `${label} → ${targets.map((f) => f.name).join(", ")}${range} · resistência de ${SAVE_LABEL[ab]} CD ${dc}${left}`;
      if (dr) this.post({ ...who, kind: "roll", roll: dr, label: head, whisper });
      else this.post({ ...who, kind: "system", text: head, whisper });
      for (const f of targets) {
        // cobertura: do atacante até o alvo principal; da explosão (alvo principal) até os outros
        const from = f === T ? A.g : T.g;
        const cov: Cover = page && from && f.g && from !== f.g ? coverBetween(from, f.g, page) : "none";
        if (cov === "total" && f !== T) {
          this.post({ ...who, kind: "system", text: `${f.name}: protegido pela parede`, whisper });
          continue;
        }
        const e = saveEdge(f.markers, ab);
        const coverB = ab === "des" ? COVER_BONUS[cov] : 0;
        let saved = false;
        let sr: RollResult | null = null;
        if (!e.autoFail) {
          const st = f.t && f.sheet ? saveTest(f.t, f.sheet.data, ab) : { kind: "d20" as const, expr: "1d20" };
          if (st.kind === "coc") {
            sr = rollCoc(st.skill, e.dis ? -1 : 0, rng);
            saved = sr.coc!.level !== "failure" && sr.coc!.level !== "fumble";
          } else {
            const tAdv = !!f.t?.advantage;
            let expr = st.kind === "op" ? opExpr(st.dice - (e.dis ? 1 : 0), st.bonus + coverB) : tAdv && e.dis ? applyMode(st.expr, "dis") : e.dis ? `${st.expr} - 5` : st.expr;
            if (st.kind === "d20" && coverB) expr += ` + ${coverB}`;
            sr = roll1(expr);
            saved = sr.total >= dc;
          }
        }
        const why = [e.autoFail ? `falha sozinho (${e.autoFail})` : "", e.dis ? `desvantagem (${e.dis})` : "", coverB ? COVER_LABEL[cov] : ""].filter(Boolean);
        const taken = saved ? (action.half ? Math.floor(raw / 2) : 0) : raw;
        const result = `${f.name}: ${saved ? "passou" : "falhou"} na resistência${why.length ? ` (${why.join(", ")})` : ""}${dr ? ` → ${hurt(f, taken)}` : ""}`;
        if (sr) this.post({ ...who, kind: "roll", roll: sr, label: result, whisper });
        else this.post({ ...who, kind: "system", text: result, whisper });
      }
    } catch (err) {
      if (err instanceof DiceError) throw new Error(`Rolagem inválida: ${err.message}`);
      throw err;
    } finally {
      this.changed();
    }
  }

  /** Consumível (poção, medpac…): rola o efeito aqui, restaura o recurso até o máximo e gasta 1 da linha. */
  private consume(client: Client, msg: Extract<C2S, { t: "consume" }>) {
    const ch = this.c.characters[String(msg.characterId)];
    if (!ch) return;
    if (!this.controls(client, ch.controlledBy)) throw new Error("Essa ficha não é sua.");
    const t = findTemplate(ch.template, this.c.templates);
    const list = fieldIndex(t).get(String(msg.list));
    const col = list?.type === "list" ? list.columns?.find((c) => c.type === "roll" && c.consume) : undefined;
    const row = (ch.data[String(msg.list)] as Record<string, unknown>[] | undefined)?.[Math.trunc(Number(msg.row))];
    if (!col || !row || typeof row !== "object") throw new Error("Item não encontrado na ficha.");
    const name = String(row.name || "Item");
    const counted = String(row.qtd ?? "").trim() !== "";
    if (counted && Number(row.qtd) <= 0) throw new Error(`${name}: acabou.`);
    if (!String(row.efeito ?? "").trim() && /@\{\.efeito\}/.test(col.roll ?? "")) throw new Error(`${name} não tem efeito (ex.: 2d4+2 ou 10).`);
    // recurso escrito na linha; sem nada, poção "de mana" enche mana e o resto, PV
    const wanted = String(row.recurso ?? "").trim() || (/\b(mana|pm|pe|magia)\b/i.test(name) ? "mana" : "PV");
    const field = resourceField(t, wanted);
    if (!field) throw new Error(`A ficha de ${ch.name} não tem ${wanted}.`);
    // "Uso": turno inteiro / ação bônus só na vez do personagem (com a iniciativa aberta); livre, quando quiser
    const uso = String(row.uso ?? "").trim() || "Turno inteiro";
    const timing = itemTiming(row.uso);
    const self = this.fighter({ characterId: ch.id })!;
    if (client.role !== "gm" && timing !== "free") {
      const turn = this.turnError(self);
      if (turn) throw new Error(`${turn} ${name} (${uso}) só pode ser usado na sua vez.`);
      const spent = this.spentError(self);
      if (spent) throw new Error(spent);
    }
    try {
      const r = roll(expand(t, ch.data, col.roll ?? "0", row).slice(0, 200), rng);
      const cur = Number(ch.data[field] ?? 0) || 0;
      const max = Number(ch.data[`${field}_max`]);
      const capped = Number.isFinite(max) && max > 0;
      const next = Math.max(0, capped ? Math.min(Math.max(max, cur), cur + Math.round(r.total)) : cur + Math.round(r.total));
      ch.data[field] = next;
      if (counted) row.qtd = Number(row.qtd) - 1;
      this.push("characters", ch.id);
      if (field === "hp") this.syncBars(ch.id);
      const res = resourceLabel(t, field);
      const gained = next - cur;
      const full = capped && Math.round(r.total) > gained ? " — chegou ao máximo" : "";
      // turno inteiro na vez dele: marca o turno como gasto (não ataca mais até a próxima vez)
      const turns = this.settings.turns;
      const entry = turns.open ? turns.entries[turns.current] : undefined;
      if (timing === "turn" && entry && !this.turnError(self)) {
        turns.spent = { at: `${turns.round}:${entry.id}`, what: name };
        this.push("settings", "main");
      }
      this.post({
        ...this.identity(client, ch.id), kind: "roll", roll: r, whisper: msg.secret ? ["gm"] : undefined,
        label: `${ch.name} usou ${name}: ${gained >= 0 ? "+" : ""}${gained} ${res} (${next}${capped ? `/${max}` : ""})${full}${counted ? ` · restam ${row.qtd}` : ""} · ${uso}`,
      });
    } catch (err) {
      if (err instanceof DiceError) throw new Error(`Efeito inválido em ${name}: ${err.message}`);
      throw err;
    }
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
