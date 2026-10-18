// Avisos rápidos no canto da tela (erros do servidor, "parede no caminho", etc.).
import { useEffect } from "react";
import { onEvent } from "../game.ts";
import { createStore } from "../lib/store.ts";

const toasts = createStore({ list: [] as { id: number; text: string }[] });
let seq = 0;

export function toast(text: string) {
  const id = ++seq;
  toasts.set((s) => ({ list: [...s.list.slice(-3), { id, text }] }));
  setTimeout(() => toasts.set((s) => ({ list: s.list.filter((t) => t.id !== id) })), 3500);
}

export function Toasts() {
  const list = toasts.use((s) => s.list);
  useEffect(() => onEvent((m) => {
    if (m.t === "error") toast(m.msg);
  }), []);
  return (
    <div className="toasts">
      {list.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  );
}
