import {
  type ApiErrorCode,
  analysisFailureViewOf,
  buildPublicToken,
  buildShortCode,
  type CreateOrderResponse,
  detectPhotoFormat,
  err,
  errorNameOf,
  type Grade,
  isPhotoReplaceableOrderStatus,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_COUNT,
  type ObjectStorage,
  ObjectStorageError,
  ORDER_CODE_ATTEMPT_COUNT,
  type OrderAnalysis,
  type OrderStatus,
  type OrderView,
  ok,
  orderAnalysisSchema,
  orderViewSchema,
  PHOTO_SIGNATURE_MAX_BYTES,
  type PhotoIndex,
  PUBLIC_TOKEN_BYTES,
  photoAnalysisViewOf,
  photoStageOrderStatusList,
  photoStorageKey,
  photoThumbnailStorageKey,
  previewViewOf,
  publicTokenSchema,
  type Result,
  SHORT_CODE_LENGTH,
  SIGNED_URL_TTL_SECONDS,
  type StorageKey,
  type Subject,
  transitionOrder,
} from "@gizito/core";
import {
  type Database,
  type Executor,
  enqueueSingletonJob,
  isUniqueViolation,
  order,
  orderPhoto,
} from "@gizito/db";
import type { Logger, NormalizedPhoto, PhotoNormalizer } from "@gizito/integrations";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { type ClientKeyHashMap, reservePreviewRequest } from "#src/services/preview-rate-limit.ts";

const ORDER_CODE_CONSTRAINT_LIST = ["order_short_code_idx", "order_public_token_idx"] as const;
const CURRENT_PHOTO_INDEX_CONSTRAINT = "order_photo_order_id_photo_index_idx";

export type OrderServiceErrorCode = Extract<
  ApiErrorCode,
  | "too_many_photos"
  | "photo_too_large"
  | "photo_invalid"
  | "photo_duplicate"
  | "challenge_required"
  | "order_not_found"
  | "not_found"
  | "invalid_state"
  | "service_unavailable"
>;

export type OrderServiceError = {
  readonly code: OrderServiceErrorCode;
  readonly photoIndex?: PhotoIndex;
};

export type OrderServiceDependencies = {
  readonly db: Database;
  readonly storage: ObjectStorage;
  readonly normalizePhoto: PhotoNormalizer;
  readonly logger: Logger;
  readonly now: () => Date;
  readonly randomBytes: (length: number) => Uint8Array;
  readonly runInBackground: (task: () => Promise<void>) => void;
};

export type CreateOrderRequest = {
  readonly grade: Grade;
  readonly subject: Subject;
  readonly photoList: readonly Blob[];
  readonly clientKeyHashMap: ClientKeyHashMap;
};

export type PhotoReplacement = {
  readonly orderPhotoId: string;
  readonly photo: Blob;
};

export type ReplaceOrderPhotoListRequest = {
  readonly publicToken: string;
  readonly replacementList: readonly PhotoReplacement[];
  readonly clientKeyHashMap: ClientKeyHashMap;
};

type IndexedPhoto = {
  readonly photo: Blob;
  readonly photoIndex: PhotoIndex;
};

type LoadedPhoto = {
  readonly bytes: Uint8Array;
  readonly photoIndex: PhotoIndex;
};

type PreparedPhoto = {
  readonly orderPhotoId: string;
  readonly photoIndex: PhotoIndex;
  readonly normalized: NormalizedPhoto;
};

type CurrentPhoto = {
  readonly orderPhotoId: string;
  readonly photoIndex: number;
  readonly contentHash: string;
  readonly legibilityScore: number | null;
};

async function loadPhotoList(
  indexedList: readonly IndexedPhoto[],
): Promise<Result<LoadedPhoto[], OrderServiceError>> {
  const oversized = indexedList.find(({ photo }) => photo.size > MAX_PHOTO_BYTES);
  if (oversized !== undefined) {
    return err({ code: "photo_too_large", photoIndex: oversized.photoIndex });
  }
  const loadedList: LoadedPhoto[] = [];
  for (const { photo, photoIndex } of indexedList) {
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (detectPhotoFormat(bytes.subarray(0, PHOTO_SIGNATURE_MAX_BYTES)) === null) {
      return err({ code: "photo_invalid", photoIndex });
    }
    loadedList.push({ bytes, photoIndex });
  }
  return ok(loadedList);
}

