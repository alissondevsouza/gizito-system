import { afterAll, describe, expect, it } from "bun:test";
import { createDatabase } from "@gizito/db";
import { createMathjsEvaluator, isKatexParsable } from "@gizito/integrations";
import {
  createFakeAiProvider,
  createFakeObjectStorage,
  createFakePaymentGateway,
  createMemoryLogger,
} from "@gizito/integrations/fakes";
import { createCountingRenderer } from "#src/__tests__/pipeline/__fixtures__/pipeline.ts";
import { buildJobHandlerMap, handledJobNameList } from "#src/jobs/index.ts";

const database = createDatabase({
  databaseUrl: "postgres://unit:unit@127.0.0.1:1/unit",
  maxConnections: 1,
});

afterAll(async () => {
  await database.close({ timeoutSeconds: 1 });
});

describe("buildJobHandlerMap (spec F2-05, RF-09)", () => {
  it("monta uma definição por job tratado, cada uma com handle e onExhausted", () => {
    const handlerMap = buildJobHandlerMap({
      db: database.db,
      aiProvider: createFakeAiProvider(),
      storage: createFakeObjectStorage(),
      paymentGateway: createFakePaymentGateway(),
      mathEvaluator: createMathjsEvaluator(),
      isMathMarkupParsable: isKatexParsable,
      pdfRenderer: createCountingRenderer().pdfRenderer,
      extractModel: "claude-haiku-5-5",
      logger: createMemoryLogger().logger,
      now: () => new Date(),
    });
    expect(Object.keys(handlerMap).sort()).toEqual([...handledJobNameList].sort());
    expect(handledJobNameList).toContain("order.generate");
    for (const name of handledJobNameList) {
      expect(typeof handlerMap[name].handle).toBe("function");
      expect(typeof handlerMap[name].onExhausted).toBe("function");
    }
  });
});
