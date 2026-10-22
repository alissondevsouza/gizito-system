import { describe, expect, it } from "bun:test";
import { CHARGE_ID, ORDER_ID, WEBHOOK_EVENT_ID } from "#src/__tests__/__fixtures__/entities.ts";
import { jobNameList } from "#src/enums.ts";
import { jobPayloadSchema, jobPayloadSchemaByName } from "#src/jobs/schemas.ts";

describe("jobPayloadSchema", () => {
  const validPayloadList = [
    { name: "order.analyze", orderId: ORDER_ID },
    { name: "order.generate", orderId: ORDER_ID },
    { name: "order.notify", orderId: ORDER_ID, kind: "kit_ready" },
    { name: "charge.reconcile" },
    { name: "retention.purge" },
    {
      name: "whatsapp.inbound",
      webhookEventId: WEBHOOK_EVENT_ID,
      phone: "+5511999998888",
      text: "GZ-7K3M9Q",
    },
  ] as const;

  it("há um payload válido para cada job de jobNameList", () => {
    expect(validPayloadList.map((p) => p.name).sort()).toEqual([...jobNameList].sort());
    for (const payload of validPayloadList) {
      expect(jobPayloadSchema.safeParse(payload)).toMatchObject({ success: true, data: payload });
      expect(jobPayloadSchemaByName[payload.name].safeParse(payload).success).toBe(true);
    }
  });

  it("rejeita nome desconhecido e campo obrigatório ausente", () => {
    expect(jobPayloadSchema.safeParse({ name: "order.render", orderId: ORDER_ID }).success).toBe(
      false,
    );
    expect(jobPayloadSchema.safeParse({ name: "order.analyze" }).success).toBe(false);
    expect(jobPayloadSchema.safeParse({ name: "order.notify", orderId: ORDER_ID }).success).toBe(
      false,
    );
    expect(
      jobPayloadSchema.safeParse({ name: "order.notify", orderId: ORDER_ID, kind: "sms" }).success,
    ).toBe(false);
  });

  it("mensagem de WhatsApp é dado limitado: 1000 caracteres no máximo e telefone E.164", () => {
    const base = {
      name: "whatsapp.inbound",
      webhookEventId: WEBHOOK_EVENT_ID,
      phone: "+5511999998888",
    };
    expect(jobPayloadSchema.safeParse({ ...base, text: "a".repeat(1000) }).success).toBe(true);
    expect(jobPayloadSchema.safeParse({ ...base, text: "a".repeat(1001) }).success).toBe(false);
    expect(jobPayloadSchema.safeParse({ ...base, text: "" }).success).toBe(false);
    expect(jobPayloadSchema.safeParse({ ...base, phone: "11999998888", text: "oi" }).success).toBe(
      false,
    );
  });

  it("charge.reconcile aceita orderId opcional (webhook direcionado) e rejeita orderId inválido", () => {
    expect(
      jobPayloadSchema.safeParse({ name: "charge.reconcile", orderId: ORDER_ID }),
    ).toMatchObject({
      success: true,
      data: { name: "charge.reconcile", orderId: ORDER_ID },
    });
    expect(jobPayloadSchema.safeParse({ name: "charge.reconcile", orderId: "1" }).success).toBe(
      false,
    );
  });

  it("charge.reconcile do webhook leva webhookEventId, sempre junto com orderId", () => {
    expect(
      jobPayloadSchema.safeParse({
        name: "charge.reconcile",
        orderId: ORDER_ID,
        webhookEventId: WEBHOOK_EVENT_ID,
      }),
    ).toMatchObject({
      success: true,
      data: { name: "charge.reconcile", orderId: ORDER_ID, webhookEventId: WEBHOOK_EVENT_ID },
    });
    const withoutOrder = jobPayloadSchema.safeParse({
      name: "charge.reconcile",
      webhookEventId: WEBHOOK_EVENT_ID,
    });
    expect(withoutOrder.success).toBe(false);
    expect(withoutOrder.error?.issues[0]?.path).toEqual(["webhookEventId"]);
  });

  it("charge.reconcile do webhook leva chargeId, sempre junto com orderId (spec F2-04, RF-01)", () => {
    const payload = {
      name: "charge.reconcile",
      orderId: ORDER_ID,
      chargeId: CHARGE_ID,
      webhookEventId: WEBHOOK_EVENT_ID,
    };
    expect(jobPayloadSchema.safeParse(payload)).toMatchObject({ success: true, data: payload });
    const withoutOrder = jobPayloadSchema.safeParse({
      name: "charge.reconcile",
      chargeId: CHARGE_ID,
      webhookEventId: WEBHOOK_EVENT_ID,
    });
    expect(withoutOrder.success).toBe(false);
    expect(withoutOrder.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      "chargeId",
      "webhookEventId",
    ]);
    expect(jobPayloadSchema.safeParse({ name: "charge.reconcile", chargeId: "1" }).success).toBe(
      false,
    );
  });

  it("campo extra é descartado, nunca propagado", () => {
    const parsed = jobPayloadSchema.parse({
      name: "order.generate",
      orderId: ORDER_ID,
      prompt: "x",
    });
    expect(parsed).toEqual({ name: "order.generate", orderId: ORDER_ID });
  });
});
