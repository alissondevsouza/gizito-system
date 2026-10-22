import {
  type ObjectStorage,
  ObjectStorageError,
  type ObjectStorageErrorCode,
  putObjectInputSchema,
  type StorageKey,
  type StoredContentType,
  signedUrlTtlSecondsSchema,
  storageKeySchema,
} from "@gizito/core";

export const FAKE_STORAGE_BASE_URL = "https://fake-storage.gizito.test";

export type FakeStoredObject = {
  readonly body: Uint8Array;
  readonly contentType: StoredContentType;
};

export type FakeObjectStorage = ObjectStorage & {
  readonly objectMap: ReadonlyMap<StorageKey, FakeStoredObject>;
  readonly deletedKeyList: readonly StorageKey[];
  readonly failNextPut: (code?: ObjectStorageErrorCode) => void;
  readonly failPutAfter: (successCount: number, code?: ObjectStorageErrorCode) => void;
  readonly failNextDelete: (code?: ObjectStorageErrorCode) => void;
  readonly failNextGet: (code?: ObjectStorageErrorCode) => void;
};

export function createFakeObjectStorage(): FakeObjectStorage {
  const objectMap = new Map<StorageKey, FakeStoredObject>();
  const deletedKeyList: StorageKey[] = [];
  let putFailure: { remainingSuccessCount: number; code: ObjectStorageErrorCode } | null = null;
  let deleteFailure: ObjectStorageErrorCode | null = null;
  let getFailure: ObjectStorageErrorCode | null = null;

  return {
    objectMap,
    deletedKeyList,
    failNextPut(code = "storage_unavailable") {
      putFailure = { remainingSuccessCount: 0, code };
    },
    failPutAfter(successCount, code = "storage_unavailable") {
      putFailure = { remainingSuccessCount: successCount, code };
    },
    failNextDelete(code = "storage_unavailable") {
      deleteFailure = code;
    },
    failNextGet(code = "storage_unavailable") {
      getFailure = code;
    },
    async putPrivate(input) {
      const { key, body, contentType } = putObjectInputSchema.parse(input);
      if (putFailure !== null) {
        if (putFailure.remainingSuccessCount === 0) {
          const { code } = putFailure;
          putFailure = null;
          throw new ObjectStorageError(code);
        }
        putFailure.remainingSuccessCount -= 1;
      }
      objectMap.set(key, { body: body.slice(), contentType });
    },
    async get(key) {
      const validKey = storageKeySchema.parse(key);
      if (getFailure !== null) {
        const code = getFailure;
        getFailure = null;
        throw new ObjectStorageError(code);
      }
      const stored = objectMap.get(validKey);
      if (stored === undefined) throw new ObjectStorageError("storage_not_found");
      return stored.body.slice();
    },
    async getSignedUrl(key, ttlSeconds) {
      const validKey = storageKeySchema.parse(key);
      const ttl = signedUrlTtlSecondsSchema.parse(ttlSeconds);
      return `${FAKE_STORAGE_BASE_URL}/${validKey}?X-Amz-Expires=${ttl}`;
    },
    async delete(key) {
      const validKey = storageKeySchema.parse(key);
      if (deleteFailure !== null) {
        const code = deleteFailure;
        deleteFailure = null;
        throw new ObjectStorageError(code);
      }
      objectMap.delete(validKey);
      deletedKeyList.push(validKey);
    },
  };
}
