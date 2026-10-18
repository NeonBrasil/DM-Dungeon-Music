import { test } from "node:test";
import assert from "node:assert/strict";
import { DiceError, evaluate, roll, rollCoc, substituteRefs } from "../shared/dice.ts";

/** Rng determinístico: devolve os valores da fila (já em 1..sides). */
function seq(...vals: number[]) {
  let i = 0;
  return (sides: number) => {
    const v = vals[i++ % vals.length];
    assert.ok(v >= 1 && v <= sides, `valor ${v} fora de 1..${sides}`);
    return v;
  };
}

test("soma simples com modificador", () => {
  const r = roll("1d20+5", seq(12));
  assert.equal(r.total, 17);
  assert.deepEqual(r.segs[0], { k: "dice", src: "1d20", sides: 20, rolls: [{ v: 12 }] });
});

test("vantagem: 2d20kh1 mantém o maior", () => {
  const r = roll("2d20kh1 + 3", seq(4, 17));
  assert.equal(r.total, 20);
  const dice = r.segs[0];
  assert.ok(dice.k === "dice");
  assert.deepEqual(dice.rolls, [{ v: 4, drop: true }, { v: 17 }]);
});

test("desvantagem e 4d6dl1", () => {
  assert.equal(roll("2d20kl1", seq(4, 17)).total, 4);
  assert.equal(roll("4d6dl1", seq(1, 6, 3, 4)).total, 13);
  assert.equal(roll("4d6k3", seq(1, 6, 3, 4)).total, 13);
});

test("dado explosivo e rerrolagem", () => {
  assert.equal(roll("1d6!", seq(6, 6, 2)).total, 14);
  // 2d6r2: 1 é rerrolado (vira 5), 4 fica
  assert.equal(roll("2d6r2", seq(1, 5, 4)).total, 9);
});

test("precedência, parênteses, negativos e funções", () => {
  assert.equal(roll("2 + 3 * 4", seq(1)).total, 14);
  assert.equal(roll("(2 + 3) * 4", seq(1)).total, 20);
  assert.equal(roll("-1d4 + 10", seq(3)).total, 7);
  assert.equal(roll("max(1d6, 4)", seq(2)).total, 4);
  assert.equal(roll("floor(7 / 2)", seq(1)).total, 3);
});

test("d% e dados fudge", () => {
  assert.equal(roll("d%", seq(42)).total, 42);
  assert.equal(roll("4dF", seq(1, 2, 3, 3)).total, 1); // -1 0 1 1
});

test("erros de sintaxe e limites", () => {
  assert.throws(() => roll("", seq(1)), DiceError);
  assert.throws(() => roll("1d20+", seq(1)), DiceError);
  assert.throws(() => roll("foo(2)", seq(1)), DiceError);
  assert.throws(() => roll("1000d6", seq(1)), DiceError);
  assert.throws(() => roll("1d20; rm", seq(1)), DiceError);
});

test("fórmulas de ficha", () => {
  const attrs: Record<string, number> = { str: 15, pb: 2 };
  const ref = (n: string) => attrs[n] ?? 0;
  assert.equal(evaluate("floor((@{str} - 10) / 2)", ref), 2);
  assert.throws(() => evaluate("1d20", ref), DiceError);
  assert.equal(substituteRefs("1d20 + @{str_mod} + @{pb}", (n) => (n === "pb" ? 2 : -1)), "1d20 + (-1) + 2");
});

test("Call of Cthulhu: níveis de sucesso", () => {
  // unidades primeiro, depois dezenas (valor do rng - 1)
  assert.equal(rollCoc(50, 0, seq(2, 1)).coc!.level, "critical");   // 01
  assert.equal(rollCoc(50, 0, seq(1, 1)).total, 100);               // 00 + 0 = 100
  assert.equal(rollCoc(50, 0, seq(1, 1)).coc!.level, "fumble");
  assert.equal(rollCoc(40, 0, seq(7, 10)).coc!.level, "fumble");    // 96 com perícia < 50
  assert.equal(rollCoc(60, 0, seq(1, 2)).coc!.level, "extreme");    // 10 ≤ 12
  assert.equal(rollCoc(60, 0, seq(1, 4)).coc!.level, "hard");       // 30 ≤ 30
  assert.equal(rollCoc(60, 0, seq(1, 7)).coc!.level, "regular");    // 60 ≤ 60
  assert.equal(rollCoc(60, 0, seq(2, 7)).coc!.level, "failure");    // 61
});

test("Call of Cthulhu: bônus pega a menor dezena, penalidade a maior", () => {
  const bonus = rollCoc(50, 1, seq(5, 8, 2)); // unidades 4, dezenas 70 e 10
  assert.equal(bonus.total, 14);
  const pen = rollCoc(50, -1, seq(5, 8, 2));
  assert.equal(pen.total, 74);
});
