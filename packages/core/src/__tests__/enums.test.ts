import { describe, expect, it } from "bun:test";
import {
  gradeLabelMap,
  gradeList,
  gradeSchema,
  jobNameList,
  jobStatusList,
  orderStatusList,
  orderStatusSchema,
  subjectLabelMap,
  subjectList,
  supportTicketKindList,
} from "#src/enums.ts";

describe("enums", () => {
  it("estados do pedido são exatamente os nove do CLAUDE.md, na ordem da jornada", () => {
    expect(orderStatusList).toEqual([
      "draft",
      "analyzing",
      "preview_ready",
      "awaiting_payment",
      "paid",
      "processing",
      "ready",
      "failed",
      "refunded",
    ]);
    expect(orderStatusSchema.safeParse("rascunho").success).toBe(false);
  });

  it("jobs são os seis da rule worker.md", () => {
    expect<readonly string[]>([...jobNameList].sort()).toEqual(
      [
        "charge.reconcile",
        "order.analyze",
        "order.generate",
        "order.notify",
        "retention.purge",
        "whatsapp.inbound",
      ].sort(),
    );
  });

  it("job passa por pending, active e termina em completed ou failed", () => {
    expect(jobStatusList).toEqual(["pending", "active", "completed", "failed"]);
  });

  it("tickets de suporte incluem pagamento duplicado (Pix antigo pago depois de novo Pix)", () => {
    expect(supportTicketKindList).toContain("duplicate_payment");
  });

  it("anos e disciplinas do MVP com rótulo pt-BR", () => {
    expect(gradeList).toEqual(["4", "5", "6", "7"]);
    expect(subjectList).toEqual(["math", "portuguese"]);
    expect(gradeLabelMap["4"]).toBe("4º ano");
    expect(subjectLabelMap.portuguese).toBe("Língua Portuguesa");
    expect(gradeSchema.safeParse("8").success).toBe(false);
  });
});
