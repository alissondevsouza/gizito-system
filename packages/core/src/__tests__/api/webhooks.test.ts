import { describe, expect, it } from "bun:test";
import { webhookAckOutcomeList, webhookAckSchema } from "#src/api/webhooks.ts";
import { outcomeCodeSchema } from "#src/common.ts";

describe("resposta do webhook (spec F2-04, RF-08)", () => {
  it("aceita só os quatro desfechos, em código estável", () => {
    expect(webhookAckOutcomeList).toEqual(["queued", "duplicate", "ignored", "unknown_charge"]);
    for (const outcome of webhookAckOutcomeList) {
      expect(outcomeCodeSchema.safeParse(outcome).success).toBe(true);
      expect(webhookAckSchema.safeParse({ outcome }).success).toBe(true);
    }
    expect(webhookAckSchema.safeParse({ outcome: "paid" }).success).toBe(false);
    expect(webhookAckSchema.safeParse({}).success).toBe(false);
  });
});
