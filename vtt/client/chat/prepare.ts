// Antes de mandar ao chat: perguntas ?{…} (abre uma janelinha) e referências @{Ficha|campo}.
import { game } from "../game.ts";
import { createStore } from "../lib/store.ts";
import { expand } from "../sheets/engine.ts";
import { findTemplate } from "../sheets/templates.ts";

export interface Query { q: string; options: [string, string][] | null; def: string }

export const queryStore = createStore({
  items: [] as Query[],
  resolve: null as null | ((vals: string[] | null) => void),
});

function ask(items: Query[]): Promise<string[] | null> {
  return new Promise((resolve) => queryStore.set({ items, resolve }));
}

const QUERY_RE = /\?\{([^}|]+)(?:\|([^}]*))?\}/g;

/** Analisa ?{Pergunta|padrão} e ?{Pergunta|Rótulo,valor|Rótulo,valor}. */
export function parseQueries(text: string): Query[] {
  const out = new Map<string, Query>();
  for (const m of text.matchAll(QUERY_RE)) {
    const q = m[1].trim();
    if (out.has(q)) continue;
    const parts = (m[2] ?? "").split("|");
    if (parts.length > 1 || parts[0].includes(",")) {
      const options = parts.filter(Boolean).map((p) => {
        const i = p.indexOf(",");
        return (i < 0 ? [p.trim(), p.trim()] : [p.slice(0, i).trim(), p.slice(i + 1).trim()]) as [string, string];
      });
      out.set(q, { q, options, def: options[0]?.[1] ?? "" });
    } else out.set(q, { q, options: null, def: parts[0] ?? "" });
  }
  return [...out.values()];
}

export function fillQueries(text: string, answers: Map<string, string>): string {
  return text.replace(QUERY_RE, (_, q: string) => answers.get(q.trim()) ?? "");
}

/** @{Nome da ficha|campo} → valor (fichas que você enxerga). */
export function fillCharRefs(text: string): string {
  const { characters, templates } = game.get().colls;
  return text.replace(/@\{([^}|]+)\|([^}]+)\}/g, (whole, name: string, field: string) => {
    const ch = Object.values(characters).find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    if (!ch) return whole;
    return expand(findTemplate(ch.template, templates), ch.data, `@{${field.trim()}}`);
  });
}

export async function prepareText(text: string): Promise<string | null> {
  const qs = parseQueries(text);
  if (qs.length) {
    const vals = await ask(qs);
    if (!vals) return null;
    text = fillQueries(text, new Map(qs.map((q, i) => [q.q, vals[i]])));
  }
  return fillCharRefs(text);
}
