// Toca as faixas liberadas pelo servidor, sincronizadas pelo relógio do servidor.
// Cada pessoa tem o próprio volume de música/efeitos (guardado no navegador).
import type { Track } from "../../shared/types.ts";
import { api, game, serverNow } from "../game.ts";
import { createStore } from "../lib/store.ts";

const PREFS_KEY = "dm.audio";

function loadPrefs() {
  try {
    return { music: 0.8, sfx: 0.9, muted: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { music: 0.8, sfx: 0.9, muted: false };
  }
}

export const audioPrefs = createStore({ ...loadPrefs(), blocked: false });

export function setAudioPrefs(p: Partial<{ music: number; sfx: number; muted: boolean }>) {
  audioPrefs.set(p);
  const { music, sfx, muted } = audioPrefs.get();
  localStorage.setItem(PREFS_KEY, JSON.stringify({ music, sfx, muted }));
}

const els = new Map<string, HTMLAudioElement>();

/** Posição (s) em que a faixa deveria estar agora; null se já acabou (sem loop). */
export function trackPosition(t: Track, duration: number): number | null {
  const p = Math.max(0, (serverNow() - t.startedAt) / 1000);
  if (!Number.isFinite(duration) || duration <= 0) return p;
  if (t.loop) return p % duration;
  return p < duration ? p : null;
}

function sync(t: Track, el: HTMLAudioElement) {
  const prefs = audioPrefs.get();
  el.loop = t.loop;
  el.volume = prefs.muted ? 0 : Math.min(1, Math.max(0, t.volume * (t.kind === "music" ? prefs.music : prefs.sfx)));
  if (!t.playing) {
    if (!el.paused) el.pause();
    return;
  }
  const want = trackPosition(t, el.duration);
  if (want === null) {
    if (!el.paused) el.pause();
    return;
  }
  if (el.paused) {
    if (el.readyState >= 1) el.currentTime = want;
    el.play().then(
      () => audioPrefs.get().blocked && audioPrefs.set({ blocked: false }),
      () => audioPrefs.set({ blocked: true }),
    );
  } else if (el.readyState >= 1 && Math.abs(el.currentTime - want) > 0.8) {
    el.currentTime = want;
  }
}

function applyAll() {
  const { colls } = game.get();
  const tracks = colls.tracks;
  for (const t of Object.values(tracks)) {
    let el = els.get(t.id);
    if (!el && !t.playing) continue;
    if (!el || el.dataset.src !== t.src) {
      el?.pause();
      el = new Audio();
      el.preload = "auto";
      el.src = t.src;
      el.dataset.src = t.src;
      const id = t.id;
      el.addEventListener("loadedmetadata", () => {
        const cur = game.get().colls.tracks[id];
        if (cur) sync(cur, els.get(id)!);
      });
      el.addEventListener("ended", () => {
        // efeito avulso terminou: o mestre marca como parado
        const cur = game.get().colls.tracks[id];
        if (game.get().role === "gm" && cur?.playing && !cur.loop) api.update("tracks", id, { playing: false, pausedAt: 0 });
      });
      els.set(t.id, el);
    }
    sync(t, el);
  }
  for (const [id, el] of els) {
    if (!tracks[id]) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      els.delete(id);
    }
  }
}

let started = false;
let timer = 0;
const unsubs: (() => void)[] = [];

export function startAudio() {
  if (started) return;
  started = true;
  let lastTracks = game.get().colls.tracks;
  unsubs.push(game.subscribe(() => {
    const t = game.get().colls.tracks;
    if (t !== lastTracks) {
      lastTracks = t;
      applyAll();
    }
  }));
  unsubs.push(audioPrefs.subscribe(applyAll));
  timer = window.setInterval(applyAll, 3000); // corrige deriva
  applyAll();
}

export function stopAudio() {
  started = false;
  clearInterval(timer);
  for (const u of unsubs.splice(0)) u();
  for (const el of els.values()) el.pause();
  els.clear();
}

/** Primeiro clique da página destrava o áudio bloqueado pelo navegador. */
export function unlockAudio() {
  audioPrefs.set({ blocked: false });
  applyAll();
}

/** Posição atual (s) de uma faixa neste navegador (para pausar e retomar no mesmo ponto). */
export function localPosition(id: string): number {
  return els.get(id)?.currentTime ?? 0;
}
