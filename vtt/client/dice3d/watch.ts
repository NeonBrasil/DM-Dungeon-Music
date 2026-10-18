// Observa o chat: cada rolagem nova anima os dados 3D; o resultado aparece quando eles param.
import { useEffect } from "react";
import { game } from "../game.ts";
import { createStore } from "../lib/store.ts";

const KEY = "dm.dice3d";
const initial = (() => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
})();

export const dicePrefs = createStore({ on: initial });
export const rolling = createStore({ ids: [] as string[] });

export function setDice3d(on: boolean) {
  dicePrefs.set({ on });
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* sem armazenamento */
  }
}

const done = (id: string) => rolling.set((s) => ({ ids: s.ids.filter((x) => x !== id) }));

export function useDiceWatcher() {
  useEffect(() => {
    const seen = new Set(Object.keys(game.get().colls.chat));
    let last = game.get().colls.chat;
    return game.subscribe(() => {
      const chat = game.get().colls.chat;
      if (chat === last) return;
      last = chat;
      for (const [id, m] of Object.entries(chat)) {
        if (seen.has(id)) continue;
        seen.add(id);
        if (m.kind !== "roll" || !m.roll || !dicePrefs.get().on) continue;
        rolling.set((s) => ({ ids: [...s.ids, id] }));
        const extra = m.roll.coc ? { tens: m.roll.coc.tens, units: m.roll.coc.units } : undefined;
        import("./dice3d.ts")
          .then((d) => d.animateRoll(m.roll!.segs, m.color, extra))
          .catch(() => {})
          .finally(() => done(id));
      }
    });
  }, []);
}
