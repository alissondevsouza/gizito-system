import { describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { buildOrder, buildOrderPhoto, FIXED_NOW } from "#src/__tests__/__fixtures__/entities.ts";
import { PUBLIC_TOKEN_BYTES } from "#src/constants.ts";
import {
  countOrderTopics,
  emailSchema,
  noteTextSchema,
  orderPhotoSchema,
  orderSchema,
  otherTopicTextSchema,
  phoneSchema,
  publicTokenSchema,
  shortCodeSchema,
  topicIdListSchema,
  topicIdSchema,
} from "#src/order/schemas.ts";

describe("publicTokenSchema", () => {
  it("aceita 43 caracteres base64url canônicos de 32 bytes (último caractere múltiplo de 4)", () => {
    for (const last of "AEIMQUYcgkosw048") {
      expect(
        publicTokenSchema.safeParse(`Ab3_-cdEfGhIjKlMnOpQrStUvWxYz0123456789abc${last}`).success,
      ).toBe(true);
    }
  });
  it('aceita tokens gerados por randomBytes(32).toString("base64url")', () => {
    for (let count = 0; count < 256; count++) {
      const token = randomBytes(PUBLIC_TOKEN_BYTES).toString("base64url");
      expect(publicTokenSchema.safeParse(token).success).toBe(true);
    }
  });
  it("rejeita token de 43 caracteres com último caractere não canônico", () => {
    for (const last of "BCDaxyz1239_-") {
      expect(
        publicTokenSchema.safeParse(`Ab3_-cdEfGhIjKlMnOpQrStUvWxYz0123456789abc${last}`).success,
      ).toBe(false);
    }
  });
  it("rejeita token curto, com padding ou com caractere fora do base64url", () => {
    expect(publicTokenSchema.safeParse("abc").success).toBe(false);
    expect(publicTokenSchema.safeParse(`${"a".repeat(42)}=`).success).toBe(false);
    expect(publicTokenSchema.safeParse(`${"a".repeat(42)}+`).success).toBe(false);
  });
});

describe("shortCodeSchema", () => {
  it("aceita GZ- mais seis caracteres do alfabeto sem ambiguidade", () => {
    expect(shortCodeSchema.safeParse("GZ-7K3M9Q").success).toBe(true);
  });
  it("rejeita 0, O, 1, I, minúsculas, prefixo errado e tamanho errado", () => {
    for (const code of [
      "GZ-0K3M9Q",
      "GZ-OK3M9Q",
      "GZ-1K3M9Q",
      "GZ-IK3M9Q",
      "GZ-7k3m9q",
      "GX-7K3M9Q",
      "GZ-7K3M9",
      "7K3M9Q",
    ]) {
      expect(shortCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});

describe("campos de texto do responsável", () => {
  it("e-mail válido e inválido", () => {
    expect(emailSchema.safeParse("mae@example.com").success).toBe(true);
    expect(emailSchema.safeParse("mae@").success).toBe(false);
    expect(emailSchema.safeParse(`${"a".repeat(250)}@b.co`).success).toBe(false);
  });
  it("e-mail chega aparado e em minúsculas, como o autocompletar do celular deixa", () => {
    expect(emailSchema.parse("  Mae.Do.Aluno@Example.COM ")).toBe("mae.do.aluno@example.com");
    expect(emailSchema.safeParse("   ").success).toBe(false);
  });
  it("observação aceita até 300 caracteres e recusa 301", () => {
    expect(noteTextSchema.safeParse("a".repeat(300)).success).toBe(true);
    expect(noteTextSchema.safeParse("a".repeat(301)).success).toBe(false);
    expect(noteTextSchema.parse("  frações  ")).toBe("frações");
  });
  it("assunto 'outro' exige ao menos 2 caracteres e no máximo 80", () => {
    expect(otherTopicTextSchema.safeParse("x").success).toBe(false);
    expect(otherTopicTextSchema.safeParse("Sistema solar").success).toBe(true);
    expect(otherTopicTextSchema.safeParse("a".repeat(81)).success).toBe(false);
  });
  it("telefone em E.164 com +", () => {
    expect(phoneSchema.safeParse("+5511999998888").success).toBe(true);
    expect(phoneSchema.safeParse("11999998888").success).toBe(false);
    expect(phoneSchema.safeParse("+0511999998888").success).toBe(false);
  });
});

describe("topicIdSchema", () => {
  it("aceita ids estáveis em kebab/snake minúsculo e no máximo 3 por pedido", () => {
    expect(topicIdSchema.safeParse("mat-5-fracoes-equivalentes").success).toBe(true);
    expect(topicIdSchema.safeParse("Fracoes").success).toBe(false);
    expect(topicIdSchema.safeParse("mat--5").success).toBe(false);
    expect(topicIdListSchema.safeParse(["a", "b", "c"]).success).toBe(true);
    expect(topicIdListSchema.safeParse(["a", "b", "c", "d"]).success).toBe(false);
  });
  it("recusa o mesmo assunto repetido", () => {
    expect(topicIdListSchema.safeParse(["fracoes", "fracoes"]).success).toBe(false);
  });
});

describe("orderSchema", () => {
  it("aceita o pedido mínimo em draft", () => {
    expect(orderSchema.safeParse(buildOrder()).success).toBe(true);
  });
  it("aceita pedido pronto com e-mail, assuntos e WhatsApp vinculado", () => {
    const order = buildOrder({
      status: "ready",
      email: "mae@example.com",
      topicIdList: ["mat-5-fracoes"],
      noteText: "mais dificuldade com frações",
      perceivedDifficulty: "basic",
      whatsappPhone: "+5511999998888",
      whatsappConsentDatetime: FIXED_NOW,
      paidDatetime: FIXED_NOW,
      readyDatetime: FIXED_NOW,
    });
    expect(orderSchema.safeParse(order).success).toBe(true);
  });
  it("rejeita telefone sem data de consentimento e vice-versa", () => {
    expect(orderSchema.safeParse(buildOrder({ whatsappPhone: "+5511999998888" })).success).toBe(
      false,
    );
    expect(orderSchema.safeParse(buildOrder({ whatsappConsentDatetime: FIXED_NOW })).success).toBe(
      false,
    );
  });
  it("rejeita id que não é uuid, status desconhecido e quatro assuntos", () => {
    expect(orderSchema.safeParse(buildOrder({ orderId: "1" })).success).toBe(false);
    expect(orderSchema.safeParse({ ...buildOrder(), status: "pronto" }).success).toBe(false);
    expect(orderSchema.safeParse(buildOrder({ topicIdList: ["a", "b", "c", "d"] })).success).toBe(
      false,
    );
  });
  it("o assunto 'outro' conta no teto de 3 (PRD §7.1)", () => {
    const withOther = (topicIdList: string[]) =>
      orderSchema.safeParse(buildOrder({ topicIdList, otherTopicText: "Sistema solar" })).success;
    expect(withOther(["a", "b"])).toBe(true);
    expect(withOther(["a", "b", "c"])).toBe(false);
    expect(countOrderTopics(["a", "b"], "Sistema solar")).toBe(3);
    expect(countOrderTopics([], null)).toBe(0);
  });
  it("pedido confirmado cobre ao menos um assunto; rascunho pode não ter nenhum", () => {
    expect(orderSchema.safeParse(buildOrder({ status: "draft" })).success).toBe(true);
    expect(orderSchema.safeParse(buildOrder({ status: "preview_ready" })).success).toBe(true);
    expect(
      orderSchema.safeParse(buildOrder({ status: "paid", paidDatetime: FIXED_NOW })).success,
    ).toBe(false);
    expect(
      orderSchema.safeParse(
        buildOrder({ status: "awaiting_payment", otherTopicText: "Sistema solar" }),
      ).success,
    ).toBe(true);
  });
  it("rejeita failReasonCode fora do formato de código estável", () => {
    expect(
      orderSchema.safeParse(buildOrder({ failReasonCode: "generation_blocked" })).success,
    ).toBe(true);
    expect(
      orderSchema.safeParse(buildOrder({ failReasonCode: "Generation Blocked" })).success,
    ).toBe(false);
  });
});

describe("orderPhotoSchema", () => {
  it("aceita foto válida e rejeita hash, dimensões e legibilidade fora do intervalo", () => {
    expect(orderPhotoSchema.safeParse(buildOrderPhoto()).success).toBe(true);
    expect(orderPhotoSchema.safeParse(buildOrderPhoto({ legibilityScore: 0.8 })).success).toBe(
      true,
    );
    expect(orderPhotoSchema.safeParse(buildOrderPhoto({ contentHash: "xyz" })).success).toBe(false);
    expect(orderPhotoSchema.safeParse(buildOrderPhoto({ width: 0 })).success).toBe(false);
    expect(orderPhotoSchema.safeParse(buildOrderPhoto({ legibilityScore: 1.5 })).success).toBe(
      false,
    );
  });
});
