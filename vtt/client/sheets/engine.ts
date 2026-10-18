// Motor das fichas: resolve @{campo} (incluindo campos calculados, modificadores de atributo
// e @{.coluna} de linhas de listas) e monta as rolagens que vão para o servidor.
import type { Character, SheetField, SheetTemplate } from "../../shared/types.ts";
import { evaluate } from "../../shared/dice.ts";
import { api } from "../game.ts";

export type Row = Record<string, unknown>;

/** Índice de campos por id (inclui colunas de listas não; essas só existem por linha). */
export function fieldIndex(t: SheetTemplate): Map<string, SheetField> {
  const m = new Map<string, SheetField>();
  for (const s of t.sections) for (const f of s.fields) if (f.id) m.set(f.id, f);
  return m;
}

export function defaultData(t: SheetTemplate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of t.sections) {
    for (const f of s.fields) {
      if (!f.id) continue;
      if (f.type === "list") out[f.id] = [];
      else if (f.type === "resource") {
        out[f.id] = f.default ?? 0;
        out[`${f.id}_max`] = f.default ?? 0;
      } else if (f.default !== undefined) out[f.id] = f.default;
    }
  }
  return out;
}

const toNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Cria a função que transforma nomes em números para esta ficha (e linha, se houver). */
export function resolver(t: SheetTemplate, data: Record<string, unknown>, row?: Row) {
  const idx = fieldIndex(t);
  const stack = new Set<string>();
  const resolve = (name: string): number => {
    if (stack.has(name) || stack.size > 24) return 0; // referência circular
    stack.add(name);
    try {
      if (name.startsWith(".")) return valueOf(row?.[name.slice(1)]);
      const f = idx.get(name);
      if (f && (f.type === "computed" || (f.type === "skill" && !f.check)) && f.formula) return safeEval(f.formula);
      if (name.endsWith("_mod")) {
        const base = idx.get(name.slice(0, -4));
        if (base?.type === "attribute" && base.formula) return safeEval(base.formula);
      }
      const v = data[name] ?? f?.default;
      return valueOf(v);
    } finally {
      stack.delete(name);
    }
  };
  const valueOf = (v: unknown): number => {
    const n = toNum(v);
    if (n !== null) return n;
    return safeEval(String(v)); // texto com fórmula, ex.: "@{str_mod}+@{pb}"
  };
  const safeEval = (expr: string): number => {
    try {
      return evaluate(expr, resolve);
    } catch {
      return 0;
    }
  };
  return { resolve, safeEval };
}

/**
 * Expande @{…} em texto para mandar ao servidor: campos calculados viram números;
 * campos de texto com fórmula (ex.: dano "1d8 + @{str_mod}") entram como (fórmula).
 */
export function expand(t: SheetTemplate, data: Record<string, unknown>, expr: string, row?: Row, depth = 0): string {
  if (depth > 8) return "0";
  const idx = fieldIndex(t);
  const { resolve } = resolver(t, data, row);
  const num = (n: number) => (n < 0 ? `(${n})` : String(n));
  return expr.replace(/@\{([^}]+)\}/g, (_, raw: string) => {
    const name = raw.trim();
    const f = idx.get(name);
    const formulaField = (f && (f.type === "computed" || (f.type === "skill" && !f.check)) && f.formula)
      || (name.endsWith("_mod") && idx.get(name.slice(0, -4))?.type === "attribute");
    if (formulaField) return num(resolve(name));
    const v = name.startsWith(".") ? row?.[name.slice(1)] : data[name] ?? f?.default;
    const n = toNum(v);
    if (n !== null) return num(n);
    return `(${expand(t, data, String(v), row, depth + 1)})`;
  });
}

export function fmtBonus(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export type RollMode = "normal" | "adv" | "dis";

/** Troca o primeiro 1d20 por 2d20kh1/kl1 conforme vantagem/desvantagem. */
function applyMode(expr: string, mode: RollMode): string {
  if (mode === "normal") return expr;
  return expr.replace(/\b1?d20\b(?!k)/i, mode === "adv" ? "2d20kh1" : "2d20kl1");
}

export interface RollCtx {
  character: Character;
  template: SheetTemplate;
  mode: RollMode;
  secret: boolean;
  graphicId?: string; // token usado na iniciativa
}

export function rollFormula(ctx: RollCtx, formula: string, label: string, row?: Row, tracker?: boolean) {
  const expr = applyMode(expand(ctx.template, ctx.character.data, formula, row), ctx.template.advantage ? ctx.mode : "normal");
  api.roll(expr, {
    label: `${label}${ctx.template.advantage && ctx.mode !== "normal" && /d20/.test(formula) ? (ctx.mode === "adv" ? " (vantagem)" : " (desvantagem)") : ""}`,
    gm: ctx.secret, as: ctx.character.id, tracker, graphicId: tracker ? ctx.graphicId : undefined,
  });
}

/** Ordem Paranormal: rola tantos d20 quanto o atributo e fica com o maior; atributo 0 = 2d20, o menor. */
export function opExpr(dice: number, bonus: number): string {
  const n = Math.max(0, Math.min(10, Math.trunc(dice)));
  const base = n > 0 ? `${n}d20kh1` : "2d20kl1";
  return bonus ? `${base} ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}` : base;
}

export function rollOp(ctx: RollCtx, dice: number, bonus: number, label: string, tracker?: boolean) {
  api.roll(opExpr(dice, bonus), { label, gm: ctx.secret, as: ctx.character.id, tracker, graphicId: tracker ? ctx.graphicId : undefined });
}

export function rollCoc(ctx: RollCtx, target: number, label: string, bonus: number) {
  api.roll("1d100", { label, gm: ctx.secret, as: ctx.character.id, coc: { target, mod: bonus } });
}
