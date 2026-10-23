// Compêndio do mestre: bestiário e itens de cada sistema, entregues só ao mestre (/api/compendium/<nome>).
// D&D 5e vem do SRD 5.1 (scripts/build-srd.ts); Star Wars é escrito à mão neste diretório.
import fs from "node:fs";
import path from "node:path";
import { SW_BESTIARY } from "./sw-bestiary.ts";
import { SW_ITEMS } from "./sw-items.ts";

const file = (name: string) => () => fs.readFileSync(path.join(import.meta.dirname, name), "utf8");

const SOURCES: Record<string, () => string> = {
  "bestiary-dnd": file("bestiary-dnd.json"),
  "items-dnd": file("items-dnd.json"),
  "bestiary-sw": () => JSON.stringify(SW_BESTIARY),
  "items-sw": () => JSON.stringify(SW_ITEMS),
};

const cache = new Map<string, string>();

/** JSON pronto para enviar, ou null se o nome não existe. */
export function compendium(name: string): string | null {
  if (!Object.hasOwn(SOURCES, name)) return null;
  if (!cache.has(name)) cache.set(name, SOURCES[name]());
  return cache.get(name)!;
}
