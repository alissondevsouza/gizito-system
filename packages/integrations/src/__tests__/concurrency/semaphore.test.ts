import { describe, expect, it } from "bun:test";
import { createSemaphore } from "#src/concurrency/semaphore.ts";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createSemaphore (spec F1-08, RF-05)", () => {
  it("não deixa mais tarefas ativas que o limite", async () => {
    const semaphore = createSemaphore(2);
    let activeCount = 0;
    let maxActiveCount = 0;
    const gateList = Array.from({ length: 5 }, deferred);
    const runList = gateList.map((gate) =>
      semaphore.run(async () => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await gate.promise;
        activeCount -= 1;
      }),
    );
    for (const gate of gateList) {
      await Bun.sleep(0);
      gate.resolve();
    }
    await Promise.all(runList);
    expect(maxActiveCount).toBe(2);
  });

  it("libera a vaga quando a tarefa falha", async () => {
    const semaphore = createSemaphore(1);
    await expect(semaphore.run(() => Promise.reject(new Error("falhou")))).rejects.toThrow(
      "falhou",
    );
    expect(await semaphore.run(() => Promise.resolve("seguiu"))).toBe("seguiu");
  });

  it("recusa limite que não é inteiro positivo", () => {
    expect(() => createSemaphore(0)).toThrow(RangeError);
    expect(() => createSemaphore(1.5)).toThrow(RangeError);
  });
});