async function preparePhotoList(
  normalizePhoto: PhotoNormalizer,
  loadedList: readonly LoadedPhoto[],
  knownHashList: readonly string[],
): Promise<Result<PreparedPhoto[], OrderServiceError>> {
  const seenHashSet = new Set(knownHashList);
  const preparedList: PreparedPhoto[] = [];
  for (const { bytes, photoIndex } of loadedList) {
    const normalized = await normalizePhoto(bytes);
    if (!normalized.ok) return err({ code: "photo_invalid", photoIndex });
    if (seenHashSet.has(normalized.value.contentHash)) {
      return err({ code: "photo_duplicate", photoIndex });
    }
    seenHashSet.add(normalized.value.contentHash);
    preparedList.push({
      orderPhotoId: crypto.randomUUID(),
      photoIndex,
      normalized: normalized.value,
    });
  }
  return ok(preparedList);
}

function photoKeyListOf(orderId: string, orderPhotoId: string): StorageKey[] {
  return [photoStorageKey(orderId, orderPhotoId), photoThumbnailStorageKey(orderId, orderPhotoId)];
}

async function uploadPhotoList(
  storage: ObjectStorage,
  orderId: string,
  preparedList: readonly PreparedPhoto[],
  uploadedKeyList: StorageKey[],
): Promise<void> {
  for (const { orderPhotoId, normalized } of preparedList) {
    const [photoKey, thumbnailKey] = photoKeyListOf(orderId, orderPhotoId);
    for (const [key, body] of [
      [photoKey, normalized.data],
      [thumbnailKey, normalized.thumbnailData],
    ] as const) {
      if (key === undefined) continue;
      uploadedKeyList.push(key);
      await storage.putPrivate({ key, body, contentType: "image/jpeg" });
    }
  }
}

async function removeObjectList(
  { storage, logger }: OrderServiceDependencies,
  orderId: string,
  keyList: readonly StorageKey[],
  orderPhotoId?: string,
): Promise<boolean> {
  let removedAll = true;
  for (const key of keyList) {
    try {
      await storage.delete(key);
    } catch (error) {
      removedAll = false;
      logger.warn(
        {
          orderId,
          ...(orderPhotoId === undefined ? {} : { orderPhotoId }),
          errorCode: error instanceof ObjectStorageError ? error.code : "storage_delete_failed",
        },
        "remoção no storage falhou",
      );
    }
  }
  return removedAll;
}

function photoRowListOf(orderId: string, preparedList: readonly PreparedPhoto[]) {
  return preparedList.map(({ orderPhotoId, photoIndex, normalized }) => ({
    orderPhotoId,
    orderId,
    photoIndex,
    storageKey: photoStorageKey(orderId, orderPhotoId),
    contentHash: normalized.contentHash,
    width: normalized.width,
    height: normalized.height,
  }));
}

async function listCurrentPhotos(executor: Executor, orderId: string): Promise<CurrentPhoto[]> {
  return executor
    .select({
      orderPhotoId: orderPhoto.orderPhotoId,
      photoIndex: orderPhoto.photoIndex,
      contentHash: orderPhoto.contentHash,
      legibilityScore: orderPhoto.legibilityScore,
    })
    .from(orderPhoto)
    .where(
      and(
        eq(orderPhoto.orderId, orderId),
        isNull(orderPhoto.replacedDatetime),
        isNull(orderPhoto.deleteDatetime),
      ),
    )
    .orderBy(asc(orderPhoto.photoIndex));
}

type PhotoOutcome = {
  readonly orderId: string;
  readonly photoCount: number;
  readonly startTime: number;
  readonly errorCode?: OrderServiceErrorCode | "internal_error";
};

function logPhotoOutcome(
  logger: Logger,
  message: string,
  { orderId, photoCount, startTime, errorCode }: PhotoOutcome,
): void {
  logger.info(
    {
      orderId,
      photoCount,
      durationMs: Math.round(performance.now() - startTime),
      ...(errorCode === undefined ? {} : { errorCode }),
    },
    message,
  );
}

function isPhotoStageOrderStatus(status: OrderStatus): boolean {
  return photoStageOrderStatusList.some((photoStage) => photoStage === status);
}

