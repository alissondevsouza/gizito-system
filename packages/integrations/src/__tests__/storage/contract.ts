import { describe, expect, it } from "bun:test";
import {
  type ObjectStorage,
  ObjectStorageError,
  photoStorageKey,
  photoThumbnailStorageKey,
  type StorageKey,
} from "@gizito/core";

export type StoredObjectRead = {
  readonly body: Uint8Array;
  readonly contentType: string | null;
};

export type ObjectStorageContractDriver = {
  readonly storage: ObjectStorage;
  readonly readObject: (key: StorageKey) => Promise<StoredObjectRead | null>;
  readonly fetchSignedUrl?: (url: string) => Promise<Response>;
};

export type ObjectStorageContractSetup = {
  readonly createDriver: () => ObjectStorageContractDriver;
  readonly testTimeoutMs: number;
};

const EXPIRED_URL_TTL_SECONDS = 1;
const EXPIRY_WAIT_MS = 2_500;
const HTTP_FORBIDDEN = 403;

const randomPhotoKey = () => photoStorageKey(crypto.randomUUID(), crypto.randomUUID());

export function describeObjectStorageContract(
  name: string,
  { createDriver, testTimeoutMs }: ObjectStorageContractSetup,
) {
  describe(`contrato do ObjectStorage: ${name}`, () => {
    it(
      "grava privado e lê de volta os mesmos bytes e o content-type",
      async () => {
        const { storage, readObject } = createDriver();
        const key = randomPhotoKey();
        const body = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
        await storage.putPrivate({ key, body, contentType: "image/jpeg" });
        const stored = await readObject(key);
        expect(stored?.body).toEqual(body);
        expect(stored?.contentType).toBe("image/jpeg");
        await storage.delete(key);
      },
      testTimeoutMs,
    );

    it(
      "get devolve os bytes gravados e objeto ausente vira storage_not_found",
      async () => {
        const { storage } = createDriver();
        const key = randomPhotoKey();
        const body = new Uint8Array([0xff, 0xd8, 0xff, 4, 5, 6]);
        await storage.putPrivate({ key, body, contentType: "image/jpeg" });
        expect(await storage.get(key)).toEqual(body);
        await storage.delete(key);
        const missing = storage.get(key);
        expect(missing).rejects.toBeInstanceOf(ObjectStorageError);
        expect(missing).rejects.toMatchObject({ code: "storage_not_found" });
        await missing.catch(() => undefined);
      },
      testTimeoutMs,
    );

    it(
      "URL assinada leva a key e o TTL pedido",
      async () => {
        const { storage, fetchSignedUrl } = createDriver();
        const orderId = crypto.randomUUID();
        const key = photoThumbnailStorageKey(orderId, crypto.randomUUID());
        await storage.putPrivate({
          key,
          body: new Uint8Array([7, 8, 9]),
          contentType: "image/jpeg",
        });
        const url = new URL(await storage.getSignedUrl(key, 600));
        expect(url.pathname.endsWith(`/${key}`)).toBe(true);
        expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
        if (fetchSignedUrl !== undefined) {
          const response = await fetchSignedUrl(url.toString());
          expect(response.status).toBe(200);
          expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
        }
        await storage.delete(key);
      },
      testTimeoutMs,
    );

    it(
      "apaga o objeto, e apagar de novo não é erro",
      async () => {
        const { storage, readObject } = createDriver();
        const key = randomPhotoKey();
        await storage.putPrivate({ key, body: new Uint8Array([1]), contentType: "image/jpeg" });
        await storage.delete(key);
        expect(await readObject(key)).toBeNull();
        await storage.delete(key);
      },
      testTimeoutMs,
    );

    it("recusa key fora do layout e TTL fora do limite antes de qualquer chamada", async () => {
      const { storage } = createDriver();
      const forgedKey = "orders/../../etc/passwd" as StorageKey;
      expect(
        storage.putPrivate({
          key: forgedKey,
          body: new Uint8Array([1]),
          contentType: "image/jpeg",
        }),
      ).rejects.toThrow();
      expect(storage.getSignedUrl(forgedKey, 600)).rejects.toThrow();
      expect(storage.delete(forgedKey)).rejects.toThrow();
      expect(storage.get(forgedKey)).rejects.toThrow();
      expect(storage.getSignedUrl(randomPhotoKey(), 0)).rejects.toThrow();
      expect(storage.getSignedUrl(randomPhotoKey(), 24 * 60 * 60)).rejects.toThrow();
    });

    it(
      "URL assinada expira",
      async () => {
        const { storage, fetchSignedUrl } = createDriver();
        if (fetchSignedUrl === undefined) return;
        const key = randomPhotoKey();
        await storage.putPrivate({ key, body: new Uint8Array([1]), contentType: "image/jpeg" });
        const url = await storage.getSignedUrl(key, EXPIRED_URL_TTL_SECONDS);
        await Bun.sleep(EXPIRY_WAIT_MS);
        expect((await fetchSignedUrl(url)).status).toBe(HTTP_FORBIDDEN);
        await storage.delete(key);
      },
      testTimeoutMs + EXPIRY_WAIT_MS,
    );
  });
}

export function createSignedUrlReader(storage: ObjectStorage) {
  return async (key: StorageKey): Promise<StoredObjectRead | null> => {
    const response = await fetch(await storage.getSignedUrl(key, 60));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`leitura do storage falhou com ${response.status}`);
    return {
      body: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type"),
    };
  };
}
