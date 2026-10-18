// Rolagem de dados: "2d20kh1 + 5", "4d6dl1", "1d6!", "2d6r2", "d%", "4dF", floor()/max()...
// O servidor rola (rng criptográfico); o cliente só avalia fórmulas sem dados (fichas).
import type { CocLevel, Die, RollResult, RollSeg } from "./types.ts";

/** Retorna um inteiro uniforme em 1..sides. */
export type Rng = (sides: number) => number;

type ModOp = "kh" | "kl" | "dh" | "dl" | "r" | "!";
interface Mod { op: ModOp; n: number }

type Node =
  | { n: "num"; v: number; src: string }
  | { n: "dice"; count: number; sides: number; fudge: boolean; mods: Mod[]; src: string }
  | { n: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node }
  | { n: "neg"; a: Node }
  | { n: "par"; a: Node }
  | { n: "fn"; name: string; args: Node[] }
  | { n: "ref"; name: string };

interface Tok { k: "num" | "dice" | "ref" | "id" | "op"; v: string }

const FUNCS: Record<string, (...a: number[]) => number> = {
  floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max,
};

const MAX_DICE = 300;
const MAX_SIDES = 1000;
const MAX_EXPLODE = 100;

export class DiceError extends Error {}

const DICE_RE = /^(\d*)d(\d+|%|f)((?:kh|kl|dh|dl|k|r|!)\d*)*/i;
const MOD_RE = /(kh|kl|dh|dl|k|r|!)(\d*)/gi;

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if ((m = DICE_RE.exec(rest))) { toks.push({ k: "dice", v: m[0] }); i += m[0].length; continue; }
    if ((m = /^\d+(\.\d+)?/.exec(rest))) { toks.push({ k: "num", v: m[0] }); i += m[0].length; continue; }
    if ((m = /^@\{([^}]+)\}/.exec(rest))) { toks.push({ k: "ref", v: m[1].trim() }); i += m[0].length; continue; }
    if ((m = /^[a-z_][a-z0-9_]*/i.exec(rest))) { toks.push({ k: "id", v: m[0].toLowerCase() }); i += m[0].length; continue; }
    if ("+-*/(),".includes(c)) { toks.push({ k: "op", v: c }); i++; continue; }
    throw new DiceError(`Caractere inesperado: "${c}"`);
  }
  return toks;
}

function parseDice(src: string): Node {
  const m = DICE_RE.exec(src)!;
  const count = m[1] === "" ? 1 : parseInt(m[1], 10);
  const fudge = m[2].toLowerCase() === "f";
  const sides = fudge ? 3 : m[2] === "%" ? 100 : parseInt(m[2], 10);
  if (count < 1 || count > MAX_DICE) throw new DiceError("Quantidade de dados inválida");
  if (sides < 1 || sides > MAX_SIDES) throw new DiceError("Número de faces inválido");
  const mods: Mod[] = [];
  const modSrc = src.slice(m[1].length + 1 + m[2].length);
  for (const mm of modSrc.matchAll(MOD_RE)) {
    let op = mm[1].toLowerCase();
    if (op === "k") op = "kh";
    const n = mm[2] === "" ? 1 : parseInt(mm[2], 10);
    mods.push({ op: op as ModOp, n });
  }
  return { n: "dice", count, sides, fudge, mods, src };
}

export function parse(expr: string): Node {
  const toks = lex(expr);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === "op" && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new DiceError(`Esperado "${v}"`);
    p++;
  };

  function expr_(): Node {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = toks[p++].v as "+" | "-";
      left = { n: "bin", op, a: left, b: term() };
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    while (isOp("*") || isOp("/")) {
      const op = toks[p++].v as "*" | "/";
      left = { n: "bin", op, a: left, b: unary() };
    }
    return left;
  }
  function unary(): Node {
    if (isOp("-")) { p++; return { n: "neg", a: unary() }; }
    if (isOp("+")) { p++; return unary(); }
    return atom();
  }
  function atom(): Node {
    const t = peek();
    if (!t) throw new DiceError("Expressão incompleta");
    p++;
    if (t.k === "num") return { n: "num", v: parseFloat(t.v), src: t.v };
    if (t.k === "dice") return parseDice(t.v);
    if (t.k === "ref") return { n: "ref", name: t.v };
    if (t.k === "id") {
      if (!(t.v in FUNCS)) throw new DiceError(`Função desconhecida: ${t.v}`);
      expect("(");
      const args: Node[] = [expr_()];
      while (isOp(",")) { p++; args.push(expr_()); }
      expect(")");
      return { n: "fn", name: t.v, args };
    }
    if (t.v === "(") {
      const a = expr_();
      expect(")");
      return { n: "par", a };
    }
    throw new DiceError(`Símbolo inesperado: "${t.v}"`);
  }

  if (toks.length === 0) throw new DiceError("Expressão vazia");
  const root = expr_();
  if (p < toks.length) throw new DiceError(`Símbolo inesperado: "${toks[p].v}"`);
  return root;
}

interface Ctx {
  rng?: Rng;
  ref?: (name: string) => number;
  segs: RollSeg[];
  dice: number;
}