async function insertOrderWithFreshCodes(
  { db, randomBytes }: OrderServiceDependencies,
  request: CreateOrderRequest,
  orderId: string,
  preparedList: readonly PreparedPhoto[],
): Promise<CreateOrderResponse> {
  for (let attempt = 1; ; attempt += 1) {
    const publicToken = buildPublicToken(randomBytes(PUBLIC_TOKEN_BYTES));
    const shortCode = buildShortCode(randomBytes(SHORT_CODE_LENGTH));
    try {
      await db.transaction(async (tx) => {
        await tx.insert(order).values({
          orderId,
          publicToken,
          shortCode,
          grade: request.grade,
          subject: request.subject,
        });
        await tx.insert(orderPhoto).values(photoRowListOf(orderId, preparedList));
        await enqueueSingletonJob(tx, { name: "order.analyze", orderId }, orderId);
      });
      return { publicToken, shortCode, status: "draft" };
    } catch (error) {
      const isCodeCollision = ORDER_CODE_CONSTRAINT_LIST.some((constraint) =>
        isUniqueViolation(error, constraint),
      );
      if (!isCodeCollision || attempt >= ORDER_CODE_ATTEMPT_COUNT) throw error;
    }
  }
}

export async function createOrder(
  dependencies: OrderServiceDependencies,
  request: CreateOrderRequest,
): Promise<Result<CreateOrderResponse, OrderServiceError>> {
  const startTime = performance.now();
  const { db, storage, normalizePhoto, logger, now } = dependencies;
  if (request.photoList.length > MAX_PHOTO_COUNT) return err({ code: "too_many_photos" });
  const loaded = await loadPhotoList(
    request.photoList.map((photo, photoIndex) => ({ photo, photoIndex })),
  );
  if (!loaded.ok) return loaded;
  const reservation = await reservePreviewRequest(db, request.clientKeyHashMap, now());
  if (!reservation.ok) return err({ code: "challenge_required" });
  const prepared = await preparePhotoList(normalizePhoto, loaded.value, []);
  if (!prepared.ok) return prepared;

  const orderId = crypto.randomUUID();
  const outcome = { orderId, photoCount: prepared.value.length, startTime };
  const uploadedKeyList: StorageKey[] = [];
  let isCommitted = false;
  try {
    await uploadPhotoList(storage, orderId, prepared.value, uploadedKeyList);
    const created = await insertOrderWithFreshCodes(dependencies, request, orderId, prepared.value);
    isCommitted = true;
    logPhotoOutcome(logger, "pedido criado", outcome);
    return ok(created);
  } catch (error) {
    const isStorageFailure = error instanceof ObjectStorageError;
    logPhotoOutcome(logger, "pedido recusado", {
      ...outcome,
      errorCode: isStorageFailure ? "service_unavailable" : "internal_error",
    });
    if (isStorageFailure) return err({ code: "service_unavailable" });
    throw error;
  } finally {
    if (!isCommitted) await removeObjectList(dependencies, orderId, uploadedKeyList);
  }
}

function stageViewOf(status: OrderStatus, analysis: OrderAnalysis | null) {
  if (status === "draft") return { analysisFailure: analysisFailureViewOf(analysis) };
  if (status === "preview_ready" && analysis !== null) return previewViewOf(analysis);
  return {};
}

async function buildOrderView(
  { db, storage }: OrderServiceDependencies,
  row: Pick<
    typeof order.$inferSelect,
    | "orderId"
    | "publicToken"
    | "shortCode"
    | "status"
    | "grade"
    | "subject"
    | "insertDatetime"
    | "analysis"
  >,
): Promise<OrderView> {
  const base = {
    publicToken: row.publicToken,
    shortCode: row.shortCode,
    status: row.status,
    grade: row.grade,
    subject: row.subject,
    insertDatetime: row.insertDatetime.toISOString(),
  };
  if (!isPhotoStageOrderStatus(row.status)) return orderViewSchema.parse(base);
  const analysis = orderAnalysisSchema.nullable().parse(row.analysis);
  const photoList = await Promise.all(
    (await listCurrentPhotos(db, row.orderId)).map(async (photo) => ({
      orderPhotoId: photo.orderPhotoId,
      photoIndex: photo.photoIndex,
      thumbnailUrl: await storage.getSignedUrl(
        photoThumbnailStorageKey(row.orderId, photo.orderPhotoId),
        SIGNED_URL_TTL_SECONDS,
      ),
      legibilityScore: photo.legibilityScore,
      ...photoAnalysisViewOf(analysis, photo.orderPhotoId),
    })),
  );
  return orderViewSchema.parse({ ...base, photoList, ...stageViewOf(row.status, analysis) });
}

