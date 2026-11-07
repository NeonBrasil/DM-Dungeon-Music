// Motor das fichas no navegador: o cálculo (@{campo}, fórmulas) fica em shared/sheet.ts;
// aqui ficam as rolagens que vão para o servidor.
import type { Character, SheetTemplate } from "../../shared/types.ts";
import { applyMode, expand, opExpr, type Row, type RollMode } from "../../shared/sheet.ts";
import { api } from "../game.ts";

export { applyMode, defaultData, expand, fieldIndex, opExpr, resolver, type Row, type RollMode } from "../../shared/sheet.ts";

export function fmtBonus(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
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

export function rollOp(ctx: RollCtx, dice: number, bonus: number, label: string, tracker?: boolean) {
  api.roll(opExpr(dice, bonus), { label, gm: ctx.secret, as: ctx.character.id, tracker, graphicId: tracker ? ctx.graphicId : undefined });
}

export function rollCoc(ctx: RollCtx, target: number, label: string, bonus: number) {
  api.roll("1d100", { label, gm: ctx.secret, as: ctx.character.id, coc: { target, mod: bonus } });
}
