import { describe, expect, it } from "bun:test";
import { MAX_NOTE_LENGTH, MAX_OTHER_TOPIC_LENGTH } from "#src/constants.ts";
import { checkConfirmedTopics, confirmOrderInputSchema } from "#src/order/confirm.ts";

const validInput = {
  topicIdList: ["ma5-fractions"],
  email: "Mae@Example.com",
  acceptedTerms: true,
};

describe("confirmOrderInputSchema", () => {
  it("aceita de 1 a 3 assuntos, contando o outro, e normaliza o e-mail", () => {
    expect(confirmOrderInputSchema.parse(validInput)).toEqual({
      topicIdList: ["ma5-fractions"],
      email: "mae@example.com",
      acceptedTerms: true,
    });
    expect(
      confirmOrderInputSchema.safeParse({
        ...validInput,
        topicIdList: ["ma5-fractions", "ma5-decimal-numbers"],
        otherTopicText: "porcentagem no mercado",
      }).success,
    ).toBe(true);
    expect(
      confirmOrderInputSchema.parse({
        email: "mae@example.com",
        acceptedTerms: true,
        otherTopicText: "porcentagem",
      }).topicIdList,
    ).toEqual([]);
  });

  it("recusa nenhum assunto, quatro assuntos e três ids com outro", () => {
    expect(confirmOrderInputSchema.safeParse({ ...validInput, topicIdList: [] }).success).toBe(
      false,
    );
    expect(
      confirmOrderInputSchema.safeParse({
        ...validInput,
        topicIdList: ["ma5-a", "ma5-b", "ma5-c", "ma5-d"],
      }).success,
    ).toBe(false);
    expect(
      confirmOrderInputSchema.safeParse({
        ...validInput,
        topicIdList: ["ma5-a", "ma5-b", "ma5-c"],
        otherTopicText: "porcentagem",
      }).success,
    ).toBe(false);
    expect(
      confirmOrderInputSchema.safeParse({ ...validInput, topicIdList: ["ma5-a", "ma5-a"] }).success,
    ).toBe(false);
  });

  it("recusa aceite falso ou ausente e e-mail inválido", () => {
    expect(confirmOrderInputSchema.safeParse({ ...validInput, acceptedTerms: false }).success).toBe(
      false,
    );
    const { acceptedTerms: _, ...withoutTerms } = validInput;
    expect(confirmOrderInputSchema.safeParse(withoutTerms).success).toBe(false);
    expect(confirmOrderInputSchema.safeParse({ ...validInput, email: "mae@" }).success).toBe(false);
  });

  it("saneia observação e outro; vazio depois do saneamento vira ausente", () => {
    const parsed = confirmOrderInputSchema.parse({
      ...validInput,
      noteText: "mais\u0000dificuldade‮ com frações",
      otherTopicText: " porcentagem​ ",
      perceivedDifficulty: "basic",
    });
    expect(parsed.noteText).toBe("mais dificuldade com frações");
    expect(parsed.otherTopicText).toBe("porcentagem");
    expect(parsed.perceivedDifficulty).toBe("basic");
    const blank = confirmOrderInputSchema.parse({
      ...validInput,
      noteText: "\u0000 \n",
      otherTopicText: "",
    });
    expect(blank.noteText).toBeUndefined();
    expect(blank.otherTopicText).toBeUndefined();
  });

  it("recusa observação e outro acima do limite, antes e depois do saneamento", () => {
    expect(
      confirmOrderInputSchema.safeParse({
        ...validInput,
        noteText: "a".repeat(MAX_NOTE_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      confirmOrderInputSchema.safeParse({
        ...validInput,
        otherTopicText: "a".repeat(MAX_OTHER_TOPIC_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      confirmOrderInputSchema.safeParse({ ...validInput, noteText: " ".repeat(5_000) }).success,
    ).toBe(false);
    expect(confirmOrderInputSchema.safeParse({ ...validInput, otherTopicText: "a" }).success).toBe(
      false,
    );
  });
});

describe("checkConfirmedTopics", () => {
  it("aceita ids selecionáveis no ano e na disciplina e outro atendido", () => {
    expect(
      checkConfirmedTopics(
        { topicIdList: ["ma5-fractions", "ma5-decimal-numbers"], otherTopicText: "porcentagem" },
        "5",
        "math",
      ),
    ).toEqual({ ok: true, value: undefined });
  });

  it("recusa id de outro ano, de outra disciplina e inexistente", () => {
    for (const topicId of ["ma6-numeral-systems", "lp5-explicit-information", "ma5-inexistente"]) {
      expect(
        checkConfirmedTopics({ topicIdList: [topicId], otherTopicText: null }, "5", "math"),
      ).toEqual({ ok: false, error: { code: "invalid_topic", topicId } });
    }
  });

  it("recusa outro que casa com assunto ainda não atendido da disciplina", () => {
    expect(
      checkConfirmedTopics(
        { topicIdList: [], otherTopicText: "Ampliação na MALHA quadriculada" },
        "5",
        "math",
      ),
    ).toEqual({
      ok: false,
      error: { code: "unsupported_topic", unsupportedTopicIdList: ["ma-grid-scaling"] },
    });
    expect(
      checkConfirmedTopics(
        { topicIdList: [], otherTopicText: "Ampliação na MALHA quadriculada" },
        "5",
        "portuguese",
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(
      checkConfirmedTopics(
        { topicIdList: [], otherTopicText: "tirinhas da Mônica" },
        "5",
        "portuguese",
      ).ok,
    ).toBe(false);
  });
});
