import type { ExpectedAnswer } from "@gizito/core";
import { createMathjsEvaluator } from "/home/alisson/workspace/current-projects/gizito-system/packages/integrations/src/math/mathjs-evaluator.ts";

const ev = createMathjsEvaluator();
const n = (value: number, unit: string | null = null, tolerance = 0): ExpectedAnswer => ({
  kind: "number",
  value,
  unit,
  tolerance,
});
const f = (numerator: number, denominator: number, unit: string | null = null): ExpectedAnswer => ({
  kind: "fraction",
  numerator,
  denominator,
  unit,
});
const e = (expression: string): ExpectedAnswer => ({ kind: "expression", expression });
const s = (...valueList: string[]): ExpectedAnswer => ({ kind: "set", valueList });
const t = (value: string, ...acceptedList: string[]): ExpectedAnswer => ({
  kind: "text",
  value,
  acceptedList,
});
const list: ExpectedAnswer[] = [
  n(0),
  n(-0),
  n(0.5),
  n(0.5, null, 0.1),
  n(50, "cm"),
  n(0.5, "m", 0.01),
  n(500, "mm", 1),
  n(5, "°C"),
  n(5, "graus celsius", 1),
  n(5, "°"),
  n(1e308, "km"),
  n(1e308, "m"),
  n(12.5, "R$"),
  n(12.5, "r$ "),
  n(25, "%"),
  n(1, "h"),
  n(60, "min"),
  n(3600, "s"),
  n(1, "dia"),
  n(24, "h"),
  n(1, "km/h"),
  n(1 / 3.6, "m/s"),
  n(1, "L"),
  n(1000, "mL"),
  n(1000, "cm³"),
  n(1, "dm^3"),
  n(1, "ha"),
  n(10000, "m²"),
  f(1, 2),
  f(-1, 2),
  f(1, 2, "m"),
  f(50, 1, "cm"),
  f(1, 3),
  f(1, 3, "R$"),
  e("1/2"),
  e("0.5 m"),
  e("50 cm"),
  e("2 m + 30 cm"),
  e("x + 1"),
  e("1 + x"),
  e("sqrt(-1 - x^2)"),
  e("sqrt(x)"),
  e("2x +"),
  e("1 kg + 2 m"),
  e("1/0"),
  e("x/0"),
  e("2*t"),
  e("t+t"),
  e("x*h"),
  e("3 m"),
  e("cm"),
  e("2 A"),
  e("2 inch"),
  e("5 degC"),
  e("i^2"),
  e("e^2"),
  e("Infinity * x"),
  s("1", "2"),
  s("2", "1"),
  s("1/2"),
  s("0,5"),
  s("a", "B"),
  s("b", "A"),
  t("metade"),
  t("Metade", "1/2"),
  t("1/2"),
];
let fail = 0;
for (const a of list) {
  if (!ev.equals(a, a)) {
    console.log("NOT REFLEXIVE", JSON.stringify(a));
    fail++;
  }
  for (const b of list) {
    const ab = ev.equals(a, b),
      ba = ev.equals(b, a);
    if (ab !== ba) {
      console.log("ASYM", JSON.stringify(a), JSON.stringify(b), ab, ba);
      fail++;
    }
  }
}
console.log("fails", fail);
const pairs: [ExpectedAnswer, ExpectedAnswer][] = [
  [n(1 / 3.6, "m/s"), n(1, "km/h")],
  [n(1, "L"), n(1000, "cm³")],
  [n(1, "ha"), n(10000, "m²")],
  [n(24, "h"), n(1, "dia")],
  [n(5, "°C"), n(5, "°")],
  [e("2*t"), e("t+t")],
  [e("2*t"), n(2, "t")],
  [e("3 m"), n(300, "cm")],
  [e("x/0"), e("x/0")],
  [n(40, "m2"), e("8 m * 5 m")],
  [n(70, "º"), e("180 deg - 110 deg")],
  [n(70, "°"), e("180 deg - 110 deg")],
  [e("b*h/2"), e("h*b/2")],
  [e("2*t + 3"), e("3 + 2*t")],
  [e("2*x + 3"), e("3 + 2*x")],
  [n(0.1, "m", 0), n(10.0000001, "cm")],
  [n(1e-12), n(0)],
  [n(1e-10), n(-1e-10)],
];
for (const [a, b] of pairs) console.log(JSON.stringify(a), "~", JSON.stringify(b), ev.equals(a, b));
