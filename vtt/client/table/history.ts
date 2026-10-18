// Desfazer/refazer (Ctrl+Z / Ctrl+Y) das ações feitas neste navegador.
// Cada registro guarda a entidade inteira antes e depois; desfazer restaura o "antes".
import type { CollName } from "../../shared/types.ts";
import { api, game } from "../game.ts";

interface Rec { coll: CollName; id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }

const LIMIT = 100;
const undoStack: Rec[][] = [];
const redoStack: Rec[][] = [];
let batch: Rec[] | null = null;

const snap = (coll: CollName, id: string) => {
  const e = game.get().colls[coll][id];
  return e ? (structuredClone(e) as unknown as Record<string, unknown>) : null;
};

function push(r: Rec) {
  if (batch) {
    batch.push(r);
    return;
  }
  undoStack.push([r]);
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack.length = 0;
}

/** Agrupa várias ações num passo só de desfazer. */
export function group(fn: () => void) {
  const outer = batch;
  if (!outer) batch = [];
  try {
    fn();
  } finally {
    if (!outer) {
      const b = batch!;
      batch = null;
      if (b.length) {
        undoStack.push(b);
        if (undoStack.length > LIMIT) undoStack.shift();
        redoStack.length = 0;
      }
    }
  }
}

/** Mesmas ações da api, mas registradas para desfazer. */
export const act = {
  create<C extends CollName>(coll: C, data: Parameters<typeof api.create<C>>[1]) {
    const d = data as unknown as { id: string };
    api.create(coll, data);
    push({ coll, id: d.id, before: null, after: structuredClone(data) as unknown as Record<string, unknown> });
  },
  update(coll: CollName, id: string, patch: Record<string, unknown>) {
    const before = snap(coll, id);
    if (!before) return;
    api.update(coll, id, patch);
    push({ coll, id, before, after: snap(coll, id) });
  },
  remove(coll: CollName, id: string) {
    const before = snap(coll, id);
    if (!before) return;
    api.remove(coll, id);
    push({ coll, id, before, after: null });
  },
  /** Registra uma mudança já aplicada por fora (ex.: arrasto com envio próprio). */
  record(coll: CollName, id: string, before: Record<string, unknown> | null) {
    push({ coll, id, before, after: snap(coll, id) });
  },
};

function restore(coll: CollName, id: string, target: Record<string, unknown> | null) {
  const cur = snap(coll, id);
  if (!target) {
    if (cur) api.remove(coll, id);
    return;
  }
  if (!cur) {
    api.create(coll, structuredClone(target) as never);
    return;
  }
  const patch: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(cur), ...Object.keys(target)])) {
    if (k === "id") continue;
    if (JSON.stringify(cur[k]) !== JSON.stringify(target[k])) patch[k] = target[k] ?? null;
  }
  if (Object.keys(patch).length) api.update(coll, id, patch);
}

export function undo() {
  const b = undoStack.pop();
  if (!b) return false;
  for (const r of [...b].reverse()) restore(r.coll, r.id, r.before);
  redoStack.push(b);
  return true;
}

export function redo() {
  const b = redoStack.pop();
  if (!b) return false;
  for (const r of b) restore(r.coll, r.id, r.after);
  undoStack.push(b);
  return true;
}
