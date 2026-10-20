import { describe, expect, it } from "bun:test";
import { err, ok } from "@gizito/core";
import { toAiCallRecord } from "#src/pipeline/ai-call.ts";

const callShape = { model: "claude-haiku-5-5", promptVersion: "extract-v1", durationMs: 1200 };

describe("toAiCallRecord (spec F1-06, RF-06)", () => {
  it("chamada com sucesso vira registro ok com tokens e custo", () => {
    const record = toAiCallRecord(
      "extract",
      ok({
        ...callShape,
        output: {},
        usage: { inputTokens: 3000, outputTokens: 400, costCents: 0.05 },
      }),
    );
    expect(record).toEqual({
      stage: "extract",
      model: "claude-haiku-5-5",
      promptVersion: "extract-v1",
      inputTokenCount: 3000,
      outputTokenCount: 400,
      costCents: 0.05,
      durationMs: 1200,
      outcomeCode: "ok",
    });
  });

  it("falha sem usage vira registro com o código e zero de tokens e custo", () => {
    const record = toAiCallRecord(
      "extract",
      err({ ...callShape, code: "ai_timeout", usage: null }),
    );
    expect(record).toMatchObject({
      inputTokenCount: 0,
      outputTokenCount: 0,
      costCents: 0,
      outcomeCode: "ai_timeout",
    });
  });
});
