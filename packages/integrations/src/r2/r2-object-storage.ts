import {
  type ObjectStorage,
  ObjectStorageError,
  type ObjectStorageErrorCode,
  putObjectInputSchema,
  type StorageKey,
  signedUrlTtlSecondsSchema,
  storageKeySchema,
} from "@gizito/core";
import { AwsClient } from "aws4fetch";
import { computeContentHash } from "#src/photo/content-hash.ts";

export const DEFAULT_STORAGE_REQUEST_TIMEOUT_MS = 15_000;

const S3_SERVICE = "s3";
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

export type R2ObjectStorageOptions = {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly fetch?: typeof fetch;
  readonly requestTimeoutMs?: number;
};

function errorCodeOfStatus(status: number): ObjectStorageErrorCode {
  return status >= HTTP_SERVER_ERROR || status === HTTP_TOO_MANY_REQUESTS
    ? "storage_unavailable"
    : "storage_rejected";
}

export function createR2ObjectStorage({
  endpoint,
  bucket,
  region,
  accessKeyId,
  secretAccessKey,
  fetch: fetchImpl = fetch,
  requestTimeoutMs = DEFAULT_STORAGE_REQUEST_TIMEOUT_MS,
}: R2ObjectStorageOptions): ObjectStorage {
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: S3_SERVICE,
    region,
    retries: 0,
  });
  const bucketUrl = `${endpoint.replace(/\/+$/, "")}/${bucket}`;
  const objectUrl = (key: StorageKey) => `${bucketUrl}/${storageKeySchema.parse(key)}`;

  async function send(request: Request): Promise<Response> {
    try {
      return await fetchImpl(request, { signal: AbortSignal.timeout(requestTimeoutMs) });
    } catch (cause) {
      throw new ObjectStorageError("storage_unavailable", { cause });
    }
  }

  function failureOf(response: Response): ObjectStorageError {
    return new ObjectStorageError(errorCodeOfStatus(response.status), {
      cause: { status: response.status },
    });
  }

  async function expectSuccess(response: Response, isAcceptable: (status: number) => boolean) {
    await response.arrayBuffer().catch(() => undefined);
    if (response.ok || isAcceptable(response.status)) return;
    throw failureOf(response);
  }

  async function readBody(response: Response): Promise<Uint8Array<ArrayBuffer>> {
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (cause) {
      throw new ObjectStorageError("storage_unavailable", { cause });
    }
  }

  return {
    async putPrivate(input) {
      const { key, body, contentType } = putObjectInputSchema.parse(input);
      const request = await client.sign(objectUrl(key), {
        method: "PUT",
        body,
        headers: { "content-type": contentType, "x-amz-content-sha256": computeContentHash(body) },
      });
      await expectSuccess(await send(request), () => false);
    },
    async get(key) {
      const response = await send(await client.sign(objectUrl(key), { method: "GET" }));
      if (response.ok) return readBody(response);
      await response.arrayBuffer().catch(() => undefined);
      throw response.status === HTTP_NOT_FOUND
        ? new ObjectStorageError("storage_not_found")
        : failureOf(response);
    },
    async getSignedUrl(key, ttlSeconds) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(signedUrlTtlSecondsSchema.parse(ttlSeconds)));
      const request = await client.sign(url.toString(), {
        method: "GET",
        aws: { signQuery: true },
      });
      return request.url;
    },
    async delete(key) {
      const request = await client.sign(objectUrl(key), { method: "DELETE" });
      await expectSuccess(await send(request), (status) => status === HTTP_NOT_FOUND);
    },
  };
}
