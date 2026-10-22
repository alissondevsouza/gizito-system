import { describe, expect, it } from "bun:test";
import { ObjectStorageError, photoStorageKey } from "@gizito/core";
import { describeObjectStorageContract } from "#src/__tests__/storage/contract.ts";
import { createFakeObjectStorage } from "#src/fakes/fake-object-storage.ts";

describeObjectStorageContract("fake", {
  createDriver: () => {
    const storage = createFakeObjectStorage();
    return {
      storage,
      readObject: async (key) => storage.objectMap.get(key) ?? null,
    };
  },
  testTimeoutMs: 5_000,
});

describe("createFakeObjectStorage: falhas controláveis", () => {
  const key = () => photoStorageKey(crypto.randomUUID(), crypto.randomUUID());
  const body = new Uint8Array([1, 2]);

  it("failNextPut falha só o próximo put, com o código pedido", async () => {
    const storage = createFakeObjectStorage();
    storage.failNextPut("storage_rejected");
    const failed = storage.putPrivate({ key: key(), body, contentType: "image/jpeg" });
    expect(failed).rejects.toBeInstanceOf(ObjectStorageError);
    expect(failed).rejects.toMatchObject({ code: "storage_rejected" });
    await storage.putPrivate({ key: key(), body, contentType: "image/jpeg" });
    expect(storage.objectMap.size).toBe(1);
  });

  it("failPutAfter deixa passar n puts e falha o seguinte", async () => {
    const storage = createFakeObjectStorage();
    storage.failPutAfter(2);
    await storage.putPrivate({ key: key(), body, contentType: "image/jpeg" });
    await storage.putPrivate({ key: key(), body, contentType: "image/jpeg" });
    expect(
      storage.putPrivate({ key: key(), body, contentType: "image/jpeg" }),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
    expect(storage.objectMap.size).toBe(2);
  });

  it("failNextGet falha só a próxima leitura, com o código pedido", async () => {
    const storage = createFakeObjectStorage();
    const storedKey = key();
    await storage.putPrivate({ key: storedKey, body, contentType: "image/jpeg" });
    storage.failNextGet("storage_rejected");
    expect(storage.get(storedKey)).rejects.toMatchObject({ code: "storage_rejected" });
    expect(await storage.get(storedKey)).toEqual(body);
  });

  it("failNextDelete mantém o objeto e registra só os deletes feitos", async () => {
    const storage = createFakeObjectStorage();
    const storedKey = key();
    await storage.putPrivate({ key: storedKey, body, contentType: "image/jpeg" });
    storage.failNextDelete();
    expect(storage.delete(storedKey)).rejects.toBeInstanceOf(ObjectStorageError);
    expect(storage.objectMap.has(storedKey)).toBe(true);
    await storage.delete(storedKey);
    expect(storage.deletedKeyList).toEqual([storedKey]);
  });

  it("guarda uma cópia dos bytes", async () => {
    const storage = createFakeObjectStorage();
    const storedKey = key();
    const mutable = new Uint8Array([1, 2, 3]);
    await storage.putPrivate({ key: storedKey, body: mutable, contentType: "image/jpeg" });
    mutable[0] = 9;
    expect(storage.objectMap.get(storedKey)?.body).toEqual(new Uint8Array([1, 2, 3]));
  });
});