async function findOrderByToken(db: Database, publicToken: string) {
  const parsedToken = publicTokenSchema.safeParse(publicToken);
  if (!parsedToken.success) return null;
  const [row] = await db
    .select({
      orderId: order.orderId,
      publicToken: order.publicToken,
      shortCode: order.shortCode,
      status: order.status,
      grade: order.grade,
      subject: order.subject,
      insertDatetime: order.insertDatetime,
      analysis: order.analysis,
    })
    .from(order)
    .where(eq(order.publicToken, parsedToken.data));
  return row ?? null;
}

export async function getOrderView(
  dependencies: OrderServiceDependencies,
  publicToken: string,
): Promise<Result<OrderView, OrderServiceError>> {
  const row = await findOrderByToken(dependencies.db, publicToken);
  if (row === null) return err({ code: "order_not_found" });
  try {
    return ok(await buildOrderView(dependencies, row));
  } catch (error) {
    if (error instanceof ObjectStorageError) return err({ code: "service_unavailable" });
    throw error;
  }
}

function matchReplacementList(
  replacementList: readonly PhotoReplacement[],
  currentList: readonly CurrentPhoto[],
): Result<(IndexedPhoto & { readonly replacedPhotoId: string })[], OrderServiceError> {
  const currentById = new Map(currentList.map((photo) => [photo.orderPhotoId, photo]));
  const matchedList: (IndexedPhoto & { readonly replacedPhotoId: string })[] = [];
  for (const { orderPhotoId, photo } of replacementList) {
    const current = currentById.get(orderPhotoId);
    if (current === undefined) return err({ code: "not_found" });
    matchedList.push({ photo, photoIndex: current.photoIndex, replacedPhotoId: orderPhotoId });
  }
  return ok(matchedList);
}

type ReplacementCommit = Result<void, OrderServiceError>;

async function commitReplacement(
  { db, now }: OrderServiceDependencies,
  orderId: string,
  replacedPhotoIdList: readonly string[],
  preparedList: readonly PreparedPhoto[],
): Promise<ReplacementCommit> {
  return db.transaction(async (tx): Promise<ReplacementCommit> => {
    const [locked] = await tx
      .select({ status: order.status })
      .from(order)
      .where(eq(order.orderId, orderId))
      .for("update");
    if (locked === undefined || !isPhotoReplaceableOrderStatus(locked.status)) {
      return err({ code: "invalid_state" });
    }
    const lockedCurrentList = await listCurrentPhotos(tx, orderId);
    const lockedCurrentIdSet = new Set(lockedCurrentList.map((photo) => photo.orderPhotoId));
    if (!replacedPhotoIdList.every((orderPhotoId) => lockedCurrentIdSet.has(orderPhotoId))) {
      return err({ code: "not_found" });
    }
    const lockedHashSet = new Set(lockedCurrentList.map((photo) => photo.contentHash));
    const duplicate = preparedList.find(({ normalized }) =>
      lockedHashSet.has(normalized.contentHash),
    );
    if (duplicate !== undefined) {
      return err({ code: "photo_duplicate", photoIndex: duplicate.photoIndex });
    }
    let status = locked.status;
    if (locked.status === "preview_ready") {
      const transition = transitionOrder(locked.status, "photos_changed");
      if (!transition.ok) return err({ code: "invalid_state" });
      status = transition.value;
    }
    await tx
      .update(order)
      .set({ status, analysis: null, materialProfile: null })
      .where(eq(order.orderId, orderId));
    await tx
      .update(orderPhoto)
      .set({ replacedDatetime: now() })
      .where(inArray(orderPhoto.orderPhotoId, [...replacedPhotoIdList]));
    await tx
      .update(orderPhoto)
      .set({ legibilityScore: null })
      .where(and(eq(orderPhoto.orderId, orderId), isNull(orderPhoto.replacedDatetime)));
    await tx.insert(orderPhoto).values(photoRowListOf(orderId, preparedList));
    await enqueueSingletonJob(tx, { name: "order.analyze", orderId }, orderId);
    return ok(undefined);
  });
}

