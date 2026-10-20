import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import { z } from "zod";
import { describeAiProviderContract, echoOutput } from "#src/__tests__/ai/contract.ts";
import { createFakeAiProvider } from "#src/fakes/fake-ai-provider.ts";

describeAiProviderContract("fake", {
  createDriver: () => {
    const provider = createFakeAiProvider();
    return {
      provider,
      arrange: (stage, scenario) => {
        if (scenario === "truncated") provider.enqueueFailure(stage, "ai_output_truncated");
        else provider.enqueueOutput(stage, echoOutput);
      },
    };
  },
  testTimeoutMs: 5_000,
});

describe("fake do AiProvider (spec F1-05, RF-06)", () => {
  const request = {
    promptVersion: "plan-v1",
    systemPrompt: "regras",
    userText: "dados",
    outputSchema: z.strictObject({ planId: z.string() }),
  };

  it("guarda os pedidos e usa o modelo da etapa", async () => {
    const provider = createFakeAiProvider({ generateModel: "claude-opus-5-5" });
    provider.enqueueOutput("plan", { planId: "p1" });
    const result = await provider.plan(request);
    expect(result.ok && result.value.model).toBe("claude-opus-5-5");
    expect(provider.requestList.map((record) => record.stage)).toEqual(["plan"]);
  });

  it("calcula usage determinístico pela tabela de preço", async () => {
    const provider = createFakeAiProvider();
    provider.enqueueOutput("plan", { planId: "p1" });
    provider.enqueueOutput("plan", { planId: "p1" });
    const first = await provider.plan(request);
    const second = await provider.plan(request);
    if (!first.ok || !second.ok) throw new Error("fake falhou");
    expect(first.value.usage).toEqual(second.value.usage);
    expect(first.value.usage.inputTokens).toBe(Math.ceil("regrasdados".length / 4));
  });

  it("falha de transporte não tem usage; falha de saída tem", async () => {
    const provider = createFakeAiProvider();
    provider.enqueueFailure("plan", "ai_rate_limited");
    provider.enqueueFailure("plan", "ai_refused");
    const transport = await provider.plan(request);
    const refused = await provider.plan(request);
    expect(transport.ok ? "ok" : transport.error.usage).toBeNull();
    expect(refused.ok ? null : refused.error.usage?.inputTokens).toBeGreaterThan(0);
  });

  it("sem resposta enfileirada é erro do teste", async () => {
    const provider = createFakeAiProvider();
    await expect(provider.review(request)).rejects.toThrow("sem resposta enfileirada");
  });

  it("responde pelo conteúdo da requisição quando a fila está vazia (spec F1-06, RF-07)", async () => {
    const provider = createFakeAiProvider();
    const imageOf = async (red: number) => ({
      mediaType: "image/png" as const,
      data: new Uint8Array(
        await sharp({
          create: { width: 4, height: 4, channels: 3, background: { r: red, g: 0, b: 0 } },
        })
          .png()
          .toBuffer(),
      ),
    });
    const [darkImage, lightImage] = await Promise.all([imageOf(10), imageOf(250)]);
    provider.enqueueOutput("extract", { planId: "fila" });
    provider.respondWith("extract", (received) => ({
      kind: "output",
      output: { planId: received.imageList?.[0]?.data === darkImage.data ? "escura" : "clara" },
    }));
    const queued = await provider.extract({ ...request, imageList: [lightImage] });
    const [dark, light] = await Promise.all([
      provider.extract({ ...request, imageList: [darkImage] }),
      provider.extract({ ...request, imageList: [lightImage] }),
    ]);
    const planIdOf = (result: typeof queued) => (result.ok ? result.value.output.planId : null);
    expect([queued, dark, light].map(planIdOf)).toEqual(["fila", "escura", "clara"]);
  });

  it("modelo sem preço é erro do teste", async () => {
    const provider = createFakeAiProvider({ extractModel: "modelo-desconhecido" });
    provider.enqueueOutput("extract", { planId: "p1" });
    await expect(provider.extract(request)).rejects.toThrow("sem preço");
  });
});
