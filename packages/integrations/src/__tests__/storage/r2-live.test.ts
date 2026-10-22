import { describe } from "bun:test";
import { storageEnvironmentSchema } from "@gizito/core";
import {
  createSignedUrlReader,
  describeObjectStorageContract,
} from "#src/__tests__/storage/contract.ts";
import { createR2ObjectStorage } from "#src/r2/r2-object-storage.ts";

const LIVE_TEST_TIMEOUT_MS = 30_000;

const liveEnvironment =
  process.env.STORAGE_LIVE_TEST === "1" ? storageEnvironmentSchema.safeParse(process.env) : null;

function createLiveStorage() {
  if (!liveEnvironment?.success)
    throw new Error("STORAGE_LIVE_TEST=1 e as chaves R2_* são obrigatórias");
  const environment = liveEnvironment.data;
  return createR2ObjectStorage({
    endpoint: environment.R2_ENDPOINT,
    bucket: environment.R2_BUCKET,
    region: environment.R2_REGION,
    accessKeyId: environment.R2_ACCESS_KEY_ID,
    secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
  });
}

if (liveEnvironment === null) {
  describe.skip("contrato do ObjectStorage: R2 real (STORAGE_LIVE_TEST=1)", () => {});
} else {
  describeObjectStorageContract("R2 real", {
    createDriver: () => {
      const storage = createLiveStorage();
      return { storage, readObject: createSignedUrlReader(storage), fetchSignedUrl: fetch };
    },
    testTimeoutMs: LIVE_TEST_TIMEOUT_MS,
  });
}
