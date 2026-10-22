import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { ObjectStorageError, photoStorageKey } from "@gizito/core";
import { createR2ObjectStorage } from "#src/r2/r2-object-storage.ts";

const ENDPOINT = "https://conta-teste.r2.cloudflarestorage.com";
const BUCKET = "gizito";

type CapturedRequest = {
  readonly method: string;
  readonly url: string;
  readonly headerMap: Record<string, string>;
  readonly body: Uint8Array;
  readonly signal: AbortSignal | null;
};

function createStorage(respond: (request: CapturedRequest) => Promise<Response> | Response) {
  const requestList: CapturedRequest[] = [];
  const fakeFetch = (async (input: Request, init?: RequestInit) => {
    const captured: CapturedRequest = {
      method: input.method,
      url: input.url,
      headerMap: Object.fromEntries(input.headers.entries()),
      body: new Uint8Array(await input.arrayBuffer()),
      signal: init?.signal ?? null,
    };
    requestList.push(captured);
    return respond(captured);
  }) as typeof fetch;
  const storage = createR2ObjectStorage({
    endpoint: `${ENDPOINT}/`,
    bucket: BUCKET,
    region: "auto",
    accessKeyId: "chave-de-teste",
    secretAccessKey: "segredo-de-teste",
    fetch: fakeFetch,
    requestTimeoutMs: 50,
  });
  return { storage, requestList };
}

const key = photoStorageKey("11111111-1111-4111-8111-111111111111", crypto.randomUUID());
const body = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

describe("createR2ObjectStorage (spec F2-01, RF-07)", () => {
  it("put assina SigV4 com path-style, content-type e hash do corpo", async () => {
    const { storage, requestList } = createStorage(() => new Response(null, { status: 200 }));
    await storage.putPrivate({ key, body, contentType: "image/jpeg" });
    const [request] = requestList;
    expect(request?.method).toBe("PUT");
    expect(request?.url).toBe(`${ENDPOINT}/${BUCKET}/${key}`);
    expect(request?.headerMap["content-type"]).toBe("image/jpeg");
    expect(request?.headerMap.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=chave-de-teste\/\d{8}\/auto\/s3\/aws4_request, /,
    );
    expect(request?.headerMap["x-amz-content-sha256"]).toBe(
      createHash("sha256").update(body).digest("hex"),
    );
    expect(request?.body).toEqual(body);
    expect(request?.signal).not.toBeNull();
    expect(requestList).toHaveLength(1);
  });

  it("URL assinada é GET pela query, com o TTL pedido e sem chamada de rede", async () => {
    const { storage, requestList } = createStorage(() => new Response(null, { status: 500 }));
    const url = new URL(await storage.getSignedUrl(key, 600));
    expect(`${url.origin}${url.pathname}`).toBe(`${ENDPOINT}/${BUCKET}/${key}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
    expect(requestList).toHaveLength(0);
  });

  it("delete aceita 204 e 404", async () => {
    for (const status of [204, 404]) {
      const { storage, requestList } = createStorage(() => new Response(null, { status }));
      await storage.delete(key);
      expect(requestList[0]?.method).toBe("DELETE");
    }
  });

  it("get assina GET path-style e devolve o corpo", async () => {
    const { storage, requestList } = createStorage(() => new Response(body, { status: 200 }));
    expect(await storage.get(key)).toEqual(body);
    const [request] = requestList;
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(`${ENDPOINT}/${BUCKET}/${key}`);
    expect(request?.headerMap.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(request?.signal).not.toBeNull();
  });

  it.each([
    [404, "storage_not_found"],
    [403, "storage_rejected"],
    [429, "storage_unavailable"],
    [500, "storage_unavailable"],
  ] as const)("get com %i vira %s, sem retry", async (status, code) => {
    const { storage, requestList } = createStorage(
      () => new Response("<Error><Code>X</Code></Error>", { status }),
    );
    const failed = storage.get(key);
    expect(failed).rejects.toBeInstanceOf(ObjectStorageError);
    expect(failed).rejects.toMatchObject({ code });
    await failed.catch(() => undefined);
    expect(requestList).toHaveLength(1);
  });

  it("get com erro de rede ou corpo interrompido vira storage_unavailable", async () => {
    const network = createStorage(() => {
      throw new TypeError("fetch failed");
    });
    expect(network.storage.get(key)).rejects.toMatchObject({ code: "storage_unavailable" });
    const broken = createStorage(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.error(new Error("conexão caiu"));
            },
          }),
          { status: 200 },
        ),
    );
    expect(broken.storage.get(key)).rejects.toMatchObject({ code: "storage_unavailable" });
  });

  it.each([
    [403, "storage_rejected"],
    [400, "storage_rejected"],
    [404, "storage_rejected"],
    [429, "storage_unavailable"],
    [500, "storage_unavailable"],
    [503, "storage_unavailable"],
  ] as const)("put com %i vira %s, sem retry", async (status, code) => {
    const { storage, requestList } = createStorage(
      () => new Response("<Error><Code>X</Code></Error>", { status }),
    );
    const failed = storage.putPrivate({ key, body, contentType: "image/jpeg" });
    expect(failed).rejects.toBeInstanceOf(ObjectStorageError);
    expect(failed).rejects.toMatchObject({ code });
    await failed.catch(() => undefined);
    expect(requestList).toHaveLength(1);
  });

  it("erro de rede e timeout viram storage_unavailable", async () => {
    const network = createStorage(() => {
      throw new TypeError("fetch failed");
    });
    expect(
      network.storage.putPrivate({ key, body, contentType: "image/jpeg" }),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
    const slow = createStorage(
      (request) =>
        new Promise<Response>((_, reject) => {
          request.signal?.addEventListener("abort", () => reject(request.signal?.reason));
        }),
    );
    expect(slow.storage.delete(key)).rejects.toMatchObject({ code: "storage_unavailable" });
  });

  it("mensagem do erro não traz a resposta do fornecedor", async () => {
    const { storage } = createStorage(() => new Response("segredo do fornecedor", { status: 403 }));
    const error = await storage
      .putPrivate({ key, body, contentType: "image/jpeg" })
      .catch((caught) => caught);
    expect(String(error.message)).not.toContain("segredo");
  });
});
