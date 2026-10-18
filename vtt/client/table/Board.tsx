// Tabuleiro: pan/zoom (mouse e toque), seleção (clique ou área), arrasto, desfazer, copiar/colar,
// régua, névoa, desenho, moldes de área, paredes/portas, iluminação dinâmica, clima, cartas e links.
import { useEffect, useMemo, useRef, useState } from "react";
import type { DoorSeg, Graphic, Page } from "../../shared/types.ts";
import { DRAWING_KINDS } from "../../shared/types.ts";
import { clamp, fogDecode, fogEncode, newId } from "../../shared/util.ts";
import { blockingSegments, crossesWall, segDist } from "../../shared/vision.ts";
import { api, game, onEvent, send, uploadFile, useColl } from "../game.ts";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu.tsx";
import { toast } from "../ui/Toast.tsx";
import {
  buildFogCanvas, drawScene, getImage, setImageListener, sortGraphics, type Ping, type Ruler, type View,
} from "./board/render.ts";
import { computeLighting, drawDarkness, exploredCanvas, isLit, rememberLit, type LightState } from "./board/lighting.ts";
import { makeTemplate } from "./board/templates.ts";
import { Weather } from "./board/weather.ts";
import { act, group, redo, undo } from "./history.ts";
import { boardCenter, canControl, linkedPage, measure, myColor, openSheet, ui, useViewPage } from "./ui.ts";
import { ToolOptions } from "./ToolOptions.tsx";
import { loadMonsters } from "../compendium/srd.ts";
import { ensureMonsterSheet } from "../compendium/Compendium.tsx";

const LIVE_SEND_MS = 80;
let clipboard: Graphic[] = [];

type Snap = Record<string, unknown> | null;
type Drag =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number; button: number; moved: boolean; wx: number; wy: number }
  | { kind: "move"; ids: string[]; start: Map<string, { x: number; y: number }>; wx0: number; wy0: number; sx: number; sy: number; moved: boolean; last: number }
  | { kind: "resize"; id: string; w0: number; h0: number; wx0: number; wy0: number; sx: number; sy: number; moved: boolean }
  | { kind: "ruler"; pts: number[]; sx: number; sy: number; moved: boolean; last: number }
  | { kind: "fog"; sx: number; sy: number; moved: boolean; before: Snap }
  | { kind: "fogRect"; c0: [number, number]; c1: [number, number]; sx: number; sy: number; moved: boolean }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; sx: number; sy: number; moved: boolean }
  | { kind: "draw"; pts: number[]; sx: number; sy: number; moved: boolean }
  | { kind: "shape"; x0: number; y0: number; x1: number; y1: number; sx: number; sy: number; moved: boolean }
  | { kind: "template"; ox: number; oy: number; sx: number; sy: number; moved: boolean }
  | { kind: "door"; x0: number; y0: number; x1: number; y1: number; sx: number; sy: number; moved: boolean };

interface FogState {
  pageId: string;
  src: string;
  cells: Uint8Array;
  canvas: HTMLCanvasElement | null;
  painting: boolean;
  lastSend: number;
  expect: { src: string; until: number } | null;
}

/** Simplificação de Ramer–Douglas–Peucker para traços à mão livre. */
function simplify(pts: number[], tol: number): number[] {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length / 2);
  keep[0] = keep[keep.length - 1] = 1;
  const stack: [number, number][] = [[0, keep.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i * 2], pts[i * 2 + 1], [pts[a * 2], pts[a * 2 + 1], pts[b * 2], pts[b * 2 + 1]]);
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < keep.length; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/** Caminho em coordenadas absolutas → gráfico com pontos relativos ao canto. */
function pathGraphic(abs: number[], extra: Partial<Graphic>): Pick<Graphic, "x" | "y" | "w" | "h" | "pts"> & Partial<Graphic> {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < abs.length; i += 2) {
    x0 = Math.min(x0, abs[i]);
    x1 = Math.max(x1, abs[i]);
    y0 = Math.min(y0, abs[i + 1]);
    y1 = Math.max(y1, abs[i + 1]);
  }
  const pts = abs.map((v, i) => Math.round((v - (i % 2 ? y0 : x0)) * 10) / 10);
  return { ...extra, x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), pts };
}