async function removeReplacedPhotoList(
  dependencies: OrderServiceDependencies,
  orderId: string,
  replacedPhotoIdList: readonly string[],
): Promise<void> {
  for (const orderPhotoId of replacedPhotoIdList) {
    const keyList = photoKeyListOf(orderId, orderPhotoId);
    if (!(await removeObjectList(dependencies, orderId, keyList, orderPhotoId))) continue;
    try {
      await dependencies.db
        .update(orderPhoto)
        .set({ deleteDatetime: dependencies.now() })
        .where(eq(orderPhoto.orderPhotoId, orderPhotoId));
    } catch (error) {
      dependencies.logger.warn(
        {
          orderId,
          orderPhotoId,
          errorCode: "photo_delete_mark_failed",
          errorName: errorNameOf(error),
        },
        "marcação da foto removida falhou",
      );
    }
  }
}

async function replaceWithinOrder(
  dependencies: OrderServiceDependencies,
  row: { readonly orderId: string; readonly status: OrderStatus },
  request: ReplaceOrderPhotoListRequest,
): Promise<Result<string[], OrderServiceError>> {
  const { db, storage, normalizePhoto, now } = dependencies;
  if (!isPhotoReplaceableOrderStatus(row.status)) return err({ code: "invalid_state" });
  const currentList = await listCurrentPhotos(db, row.orderId);
  const matched = matchReplacementList(request.replacementList, currentList);
  if (!matched.ok) return matched;
  const loaded = await loadPhotoList(matched.value);
  if (!loaded.ok) return loaded;
  const reservation = await reservePreviewRequest(db, request.clientKeyHashMap, now());
  if (!reservation.ok) return err({ code: "challenge_required" });
  const prepared = await preparePhotoList(
    normalizePhoto,
    loaded.value,
    currentList.map((photo) => photo.contentHash),
  );
  if (!prepared.ok) return prepared;

  const replacedPhotoIdList = matched.value.map((replacement) => replacement.replacedPhotoId);
  const uploadedKeyList: StorageKey[] = [];
  let isCommitted = false;
  try {
    await uploadPhotoList(storage, row.orderId, prepared.value, uploadedKeyList);
    const committed = await commitReplacement(
      dependencies,
      row.orderId,
      replacedPhotoIdList,
      prepared.value,
    );
    if (!committed.ok) return committed;
    isCommitted = true;
    return ok(replacedPhotoIdList);
  } catch (error) {
    if (error instanceof ObjectStorageError) return err({ code: "service_unavailable" });
    if (isUniqueViolation(error, CURRENT_PHOTO_INDEX_CONSTRAINT)) return err({ code: "not_found" });
    throw error;
  } finally {
    if (!isCommitted) await removeObjectList(dependencies, row.orderId, uploadedKeyList);
  }
}

export async function replaceOrderPhotoList(
  dependencies: OrderServiceDependencies,
  request: ReplaceOrderPhotoListRequest,
): Promise<Result<OrderView, OrderServiceError>> {
  const startTime = performance.now();
  if (request.replacementList.length > MAX_PHOTO_COUNT) return err({ code: "too_many_photos" });
  const row = await findOrderByToken(dependencies.db, request.publicToken);
  if (row === null) return err({ code: "order_not_found" });
  const outcome = {
    orderId: row.orderId,
    photoCount: request.replacementList.length,
    startTime,
  };
  let replaced: Result<string[], OrderServiceError>;
  try {
    replaced = await replaceWithinOrder(dependencies, row, request);
  } catch (error) {
    logPhotoOutcome(dependencies.logger, "troca de fotos recusada", {
      ...outcome,
      errorCode: "internal_error",
    });
    throw error;
  }
  if (!replaced.ok) {
    logPhotoOutcome(dependencies.logger, "troca de fotos recusada", {
      ...outcome,
      errorCode: replaced.error.code,
    });
    return replaced;
  }
  logPhotoOutcome(dependencies.logger, "fotos trocadas", outcome);
  const replacedPhotoIdList = replaced.value;
  dependencies.runInBackground(() =>
    removeReplacedPhotoList(dependencies, row.orderId, replacedPhotoIdList),
  );
  return getOrderView(dependencies, request.publicToken);
}
