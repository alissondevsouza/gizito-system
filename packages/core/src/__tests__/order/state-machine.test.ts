import { describe, expect, it } from "bun:test";
import { orderStatusList } from "#src/enums.ts";
import {
  allowedEventList,
  confirmedOrderStatusList,
  InvalidTransitionError,
  isConfirmedOrderStatus,
  isPostPaymentOrderStatus,
  isTerminalOrderStatus,
  isWhatsappLinkableOrderStatus,
  type OrderTransition,
  orderEventList,
  orderTransitionList,
  postPaymentOrderStatusList,
  terminalOrderStatusList,
  transitionOrder,
} from "#src/order/state-machine.ts";

const expectedTransitionList: readonly OrderTransition[] = [
  { from: "draft", event: "start_analysis", to: "analyzing" },
  { from: "analyzing", event: "analysis_succeeded", to: "preview_ready" },
  { from: "analyzing", event: "analysis_failed", to: "draft" },
  { from: "preview_ready", event: "confirm", to: "awaiting_payment" },
  { from: "preview_ready", event: "photos_changed", to: "draft" },
  { from: "awaiting_payment", event: "payment_confirmed", to: "paid" },
  { from: "paid", event: "generation_started", to: "processing" },
  { from: "paid", event: "generation_failed", to: "failed" },
  { from: "processing", event: "kit_published", to: "ready" },
  { from: "processing", event: "generation_failed", to: "failed" },
  { from: "failed", event: "reprocess", to: "paid" },
  { from: "paid", event: "refund", to: "refunded" },
  { from: "processing", event: "refund", to: "refunded" },
  { from: "ready", event: "refund", to: "refunded" },
  { from: "failed", event: "refund", to: "refunded" },
];

const transitionKey = (t: OrderTransition) => `${t.from}:${t.event}`;

describe("máquina de estados do pedido (PRD §5)", () => {
  it("a tabela de transições é exatamente a jornada do PRD", () => {
    expect([...orderTransitionList].map(transitionKey).sort()).toEqual(
      expectedTransitionList.map(transitionKey).sort(),
    );
    for (const expected of expectedTransitionList) {
      expect(orderTransitionList).toContainEqual(expected);
    }
  });

  describe("toda transição válida devolve o novo estado", () => {
    for (const { from, event, to } of expectedTransitionList) {
      it(`${from} + ${event} → ${to}`, () => {
        expect(transitionOrder(from, event)).toEqual({ ok: true, value: to });
      });
    }
  });

  describe("toda combinação fora da tabela devolve InvalidTransitionError sem lançar", () => {
    const validKeySet = new Set(expectedTransitionList.map(transitionKey));
    for (const from of orderStatusList) {
      for (const event of orderEventList) {
        if (validKeySet.has(`${from}:${event}`)) continue;
        it(`${from} + ${event} é inválida`, () => {
          const result = transitionOrder(from, event);
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.error).toBeInstanceOf(InvalidTransitionError);
          expect(result.error.code).toBe("invalid_transition");
          expect(result.error.from).toBe(from);
          expect(result.error.event).toBe(event);
          expect(result.error.message).toContain(from);
          expect(result.error.message).toContain(event);
        });
      }
    }
  });

  it("pagamento só entra por payment_confirmed a partir de awaiting_payment", () => {
    for (const from of orderStatusList) {
      if (from === "awaiting_payment") continue;
      expect(transitionOrder(from, "payment_confirmed").ok).toBe(false);
    }
  });

  it("refunded é o único estado terminal", () => {
    expect(terminalOrderStatusList).toEqual(["refunded"]);
    expect(isTerminalOrderStatus("refunded")).toBe(true);
    expect(isTerminalOrderStatus("ready")).toBe(false);
    expect(allowedEventList("refunded")).toEqual([]);
  });

  it("allowedEventList lista os eventos aceitos por estado", () => {
    expect(allowedEventList("processing")).toEqual([
      "kit_published",
      "generation_failed",
      "refund",
    ]);
    expect(allowedEventList("draft")).toEqual(["start_analysis"]);
    expect(allowedEventList("preview_ready")).toEqual(["confirm", "photos_changed"]);
    expect(allowedEventList("paid")).toEqual(["generation_started", "generation_failed", "refund"]);
  });

  it("trocar foto na prévia volta a draft e a análise recomeça por start_analysis", () => {
    const changed = transitionOrder("preview_ready", "photos_changed");
    expect(changed).toEqual({ ok: true, value: "draft" });
    expect(transitionOrder("draft", "start_analysis")).toEqual({ ok: true, value: "analyzing" });
    expect(transitionOrder("awaiting_payment", "photos_changed").ok).toBe(false);
  });

  it("geração que falha antes de começar leva o pedido pago a failed, de onde sai reprocess", () => {
    expect(transitionOrder("paid", "generation_failed")).toEqual({ ok: true, value: "failed" });
    expect(transitionOrder("failed", "reprocess")).toEqual({ ok: true, value: "paid" });
  });

  it("estados confirmados são os alcançáveis a partir de awaiting_payment", () => {
    expect(confirmedOrderStatusList).toEqual([
      "awaiting_payment",
      "paid",
      "processing",
      "ready",
      "failed",
      "refunded",
    ]);
    expect(isConfirmedOrderStatus("preview_ready")).toBe(false);
    expect(isConfirmedOrderStatus("draft")).toBe(false);
  });

  it("estados pós-pagamento são os alcançáveis a partir de paid, nunca os anteriores", () => {
    expect(postPaymentOrderStatusList).toEqual([
      "paid",
      "processing",
      "ready",
      "failed",
      "refunded",
    ]);
    expect(isPostPaymentOrderStatus("awaiting_payment")).toBe(false);
    expect(isPostPaymentOrderStatus("draft")).toBe(false);
    expect(isPostPaymentOrderStatus("refunded")).toBe(true);
  });

  it("vínculo de WhatsApp só em paid, processing e ready (PRD §9.2)", () => {
    expect(orderStatusList.filter(isWhatsappLinkableOrderStatus)).toEqual([
      "paid",
      "processing",
      "ready",
    ]);
  });
});