export function Board() {
  const page = useViewPage();
  const graphics = useColl("graphics");
  const players = useColl("players");
  const decks = useColl("decks");
  const settings = useColl("settings").main;
  const role = game.use((s) => s.role);
  const playerId = game.use((s) => s.playerId);
  const campaignId = game.use((s) => s.campaignId);
  const tool = ui.use((s) => s.tool);
  const layer = ui.use((s) => s.layer);
  const selected = ui.use((s) => s.selected);
  const fogShape = ui.use((s) => s.fogShape);
  const showWalls = ui.use((s) => s.showWalls);
  const lightPreview = ui.use((s) => s.lightPreview);
  const drawMode = ui.use((s) => s.drawMode);
  const gm = role === "gm";
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [textInput, setTextInput] = useState<{ sx: number; sy: number; wx: number; wy: number } | null>(null);
  const [noVision, setNoVision] = useState(false);

  const pageGraphics = useMemo(
    () => (page ? sortGraphics(Object.values(graphics).filter((g) => g.pageId === page.id)) : []),
    [graphics, page?.id],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const weatherRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, zoom: 1 });
  const views = useRef(new Map<string, View>());
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const dirty = useRef(true);
  const drag = useRef<Drag | null>(null);
  const overrides = useRef(new Map<string, Partial<Graphic>>());
  const pending = useRef(new Map<string, { x: number; y: number; w?: number; h?: number; until: number }>());
  const rulers = useRef(new Map<string, Ruler>());
  const pings = useRef<Ping[]>([]);
  const pressTimer = useRef<number | null>(null);
  const fogPreview = useRef<{ x: number; y: number; w: number; h: number; hide: boolean } | null>(null);
  const fog = useRef<FogState>({ pageId: "", src: "", cells: new Uint8Array(0), canvas: null, painting: false, lastSend: 0, expect: null });
  const draft = useRef<Graphic | null>(null);
  const marquee = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const wallDraft = useRef<number[] | null>(null);
  const wallHover = useRef<[number, number] | null>(null);
  const lastMouse = useRef<[number, number]>([0, 0]);
  const pointers = useRef(new Map<number, { sx: number; sy: number }>());
  const pinch = useRef<{ d0: number; mx0: number; my0: number; v0: View } | null>(null);
  const lastTap = useRef<{ t: number; sx: number; sy: number } | null>(null);
  const darknessCanvas = useRef<HTMLCanvasElement | null>(null);
  const weather = useRef<Weather | null>(null);

  // Últimos valores para o laço de desenho e os handlers nativos
  const latest = useRef({ page, pageGraphics, players, gm, playerId, selected, layer, settings, decks, showWalls, lightPreview, tool, campaignId });
  latest.current = { page, pageGraphics, players, gm, playerId, selected, layer, settings, decks, showWalls, lightPreview, tool, campaignId };
  useEffect(() => {
    dirty.current = true;
  });

  // ─── Ajuste de visão ─────────────────────────────────────────────────────

  const fit = (p: Page) => {
    const { w, h } = size.current;
    if (!w || !h) return;
    const pw = p.cols * p.gridSize;
    const ph = p.rows * p.gridSize;
    const zoom = clamp(Math.min(w / pw, h / ph) * 0.92, 0.05, 2);
    view.current = { zoom, x: (w - pw * zoom) / 2, y: (h - ph * zoom) / 2 };
    dirty.current = true;
  };

  const centerOn = (wx: number, wy: number) => {
    const { w, h } = size.current;
    const z = view.current.zoom;
    view.current = { zoom: z, x: w / 2 - wx * z, y: h / 2 - wy * z };
    dirty.current = true;
  };

  useEffect(() => {
    boardCenter.get = () => {
      const { w, h } = size.current;
      const v = view.current;
      return w ? [(w / 2 - v.x) / v.zoom, (h / 2 - v.y) / v.zoom] : null;
    };
    return () => {
      boardCenter.get = () => null;
    };
  }, []);

  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    if (!page || lastPage.current === page.id) return;
    if (lastPage.current) views.current.set(lastPage.current, { ...view.current });
    lastPage.current = page.id;
    const saved = views.current.get(page.id);
    if (saved) view.current = { ...saved };
    else fit(page);
    ui.set({ selected: [] });
    wallDraft.current = null;
    dirty.current = true;
  }, [page?.id]);

  useEffect(() => {
    weather.current?.set(page?.weather?.type ?? "none", page?.weather?.intensity ?? 0.5);
  }, [page?.id, page?.weather?.type, page?.weather?.intensity]);

  // ─── Canvas: tamanho, laço de desenho ────────────────────────────────────

  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    weather.current = new Weather(weatherRef.current!);
    darknessCanvas.current = document.createElement("canvas");
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const first = size.current.w === 0;
      size.current = { w: r.width, h: r.height, dpr };
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      weather.current?.resize(r.width, r.height, dpr);
      const p = latest.current.page;
      if (p) weather.current?.set(p.weather?.type ?? "none", p.weather?.intensity ?? 0.5);
      if (first && p) fit(p);
      dirty.current = true;
    });
    ro.observe(wrap);
    setImageListener(() => {
      dirty.current = true;
    });

    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let animating = false;
    let lastNoVision = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const L = latest.current;
      if (!L.page || !size.current.w) return; // sem tamanho ainda (a máscara de escuridão sairia com 0 px)
      syncFog(L.page);
      if (!dirty.current && !animating) return;
      dirty.current = false;
      const now = performance.now();
      const list = L.pageGraphics.map((g) => effective(g, now));
      const f = fog.current;
      if (L.page.fogOn && !f.canvas) f.canvas = buildFogCanvas(f.cells, L.page.cols, L.page.rows);
      pings.current = pings.current.filter((p) => now - p.t0 < 1700);

      // Iluminação dinâmica
      let state: LightState | null = null;
      let darkness: HTMLCanvasElement | null = null;
      let hidden: Set<string> | null = null;
      let doorVisible: ((d: DoorSeg) => boolean) | null = null;
      let missing = false;
      if (L.page.light?.on) {
        const mine = (g: Graphic) => g.kind === "token" && !!g.vision?.on && (L.gm ? L.selected.includes(g.id) : canControl(g.controlledBy) && g.layer === "tokens");
        // jogador: visão pela posição confirmada (o arrasto não pode espiar através de paredes)
        const viewers = (L.gm ? list : L.pageGraphics).filter(mine);
        const active = !L.gm || (L.lightPreview && viewers.length > 0);
        if (active) {
          state = computeLighting(L.page, list.filter((g) => L.gm || g.layer !== "gm"), viewers);
          let exp: HTMLCanvasElement | null = null;
          if (!L.gm && L.page.light.explore) {
            const key = `dm.exp.${L.campaignId}.${L.page.id}.${L.playerId}`;
            exp = exploredCanvas(key, L.page);
            rememberLit(key, L.page, state);
          }
          drawDarkness(darknessCanvas.current!, size.current.w, size.current.h, size.current.dpr, view.current, L.page, state, exp, L.gm ? 0.82 : 1);
          darkness = darknessCanvas.current;
          if (!L.gm) {
            const s = state;
            hidden = new Set(list.filter((g) => (g.kind === "token" || g.kind === "card") && !canControl(g.controlledBy) && !isLit(s, g.x + g.w / 2, g.y + g.h / 2)).map((g) => g.id));
            doorVisible = (d) => {
              const mx = (d.x1 + d.x2) / 2;
              const my = (d.y1 + d.y2) / 2;
              const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1;
              const nx = (-(d.y2 - d.y1) / len) * L.page!.gridSize * 0.3;
              const ny = ((d.x2 - d.x1) / len) * L.page!.gridSize * 0.3;
              return isLit(s, mx + nx, my + ny) || isLit(s, mx - nx, my - ny);
            };
            missing = viewers.length === 0;
          }
        }
      }
      if (missing !== lastNoVision) {
        lastNoVision = missing;
        setNoVision(missing);
      }

      const wd = wallDraft.current && wallHover.current ? [...wallDraft.current, ...wallHover.current] : wallDraft.current;
      animating = drawScene(ctx, size.current.w, size.current.h, size.current.dpr, view.current, {
        page: L.page,
        graphics: list,
        gm: L.gm,
        playerId: L.playerId,
        players: L.players,
        selected: new Set(L.selected),
        activeLayer: L.layer,
        fogCells: L.page.fogOn ? f.cells : null,
        fogCanvas: L.page.fogOn ? f.canvas : null,
        rulers: [...rulers.current.values()],
        pings: pings.current,
        fogPreview: fogPreview.current,
        turnId: L.settings?.turns.entries[L.settings.turns.current]?.graphicId ?? null,
        decks: L.decks,
        hidden,
        darkness,
        light: state,
        doorVisible,
        showWalls: L.gm && (L.showWalls || L.tool === "walls"),
        marquee: marquee.current,
        draft: draft.current,
        wallDraft: wd,
      }, now);
    };
    raf = requestAnimationFrame(loop);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const v = view.current;
      const wx = (sx - v.x) / v.zoom;
      const wy = (sy - v.y) / v.zoom;
      const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), 0.05, 6);
      view.current = { zoom, x: sx - wx * zoom, y: sy - wy * zoom };
      dirty.current = true;
    };
    cv.addEventListener("wheel", onWheel, { passive: false });

    const off = onEvent((msg) => {
      const L = latest.current;
      if (msg.t === "ruler") {
        if (msg.pts && L.page && msg.pageId === L.page.id) {
          const label = measure(msg.pts, L.page, L.settings?.diagonal ?? "dnd");
          rulers.current.set(msg.from, { pts: msg.pts, color: msg.color, label });
        } else rulers.current.delete(msg.from);
        dirty.current = true;
      } else if (msg.t === "ping") {
        if (!L.page || msg.pageId !== L.page.id) return;
        pings.current.push({ x: msg.x, y: msg.y, color: msg.color, t0: performance.now() });
        if (msg.pull && !L.gm) centerOn(msg.x, msg.y);
        dirty.current = true;
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("wheel", onWheel);
      weather.current?.stop();
      off();
    };
  }, []);

  /** Posição exibida: arrasto local ou valor enviado aguardando confirmação do servidor. */
  function effective(g: Graphic, now: number): Graphic {
    const o = overrides.current.get(g.id);
    if (o) return { ...g, ...o };
    const p = pending.current.get(g.id);
    if (p) {
      const done = g.x === p.x && g.y === p.y && (p.w === undefined || g.w === p.w) && (p.h === undefined || g.h === p.h);
      if (done || now > p.until) pending.current.delete(g.id);
      else return { ...g, x: p.x, y: p.y, w: p.w ?? g.w, h: p.h ?? g.h };
    }
    return g;
  }

  // ─── Névoa ────────────────────────────────────────────────────────────────

  function syncFog(p: Page) {
    const f = fog.current;
    const n = p.cols * p.rows;
    const samePage = f.pageId === p.id && f.cells.length === n;
    if (samePage && (f.painting || f.src === p.fog)) return;
    if (samePage && f.expect) {
      if (p.fog !== f.expect.src && performance.now() < f.expect.until) return;
      f.expect = null;
    }
    f.pageId = p.id;
    f.src = p.fog;
    f.cells = fogDecode(p.fog, n);
    f.canvas = null;
    dirty.current = true;
  }

  function paintFog(x0: number, y0: number, w: number, h: number, reveal: boolean) {
    const p = latest.current.page!;
    const f = fog.current;
    for (let y = Math.max(0, y0); y < Math.min(p.rows, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(p.cols, x0 + w); x++) f.cells[y * p.cols + x] = reveal ? 1 : 0;
    }
    f.canvas = null;
    dirty.current = true;
  }

  function sendFog(final: boolean) {
    const p = latest.current.page!;
    const f = fog.current;
    const now = performance.now();
    if (!final && now - f.lastSend < 200) return;
    f.lastSend = now;
    const src = fogEncode(f.cells);
    f.src = src;
    if (final) f.expect = { src, until: now + 3000 };
    api.update("pages", p.id, { fog: src });
  }

  const pageSnap = () => {
    const p = latest.current.page;
    return p ? (structuredClone(game.get().colls.pages[p.id]) as unknown as Record<string, unknown>) : null;
  };

  function brushAt(wx: number, wy: number) {
    const p = latest.current.page!;
    const s = ui.get();
    const cx = Math.floor(wx / p.gridSize);
    const cy = Math.floor(wy / p.gridSize);
    const r = s.fogBrush - 1;
    paintFog(cx - r, cy - r, r * 2 + 1, r * 2 + 1, s.fogMode === "reveal");
  }

  function revealRoomAt(wx: number, wy: number) {
    const p = latest.current.page!;
    const cx = Math.floor(wx / p.gridSize);
    const cy = Math.floor(wy / p.gridSize);
    const room = p.rooms?.find((rects) => rects.some((r) => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h));
    if (!room) return;
    const before = pageSnap();
    const reveal = ui.get().fogMode === "reveal";
    for (const r of room) paintFog(r.x - 1, r.y - 1, r.w + 2, r.h + 2, reveal);
    sendFog(true);
    act.record("pages", p.id, before);
  }

  // ─── Utilidades de interação ─────────────────────────────────────────────

  function pos(e: { clientX: number; clientY: number }) {
    const r = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const v = view.current;
    return { sx, sy, wx: (sx - v.x) / v.zoom, wy: (sy - v.y) / v.zoom };
  }

  const selectable = (g: Graphic) => {
    const L = latest.current;
    if (L.gm) return g.layer === L.layer || (L.layer !== "map" && g.kind === "card");
    return g.layer === "tokens" && canControl(g.controlledBy);
  };

  function hitTest(wx: number, wy: number, any = false): Graphic | null {
    const now = performance.now();
    const list = latest.current.pageGraphics;
    for (let i = list.length - 1; i >= 0; i--) {
      const g = effective(list[i], now);
      if (!any && !selectable(g)) continue;
      if (wx >= g.x && wx <= g.x + g.w && wy >= g.y && wy <= g.y + g.h) return g;
    }
    return null;
  }

  function doorAt(sx: number, sy: number): DoorSeg | null {
    const L = latest.current;
    if (!L.page?.light?.on) return null;
    const v = view.current;
    for (const d of L.page.doors ?? []) {
      const mx = ((d.x1 + d.x2) / 2) * v.zoom + v.x;
      const my = ((d.y1 + d.y2) / 2) * v.zoom + v.y;
      if (Math.hypot(sx - mx, sy - my) <= 11) return d;
    }
    return null;
  }

  const snap = (v: number, gs: number) => Math.round(v / gs) * gs;
  const cellCenter = (v: number, gs: number) => (Math.floor(v / gs) + 0.5) * gs;
  const corner = (wx: number, wy: number, free: boolean, gs: number): [number, number] => (free ? [wx, wy] : [snap(wx, gs), snap(wy, gs)]);

  function doPing(wx: number, wy: number, pull: boolean) {
    const L = latest.current;
    if (!L.page) return;
    pings.current.push({ x: wx, y: wy, color: myColor(), t0: performance.now() });
    send({ t: "ping", pageId: L.page.id, x: wx, y: wy, pull });
    dirty.current = true;
  }

  function clearPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  function topZ(lay: string) {
    const zs = latest.current.pageGraphics.filter((g) => g.layer === lay).map((g) => g.z);
    return zs.length ? Math.max(...zs) + 1 : 0;
  }

  function drawLayer() {
    const L = latest.current;
    return L.gm ? L.layer : "tokens";
  }

  function finishWalls() {
    const L = latest.current;
    const d = wallDraft.current;
    wallDraft.current = null;
    wallHover.current = null;
    if (!L.page || !d || d.length < 4) return;
    const segs: number[] = [];
    for (let i = 0; i + 3 < d.length; i += 2) segs.push(d[i], d[i + 1], d[i + 2], d[i + 3]);
    act.update("pages", L.page.id, { walls: [...(L.page.walls ?? []), ...segs] });
  }

  function eraseWallAt(wx: number, wy: number) {
    const L = latest.current;
    const p = L.page!;
    const tol = 9 / view.current.zoom;
    const doors = p.doors ?? [];
    const di = doors.findIndex((d) => segDist(wx, wy, [d.x1, d.y1, d.x2, d.y2]) < tol);
    if (di >= 0) {
      act.update("pages", p.id, { doors: doors.filter((_, i) => i !== di) });
      return;
    }
    const w = p.walls ?? [];
    for (let i = 0; i + 3 < w.length; i += 4) {
      if (segDist(wx, wy, [w[i], w[i + 1], w[i + 2], w[i + 3]]) < tol) {
        act.update("pages", p.id, { walls: [...w.slice(0, i), ...w.slice(i + 4)] });
        return;
      }
    }
  }

  // ─── Ponteiro ────────────────────────────────────────────────────────────

  function cancelDrag() {
    clearPress();
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "move") for (const id of d.ids) overrides.current.delete(id);
    if (d?.kind === "resize") overrides.current.delete(d.id);
    if (d?.kind === "fog") fog.current.painting = false;
    draft.current = null;
    marquee.current = null;
    fogPreview.current = null;
    dirty.current = true;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const L = latest.current;
    if (!L.page) return;
    const cv = canvasRef.current!;
    const { sx, sy, wx, wy } = pos(e);
    pointers.current.set(e.pointerId, { sx, sy });
    if (pointers.current.size === 2) {
      // pinça com dois dedos: zoom + arrastar
      cancelDrag();
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d0: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, mx0: (a.sx + b.sx) / 2, my0: (a.sy + b.sy) / 2, v0: { ...view.current } };
      return;
    }
    if (pointers.current.size > 2) return;
    cv.setPointerCapture(e.pointerId);
    cv.focus();
    setMenu(null);
    const gs = L.page.gridSize;
    const v = view.current;
    const s = ui.get();

    if (e.button === 1 || e.button === 2) {
      drag.current = { kind: "pan", sx, sy, vx: v.x, vy: v.y, button: e.button, moved: false, wx, wy };
      return;
    }
    if (e.button !== 0) return;

    const door = s.tool !== "walls" ? doorAt(sx, sy) : null;
    if (door) {
      send({ t: "door", pageId: L.page.id, doorId: door.id });
      return;
    }

    if (s.tool === "ruler") {
      const x = e.altKey ? wx : cellCenter(wx, gs);
      const y = e.altKey ? wy : cellCenter(wy, gs);
      drag.current = { kind: "ruler", pts: [x, y, x, y], sx, sy, moved: false, last: 0 };
      return;
    }
    if (s.tool === "fog" && L.gm) {
      if (s.fogShape === "room") {
        revealRoomAt(wx, wy);
        return;
      }
      if (s.fogShape === "rect") {
        const c: [number, number] = [Math.floor(wx / gs), Math.floor(wy / gs)];
        drag.current = { kind: "fogRect", c0: c, c1: c, sx, sy, moved: false };
        fogPreview.current = { x: c[0], y: c[1], w: 1, h: 1, hide: s.fogMode === "hide" };
        return;
      }
      const before = pageSnap();
      fog.current.painting = true;
      brushAt(wx, wy);
      drag.current = { kind: "fog", sx, sy, moved: false, before };
      return;
    }
    if (s.tool === "draw") {
      if (s.drawMode === "text") {
        setTextInput({ sx, sy, wx, wy });
        return;
      }
      if (s.drawMode === "free" || s.drawMode === "line") drag.current = { kind: "draw", pts: [wx, wy], sx, sy, moved: false };
      else drag.current = { kind: "shape", x0: wx, y0: wy, x1: wx, y1: wy, sx, sy, moved: false };
      return;
    }
    if (s.tool === "template") {
      const [ox, oy] = corner(wx, wy, e.altKey, gs);
      drag.current = { kind: "template", ox, oy, sx, sy, moved: false };
      return;
    }
    if (s.tool === "walls" && L.gm) {
      const [x, y] = corner(wx, wy, e.altKey, gs);
      if (s.wallMode === "erase") {
        eraseWallAt(wx, wy);
        return;
      }
      if (s.wallMode === "door") {
        drag.current = { kind: "door", x0: x, y0: y, x1: x, y1: y, sx, sy, moved: false };
        return;
      }
      const d = wallDraft.current;
      if (d && d[d.length - 2] === x && d[d.length - 1] === y) finishWalls();
      else wallDraft.current = d ? [...d, x, y] : [x, y];
      dirty.current = true;
      return;
    }

    // Seleção / arrasto
    if (L.gm && L.selected.length === 1) {
      const g = L.pageGraphics.find((x) => x.id === L.selected[0]);
      const hs = 10 / v.zoom;
      if (g && !g.locked && g.kind !== "template" && Math.abs(wx - (g.x + g.w)) <= hs && Math.abs(wy - (g.y + g.h)) <= hs) {
        drag.current = { kind: "resize", id: g.id, w0: g.w, h0: g.h, wx0: wx, wy0: wy, sx, sy, moved: false };
        return;
      }
    }
    const hit = hitTest(wx, wy);
    if (hit) {
      let sel = L.selected;
      if (e.shiftKey) sel = sel.includes(hit.id) ? sel.filter((id) => id !== hit.id) : [...sel, hit.id];
      else if (!sel.includes(hit.id)) sel = [hit.id];
      ui.set({ selected: sel });
      const movable = L.pageGraphics.filter((g) => sel.includes(g.id) && !g.locked && selectable(g));
      drag.current = {
        kind: "move", ids: movable.map((g) => g.id),
        start: new Map(movable.map((g) => [g.id, { x: g.x, y: g.y }])),
        wx0: wx, wy0: wy, sx, sy, moved: false, last: 0,
      };
    } else if (e.shiftKey) {
      drag.current = { kind: "marquee", x0: wx, y0: wy, x1: wx, y1: wy, sx, sy, moved: false };
    } else {
      ui.set({ selected: [] });
      drag.current = { kind: "pan", sx, sy, vx: v.x, vy: v.y, button: 0, moved: false, wx, wy };
    }
    pressTimer.current = window.setTimeout(() => {
      const d = drag.current;
      if (d && !d.moved) {
        doPing(wx, wy, e.shiftKey && L.gm);
        drag.current = null;
      }
    }, 550);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const L = latest.current;
    const { sx, sy, wx, wy } = pos(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { sx, sy });
    const pz = pinch.current;
    if (pz && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1;
      const mx = (a.sx + b.sx) / 2;
      const my = (a.sy + b.sy) / 2;
      const zoom = clamp(pz.v0.zoom * (d / pz.d0), 0.05, 6);
      const wx0 = (pz.mx0 - pz.v0.x) / pz.v0.zoom;
      const wy0 = (pz.my0 - pz.v0.y) / pz.v0.zoom;
      view.current = { zoom, x: mx - wx0 * zoom, y: my - wy0 * zoom };
      dirty.current = true;
      return;
    }
    lastMouse.current = [wx, wy];
    const d = drag.current;
    if (!d || !L.page) {
      const cv = canvasRef.current!;
      const s = ui.get();
      if (s.tool !== "select") cv.style.cursor = "crosshair";
      else cv.style.cursor = L.page && (doorAt(sx, sy) || hitTest(wx, wy)) ? "pointer" : "default";
      if (s.tool === "fog" && s.fogShape === "brush" && L.gm && L.page) {
        const gs = L.page.gridSize;
        const r = s.fogBrush - 1;
        fogPreview.current = { x: Math.floor(wx / gs) - r, y: Math.floor(wy / gs) - r, w: r * 2 + 1, h: r * 2 + 1, hide: s.fogMode === "hide" };
        dirty.current = true;
      }
      if (s.tool === "walls" && wallDraft.current && L.page) {
        wallHover.current = corner(wx, wy, e.altKey, L.page.gridSize);
        dirty.current = true;
      }
      return;
    }
    if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) > 4) {
      d.moved = true;
      clearPress();
    }
    if (!d.moved) return;
    const gs = L.page.gridSize;
    const now = performance.now();
    const s = ui.get();
    switch (d.kind) {
      case "pan":
        view.current = { ...view.current, x: d.vx + (sx - d.sx), y: d.vy + (sy - d.sy) };
        break;
      case "move": {
        const dx = wx - d.wx0;
        const dy = wy - d.wy0;
        for (const id of d.ids) {
          const st = d.start.get(id)!;
          overrides.current.set(id, { x: st.x + dx, y: st.y + dy });
        }
        if (now - d.last > LIVE_SEND_MS) {
          d.last = now;
          for (const id of d.ids) {
            const g = L.pageGraphics.find((x) => x.id === id);
            if (!L.gm && g?.kind === "token" && L.page.light?.on) continue; // jogador com paredes: só no fim
            const o = overrides.current.get(id)!;
            send({ t: "update", coll: "graphics", id, patch: { x: Math.round(o.x!), y: Math.round(o.y!) } });
          }
        }
        break;
      }
      case "resize": {
        const w = Math.max(gs / 4, d.w0 + (wx - d.wx0));
        const h = e.shiftKey ? w * (d.h0 / d.w0) : Math.max(gs / 4, d.h0 + (wy - d.wy0));
        overrides.current.set(d.id, { w, h });
        break;
      }
      case "ruler": {
        d.pts[2] = e.altKey ? wx : cellCenter(wx, gs);
        d.pts[3] = e.altKey ? wy : cellCenter(wy, gs);
        rulers.current.set("me", { pts: [...d.pts], color: myColor(), label: measure(d.pts, L.page, L.settings?.diagonal ?? "dnd") });
        if (now - d.last > LIVE_SEND_MS) {
          d.last = now;
          send({ t: "ruler", pageId: L.page.id, pts: d.pts.map(Math.round) });
        }
        break;
      }
      case "fog":
        brushAt(wx, wy);
        sendFog(false);
        break;
      case "fogRect": {
        d.c1 = [Math.floor(wx / gs), Math.floor(wy / gs)];
        const x = Math.min(d.c0[0], d.c1[0]);
        const y = Math.min(d.c0[1], d.c1[1]);
        fogPreview.current = { x, y, w: Math.abs(d.c1[0] - d.c0[0]) + 1, h: Math.abs(d.c1[1] - d.c0[1]) + 1, hide: s.fogMode === "hide" };
        break;
      }
      case "marquee":
        d.x1 = wx;
        d.y1 = wy;
        marquee.current = { x0: d.x0, y0: d.y0, x1: wx, y1: wy };
        break;
      case "draw": {
        if (s.drawMode === "line") d.pts = [d.pts[0], d.pts[1], wx, wy];
        else {
          const lx = d.pts[d.pts.length - 2];
          const ly = d.pts[d.pts.length - 1];
          if (Math.hypot(wx - lx, wy - ly) * view.current.zoom > 3) d.pts.push(wx, wy);
        }
        draft.current = { id: "draft", pageId: L.page.id, layer: "tokens", z: 0, kind: "path", controlledBy: [], stroke: s.drawColor, strokeWidth: s.drawWidth, fill: s.drawFill ? s.drawColor : null, ...pathGraphic(d.pts, {}) } as Graphic;
        break;
      }
      case "shape": {
        d.x1 = wx;
        d.y1 = wy;
        draft.current = {
          id: "draft", pageId: L.page.id, layer: "tokens", z: 0, kind: "shape", controlledBy: [], shape: s.drawMode === "ellipse" ? "ellipse" : "rect",
          x: Math.min(d.x0, wx), y: Math.min(d.y0, wy), w: Math.abs(wx - d.x0), h: Math.abs(wy - d.y0),
          stroke: s.drawColor, strokeWidth: s.drawWidth, fill: s.drawFill ? s.drawColor : null,
        };
        break;
      }
      case "template": {
        const t = makeTemplate(s.tplType, d.ox, d.oy, wx, wy, gs, !e.altKey);
        draft.current = { id: "draft", pageId: L.page.id, layer: "tokens", z: 0, kind: "template", controlledBy: [], color: myColor(), ...t };
        break;
      }
      case "door": {
        const [x, y] = corner(wx, wy, e.altKey, gs);
        d.x1 = x;
        d.y1 = y;
        wallDraft.current = [d.x0, d.y0, x, y];
        break;
      }
    }
    dirty.current = true;
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const tapped = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    clearPress();
    const d = drag.current;
    drag.current = null;
    const L = latest.current;
    if (!d || !L.page) return;
    const gs = L.page.gridSize;
    const until = performance.now() + 3000;
    const s = ui.get();
    // toque duplo (celular) = duplo clique
    if (e.pointerType === "touch" && !d.moved && tapped) {
      const now = performance.now();
      const lt = lastTap.current;
      if (lt && now - lt.t < 320 && Math.hypot(tapped.sx - lt.sx, tapped.sy - lt.sy) < 25) {
        lastTap.current = null;
        onDoubleClick(e);
        return;
      }
      lastTap.current = { t: now, sx: tapped.sx, sy: tapped.sy };
    }
    switch (d.kind) {
      case "pan":
        if (d.button === 2 && !d.moved) {
          if (s.tool === "walls" && wallDraft.current) finishWalls();
          else openMenu(e.clientX, e.clientY, d.wx, d.wy);
        }
        break;
      case "move": {
        if (!d.moved) break;
        const segs = !L.gm && L.page.light?.on ? blockingSegments(L.page, false) : null;
        group(() => {
          for (const id of d.ids) {
            const o = overrides.current.get(id);
            overrides.current.delete(id);
            if (!o) continue;
            const g = L.pageGraphics.find((x) => x.id === id);
            const free = e.altKey || !g || DRAWING_KINDS.includes(g.kind);
            const x = free ? Math.round(o.x!) : snap(o.x!, gs);
            const y = free ? Math.round(o.y!) : snap(o.y!, gs);
            if (segs && g?.kind === "token" && crossesWall(g.x + g.w / 2, g.y + g.h / 2, x + g.w / 2, y + g.h / 2, segs)) {
              toast("Há uma parede no caminho.");
              continue;
            }
            pending.current.set(id, { x, y, until });
            act.update("graphics", id, { x, y });
          }
        });
        break;
      }
      case "resize": {
        const o = overrides.current.get(d.id);
        overrides.current.delete(d.id);
        if (!o || !d.moved) break;
        const g = L.pageGraphics.find((x) => x.id === d.id)!;
        const step = g.layer === "map" || DRAWING_KINDS.includes(g.kind) ? 1 : gs / 2;
        const w = Math.max(step, Math.round(o.w! / step) * step);
        const h = Math.max(step, Math.round(o.h! / step) * step);
        pending.current.set(d.id, { x: g.x, y: g.y, w, h, until });
        const patch: Record<string, unknown> = { w, h };
        if (g.kind === "path" && g.pts) patch.pts = g.pts.map((v, i) => (i % 2 ? (v * h) / g.h : (v * w) / g.w));
        act.update("graphics", d.id, patch);
        break;
      }
      case "ruler":
        window.setTimeout(() => {
          rulers.current.delete("me");
          dirty.current = true;
          send({ t: "ruler", pageId: L.page!.id, pts: null });
        }, 1200);
        break;
      case "fog":
        fog.current.painting = false;
        sendFog(true);
        act.record("pages", L.page.id, d.before);
        break;
      case "fogRect": {
        const f = fogPreview.current;
        fogPreview.current = null;
        if (f) {
          const before = pageSnap();
          paintFog(f.x, f.y, f.w, f.h, !f.hide);
          sendFog(true);
          act.record("pages", L.page.id, before);
        }
        break;
      }
      case "marquee": {
        marquee.current = null;
        const x0 = Math.min(d.x0, d.x1);
        const x1 = Math.max(d.x0, d.x1);
        const y0 = Math.min(d.y0, d.y1);
        const y1 = Math.max(d.y0, d.y1);
        const ids = L.pageGraphics.filter((g) => selectable(g) && g.x < x1 && g.x + g.w > x0 && g.y < y1 && g.y + g.h > y0).map((g) => g.id);
        ui.set({ selected: [...new Set([...L.selected, ...ids])] });
        break;
      }
      case "draw": {
        draft.current = null;
        if (d.pts.length < 4) break;
        const pts = s.drawMode === "line" ? d.pts : simplify(d.pts, 1.2 / view.current.zoom);
        act.create("graphics", {
          id: newId(), pageId: L.page.id, layer: drawLayer(), z: topZ(drawLayer()), kind: "path", controlledBy: [],
          stroke: s.drawColor, strokeWidth: s.drawWidth, fill: s.drawFill && s.drawMode === "free" ? s.drawColor : null,
          ...pathGraphic(pts, {}),
        } as Graphic);
        break;
      }
      case "shape": {
        draft.current = null;
        const w = Math.abs(d.x1 - d.x0);
        const h = Math.abs(d.y1 - d.y0);
        if (w < 4 && h < 4) break;
        act.create("graphics", {
          id: newId(), pageId: L.page.id, layer: drawLayer(), z: topZ(drawLayer()), kind: "shape", controlledBy: [],
          shape: s.drawMode === "ellipse" ? "ellipse" : "rect", x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w, h,
          stroke: s.drawColor, strokeWidth: s.drawWidth, fill: s.drawFill ? s.drawColor : null,
        });
        break;
      }
      case "template": {
        const t = draft.current;
        draft.current = null;
        if (!t?.tpl || t.tpl.size < gs * 0.5) break;
        const lay = L.gm && L.layer !== "map" ? L.layer : "tokens";
        act.create("graphics", { ...t, id: newId(), layer: lay, z: topZ(lay) });
        break;
      }
      case "door": {
        wallDraft.current = null;
        if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < gs * 0.4) break;
        const door: DoorSeg = { id: newId(8), x1: d.x0, y1: d.y0, x2: d.x1, y2: d.y1, open: false };
        act.update("pages", L.page.id, { doors: [...(L.page.doors ?? []), door] });
        break;
      }
    }
    dirty.current = true;
  }

  function onDoubleClick(e: { clientX: number; clientY: number }) {
    const L = latest.current;
    if (ui.get().tool === "walls" && wallDraft.current) {
      finishWalls();
      return;
    }
    const { wx, wy } = pos(e);
    const g = hitTest(wx, wy, L.gm);
    if (!g) return;
    if (g.link && L.gm) {
      const target = linkedPage(g.link);
      ui.set(target ? { viewPageId: target.id } : { generator: g.link.kind, genPreset: g.link });
      return;
    }
    if (g.kind === "card" && canControl(g.controlledBy)) {
      send({ t: "deck", op: "flip", graphicId: g.id });
      return;
    }
    if (g.characterId && game.get().colls.characters[g.characterId]) openSheet(g.characterId);
  }

  // ─── Menu de contexto ────────────────────────────────────────────────────

  function openMenu(cx: number, cy: number, wx: number, wy: number) {
    const L = latest.current;
    const g = hitTest(wx, wy);
    if (!g) return;
    ui.set({ selected: [g.id] });
    const items: MenuItem[] = [];
    if (g.characterId && game.get().colls.characters[g.characterId]) {
      items.push({ label: "Abrir ficha", icon: "book", onClick: () => openSheet(g.characterId!) });
    }
    if (g.kind === "card") {
      items.push(
        { label: g.card?.faceUp ? "Virar para baixo" : "Revelar carta", icon: "refresh", onClick: () => send({ t: "deck", op: "flip", graphicId: g.id }) },
        { label: "Pegar para a mão", icon: "download", onClick: () => send({ t: "deck", op: "take", graphicId: g.id }) },
        { label: "Descartar", icon: "trash", onClick: () => send({ t: "deck", op: "discard", graphicId: g.id }) },
      );
    }
    if (g.link && L.gm) {
      const link = g.link;
      const target = linkedPage(link);
      if (target) items.push({ label: `Ir para ${target.name}`, icon: "map", onClick: () => ui.set({ viewPageId: target.id }) });
      items.push({ label: `Abrir ${link.label} no gerador`, icon: "wand", onClick: () => ui.set({ generator: link.kind, genPreset: link }) });
    }
    if (g.kind === "token" && L.gm) items.push({ label: "Adicionar à iniciativa", icon: "swords", onClick: () => addToTurns(g) });
    if (!L.gm) {
      if (DRAWING_KINDS.includes(g.kind)) items.push({ label: "Excluir", icon: "trash", danger: true, onClick: () => act.remove("graphics", g.id) });
      if (items.length) setMenu({ x: cx, y: cy, items });
      return;
    }
    const zs = L.pageGraphics.filter((x) => x.layer === g.layer).map((x) => x.z);
    items.push(
      "sep",
      { label: "Trazer para frente", icon: "arrowUp", onClick: () => act.update("graphics", g.id, { z: Math.max(...zs) + 1 }) },
      { label: "Enviar para trás", icon: "arrowDown", onClick: () => act.update("graphics", g.id, { z: Math.min(...zs) - 1 }) },
      "sep",
    );
    const layers = [["map", "Camada: Mapa"], ["tokens", "Camada: Tokens"], ["gm", "Camada: Mestre"]] as const;
    for (const [l, label] of layers) {
      if (l !== g.layer) items.push({ label, icon: "layers", onClick: () => act.update("graphics", g.id, { layer: l }) });
    }
    items.push(
      "sep",
      { label: g.locked ? "Destravar" : "Travar", icon: "lock", onClick: () => act.update("graphics", g.id, { locked: !g.locked }) },
      { label: "Duplicar", icon: "copy", onClick: () => act.create("graphics", { ...structuredClone(g), id: newId(), x: g.x + L.page!.gridSize, z: Math.max(...zs) + 1 }) },
      { label: "Excluir", icon: "trash", danger: true, onClick: () => act.remove("graphics", g.id) },
    );
    setMenu({ x: cx, y: cy, items });
  }

  function addToTurns(g: Graphic) {
    const s = game.get().colls.settings.main;
    if (s.turns.entries.some((en) => en.graphicId === g.id)) {
      ui.set({ showTurns: true });
      return;
    }
    const entries = [...s.turns.entries, { id: newId(), name: g.name || "Token", value: 0, graphicId: g.id }];
    api.update("settings", "main", { turns: { ...s.turns, entries, open: true } });
    ui.set({ showTurns: true });
  }

  // ─── Teclado ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      const L = latest.current;
      if (!L.page) return;
      const gs = L.page.gridSize;
      const sel = L.pageGraphics.filter((g) => L.selected.includes(g.id));
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        redo();
      } else if (mod && k === "c" && sel.length) {
        clipboard = sel.filter((g) => L.gm || DRAWING_KINDS.includes(g.kind)).map((g) => structuredClone(g));
      } else if (mod && (k === "v" || k === "d")) {
        const src = k === "d" ? sel.filter((g) => L.gm || DRAWING_KINDS.includes(g.kind)) : clipboard;
        if (!src.length) return;
        e.preventDefault();
        const x0 = Math.min(...src.map((g) => g.x));
        const y0 = Math.min(...src.map((g) => g.y));
        const [mx, my] = k === "d" ? [x0 + gs, y0 + gs] : lastMouse.current;
        const ids: string[] = [];
        group(() => {
          for (const g of src) {
            const id = newId();
            ids.push(id);
            act.create("graphics", { ...structuredClone(g), id, pageId: L.page!.id, x: snap(mx + (g.x - x0), gs), y: snap(my + (g.y - y0), gs), z: topZ(g.layer) });
          }
        });
        ui.set({ selected: ids });
      } else if (mod && k === "a" && L.gm) {
        e.preventDefault();
        ui.set({ selected: L.pageGraphics.filter((g) => g.layer === L.layer).map((g) => g.id) });
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
        const del = sel.filter((g) => L.gm || DRAWING_KINDS.includes(g.kind));
        group(() => del.forEach((g) => act.remove("graphics", g.id)));
        ui.set({ selected: [] });
      } else if (e.key === "Escape") {
        wallDraft.current = null;
        wallHover.current = null;
        setTextInput(null);
        ui.set({ selected: [], tool: "select" });
        dirty.current = true;
      } else if (e.key === "Enter" && wallDraft.current) {
        finishWalls();
      } else if (e.key.startsWith("Arrow") && sel.length) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -gs : e.key === "ArrowRight" ? gs : 0;
        const dy = e.key === "ArrowUp" ? -gs : e.key === "ArrowDown" ? gs : 0;
        const segs = !L.gm && L.page.light?.on ? blockingSegments(L.page, false) : null;
        group(() => {
          for (const g of sel) {
            if (g.locked || !selectable(g)) continue;
            if (segs && g.kind === "token" && crossesWall(g.x + g.w / 2, g.y + g.h / 2, g.x + dx + g.w / 2, g.y + dy + g.h / 2, segs)) {
              toast("Há uma parede no caminho.");
              continue;
            }
            act.update("graphics", g.id, { x: g.x + dx, y: g.y + dy });
          }
        });
      } else if (!mod && !e.altKey) {
        const map: Record<string, ReturnType<typeof ui.get>["tool"]> = { v: "select", r: "ruler", d: "draw", t: "template" };
        if (map[k]) ui.set({ tool: map[k] });
        else if (k === "f" && L.gm) ui.set({ tool: "fog" });
        else if (k === "w" && L.gm) ui.set({ tool: "walls" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─── Soltar imagens, fichas, monstros ────────────────────────────────────

  async function placeImage(img: { url: string; w: number; h: number; name: string }, wx: number, wy: number) {
    const L = latest.current;
    if (!L.page) return;
    const gs = L.page.gridSize;
    const lay = ui.get().layer;
    let w = img.w;
    let h = img.h;
    if (lay !== "map") {
      const k = gs / Math.max(img.w, img.h);
      w = Math.round(img.w * k);
      h = Math.round(img.h * k);
    }
    act.create("graphics", {
      id: newId(), pageId: L.page.id, layer: lay, z: topZ(lay),
      kind: lay === "map" ? "image" : "token",
      x: snap(wx - w / 2, gs), y: snap(wy - h / 2, gs), w, h,
      src: img.url, name: img.name, showName: false, controlledBy: [],
    });
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropping(false);
    const { wx, wy } = pos(e);
    const L = latest.current;
    const cardRaw = e.dataTransfer.getData("application/x-dm-card");
    if (cardRaw && L.page) {
      const { deckId, cardId } = JSON.parse(cardRaw);
      const gs = L.page.gridSize;
      send({ t: "deck", op: "play", deckId, cardId, pageId: L.page.id, x: Math.round(wx - gs * 0.7), y: Math.round(wy - gs), faceUp: true });
      return;
    }
    if (!L.gm) return;
    const monId = e.dataTransfer.getData("application/x-dm-monster");
    if (monId && L.page) {
      const m = (await loadMonsters()).find((x) => x.id === monId);
      if (!m) return;
      const cid = ensureMonsterSheet(m);
      const gs = L.page.gridSize;
      const size = m.token * gs;
      const lay = ui.get().layer === "map" ? "tokens" : ui.get().layer;
      const n = L.pageGraphics.filter((g) => g.characterId === cid).length;
      act.create("graphics", {
        id: newId(), pageId: L.page.id, layer: lay, z: topZ(lay), kind: "token",
        x: snap(wx - size / 2, gs), y: snap(wy - size / 2, gs), w: size, h: size,
        name: n ? `${m.name} ${n + 1}` : m.name, showName: true, characterId: cid, unlinked: true,
        controlledBy: [], bar: { value: m.hp, max: m.hp }, color: "#8e2b2b",
      });
      return;
    }
    const charId = e.dataTransfer.getData("application/x-dm-character");
    const ch = charId ? game.get().colls.characters[charId] : undefined;
    if (ch && L.page) {
      const gs = L.page.gridSize;
      const lay = ui.get().layer === "map" ? "tokens" : ui.get().layer;
      const npc = ch.controlledBy.length === 0;
      const size = Number(ch.data.token_size) || 1;
      act.create("graphics", {
        id: newId(), pageId: L.page.id, layer: lay, z: topZ(lay), kind: "token",
        x: snap(wx - (gs * size) / 2, gs), y: snap(wy - (gs * size) / 2, gs), w: gs * size, h: gs * size,
        src: ch.avatar, name: ch.name, showName: true, characterId: ch.id, controlledBy: ch.controlledBy,
        color: ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085"][ch.name.length % 6],
        unlinked: npc || undefined,
        bar: npc && ch.data.hp !== undefined ? { value: Number(ch.data.hp) || 0, max: Number(ch.data.hp_max ?? ch.data.hp) || 0 } : undefined,
        vision: npc ? undefined : { on: true, range: 0, dark: Number(ch.data.darkvision) || 0 },
      });
      return;
    }
    const raw = e.dataTransfer.getData("application/x-dm-asset");
    if (raw) {
      await placeImage(JSON.parse(raw), wx, wy);
      return;
    }
    for (const file of Array.from(e.dataTransfer.files)) {
      if (!file.type.startsWith("image/")) continue;
      const url = await uploadFile(file, file.name);
      const el = getImage(url) ?? (await loadImage(url));
      const name = file.name.replace(/\.[^.]+$/, "");
      api.create("assets", { id: newId(), name, url, type: "image", w: el.naturalWidth, h: el.naturalHeight });
      await placeImage({ url, w: el.naturalWidth, h: el.naturalHeight, name }, wx, wy);
    }
  }

  const commitText = (text: string) => {
    const L = latest.current;
    const ti = textInput;
    setTextInput(null);
    if (!ti || !L.page || !text.trim()) return;
    const h = L.page.gridSize * 0.6;
    const w = Math.max(h, text.length * h * 0.62);
    act.create("graphics", {
      id: newId(), pageId: L.page.id, layer: drawLayer(), z: topZ(drawLayer()), kind: "text", text: text.trim(),
      color: ui.get().drawColor, x: ti.wx, y: ti.wy - h / 2, w, h, controlledBy: [],
    });
  };

  const hint = tool === "ruler"
    ? "Arraste para medir · Alt: sem encaixe"
    : tool === "fog"
      ? fogShape === "room" ? "Clique numa sala para revelar/esconder" : "Arraste para pintar a névoa"
      : tool === "draw"
        ? drawMode === "text" ? "Clique para escrever" : "Arraste para desenhar · Delete apaga o selecionado"
        : tool === "template"
          ? "Arraste da origem para definir o tamanho · Alt: sem encaixe"
          : tool === "walls"
            ? "Clique ponto a ponto · Enter, duplo clique ou botão direito termina · Alt: sem encaixe"
            : null;

  return (
    <div
      className="board-wrap"
      ref={wrapRef}
      onDragOver={(e) => {
        if (!gm && !e.dataTransfer.types.includes("application/x-dm-card")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          cancelDrag();
        }}
        onPointerLeave={() => {
          if (fogPreview.current && !drag.current) {
            fogPreview.current = null;
            dirty.current = true;
          }
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      <canvas ref={weatherRef} className="weather-layer" />
      {page && <ToolOptions page={page} />}
      {textInput && (
        <input
          className="input board-text"
          autoFocus
          style={{ left: textInput.sx, top: textInput.sy - 16 }}
          placeholder="Texto e Enter"
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setTextInput(null);
          }}
          onBlur={(e) => commitText(e.target.value)}
        />
      )}
      {!page && <div className="center" style={{ position: "absolute", inset: 0, color: "var(--muted)" }}>Nenhuma página</div>}
      {noVision && <div className="board-hint top">Escuro total: você não tem nenhum token com visão nesta página.</div>}
      {hint && <div className="board-hint">{hint}</div>}
      {dropping && <div className="center" style={{ position: "absolute", inset: 0, background: "rgba(212,167,58,0.08)", border: "2px dashed var(--accent)", pointerEvents: "none" }}>Soltar na camada {layer === "map" ? "Mapa" : layer === "gm" ? "Mestre" : "Tokens"}</div>}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

