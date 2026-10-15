import { expect, it } from "bun:test";
import * as core from "#src/index.ts";

it("o entrypoint exporta constantes, máquina de estados, schemas e payloads de job", () => {
  expect(core.KIT_PRICE_CENTS).toBe(2990);
  expect(typeof core.transitionOrder).toBe("function");
  expect(core.orderSchema.safeParse(null).success).toBe(false);
  expect(core.jobPayloadSchema.safeParse({ name: "charge.reconcile" }).success).toBe(true);
  expect(core.orderStatusList).toHaveLength(9);
});
