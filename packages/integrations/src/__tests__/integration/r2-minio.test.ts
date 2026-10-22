import { DEFAULT_STORAGE_REGION } from "@gizito/core";
import {
  createSignedUrlReader,
  describeObjectStorageContract,
} from "#src/__tests__/storage/contract.ts";
import { createR2ObjectStorage } from "#src/r2/r2-object-storage.ts";

const LOCAL_MINIO_STORAGE_OPTIONS = {
  endpoint: "http://127.0.0.1:9000",
  bucket: "gizito",
  region: DEFAULT_STORAGE_REGION,
  accessKeyId: "gizito",
  secretAccessKey: "gizito-local-dev",
} as const;

describeObjectStorageContract("R2 contra o MinIO local (docker compose)", {
  createDriver: () => {
    const storage = createR2ObjectStorage(LOCAL_MINIO_STORAGE_OPTIONS);
    return { storage, readObject: createSignedUrlReader(storage), fetchSignedUrl: fetch };
  },
  testTimeoutMs: 10_000,
});