function rollDice(node: Extract<Node, { n: "dice" }>, ctx: Ctx): number {
  if (!ctx.rng) throw new DiceError("Dados não permitidos aqui");
  const rng = ctx.rng;
  ctx.dice += node.count;
  if (ctx.dice > MAX_DICE) throw new DiceError("Dados demais");
  const face = () => (node.fudge ? rng(3) - 2 : rng(node.sides));
  const reroll = node.mods.find((m) => m.op === "r");
  const explode = node.mods.some((m) => m.op === "!") && !node.fudge && node.sides > 1;
  const rolls: Die[] = [];
  for (let i = 0; i < node.count; i++) {
    let v = face();
    if (reroll && v <= reroll.n) {
      rolls.push({ v, drop: true });
      v = face();
    }
    rolls.push({ v });
    let guard = 0;
    while (explode && v === node.sides && guard++ < MAX_EXPLODE) {
      v = face();
      rolls.push({ v, boom: true });
    }
  }
  for (const m of node.mods) {
    if (m.op === "r" || m.op === "!") continue;
    const live = rolls.filter((d) => !d.drop).sort((a, b) => a.v - b.v);
    const n = Math.min(m.n, live.length);
    let dropped: Die[] = [];
    if (m.op === "kh") dropped = live.slice(0, live.length - n);
    else if (m.op === "kl") dropped = live.slice(n);
    else if (m.op === "dh") dropped = live.slice(live.length - n);
    else if (m.op === "dl") dropped = live.slice(0, n);
    for (const d of dropped) d.drop = true;
  }
  ctx.segs.push({ k: "dice", src: node.src, sides: node.fudge ? 0 : node.sides, rolls });
  return rolls.reduce((s, d) => s + (d.drop ? 0 : d.v), 0);
}

function ev(node: Node, ctx: Ctx): number {
  const txt = (v: string) => ctx.segs.push({ k: "txt", v });
  switch (node.n) {
    case "num":
      txt(node.src);
      return node.v;
    case "dice":
      return rollDice(node, ctx);
    case "ref": {
      if (!ctx.ref) throw new DiceError(`Referência não resolvida: @{${node.name}}`);
      const v = ctx.ref(node.name);
      txt(String(v));
      return v;
    }
    case "neg":
      txt("-");
      return -ev(node.a, ctx);
    case "par": {
      txt("(");
      const v = ev(node.a, ctx);
      txt(")");
      return v;
    }
    case "fn": {
      txt(node.name + "(");
      const vals = node.args.map((a, i) => {
        if (i > 0) txt(", ");
        return ev(a, ctx);
      });
      txt(")");
      return FUNCS[node.name](...vals);
    }
    case "bin": {
      const a = ev(node.a, ctx);
      txt(` ${node.op} `);
      const b = ev(node.b, ctx);
      if (node.op === "+") return a + b;
      if (node.op === "-") return a - b;
      if (node.op === "*") return a * b;
      return b === 0 ? 0 : a / b;
    }
  }
}

function mergeSegs(segs: RollSeg[]): RollSeg[] {
  const out: RollSeg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (s.k === "txt" && last?.k === "txt") last.v += s.v;
    else out.push(s);
  }
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function roll(expr: string, rng: Rng): RollResult {
  const clean = expr.trim();
  const ctx: Ctx = { rng, segs: [], dice: 0 };
  const total = ev(parse(clean), ctx);
  return { expr: clean, total: round2(total), segs: mergeSegs(ctx.segs) };
}

/** Avalia fórmula sem dados (campos calculados das fichas). */
export function evaluate(expr: string, ref: (name: string) => number): number {
  const v = ev(parse(expr), { ref, segs: [], dice: 0 });
  return Number.isFinite(v) ? round2(v) : 0;
}

/** Troca @{campo} por números antes de mandar a rolagem ao servidor. */
export function substituteRefs(expr: string, ref: (name: string) => number): string {
  return expr.replace(/@\{([^}]+)\}/g, (_, name: string) => {
    const v = ref(name.trim());
    return v < 0 ? `(${v})` : String(v);
  });
}

/** Teste de Call of Cthulhu 7e: d100 ≤ alvo, com dados de bônus (mod > 0) ou penalidade (mod < 0). */
export function rollCoc(target: number, mod: number, rng: Rng): RollResult {
  const m = Math.max(-2, Math.min(2, Math.trunc(mod)));
  const units = rng(10) - 1;
  const tens: number[] = [];
  for (let i = 0; i < 1 + Math.abs(m); i++) tens.push((rng(10) - 1) * 10);
  const vals = tens.map((t) => t + units || 100);
  const value = m > 0 ? Math.min(...vals) : m < 0 ? Math.max(...vals) : vals[0];
  let level: CocLevel;
  if (value === 1) level = "critical";
  else if (value === 100 || (target < 50 && value >= 96)) level = "fumble";
  else if (value <= Math.floor(target / 5)) level = "extreme";
  else if (value <= Math.floor(target / 2)) level = "hard";
  else if (value <= target) level = "regular";
  else level = "failure";
  const expr = `1d100 ≤ ${target}` + (m > 0 ? ` (+${m} bônus)` : m < 0 ? ` (${-m} penalidade)` : "");
  return { expr, total: value, segs: [{ k: "txt", v: String(value) }], coc: { target, tens, units, level } };
}

export const COC_LABEL: Record<CocLevel, string> = {
  critical: "Crítico!",
  extreme: "Sucesso extremo",
  hard: "Sucesso difícil",
  regular: "Sucesso",
  failure: "Falha",
  fumble: "Desastre!",
};
