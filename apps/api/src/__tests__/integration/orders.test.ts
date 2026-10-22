import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import {
  type ApiErrorCode,
  apiErrorSchema,
  createOrderResponseSchema,
  kitPreview,
  MAX_PHOTO_BYTES,
  type MergedExtraction,
  type OrderAnalysis,
  type OrderStatus,
  orderViewSchema,
  PREVIEW_RATE_LIMIT_PER_DAY,
  PREVIEW_RATE_LIMIT_PER_HOUR,
  photoStorageKey,
  photoThumbnailStorageKey,
  SHORT_CODE_LENGTH,
} from "@gizito/core";
import { job, order, orderPhoto, previewRequest } from "@gizito/db";
import { createTestDatabase, type TestDatabase, truncateAllTables } from "@gizito/db/test-helpers";
import { createMemoryLogger } from "@gizito/integrations/fakes";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import {
  buildAppDependencies,
  CLIENT_HASH_SECRET,
  orderForm,
  photoFile,
  replaceForm,
  syntheticJpeg,
  syntheticPng,
  type TestAppDependencies,
} from "#src/__tests__/__fixtures__/app.ts";
import { createApp } from "#src/app.ts";
import { DEVICE_COOKIE_NAME } from "#src/http/client-identity.ts";
import { reservePreviewRequest } from "#src/services/preview-rate-limit.ts";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
});

const CLIENT_IP = "203.0.113.7";
const DEVICE_ID = "Ab3_-cdEfGhIjKlMnOpQrStUvWxYz0123456789abcQ";
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

const hmac = (value: string) =>
  createHmac("sha256", CLIENT_HASH_SECRET).update(value).digest("hex");

function setup(overrides: Partial<TestAppDependencies> = {}) {
  const memoryLogger = createMemoryLogger();
  const backgroundTaskList: (() => Promise<void>)[] = [];
  const dependencies = buildAppDependencies(testDatabase.db, memoryLogger.logger, {
    runInBackground: (task) => {
      backgroundTaskList.push(task);
    },
    ...overrides,
  });
  const settleBackgroundTasks = async () => {
    await Promise.all(backgroundTaskList.splice(0).map((task) => task()));
  };
  return { app: createApp(dependencies), dependencies, settleBackgroundTasks, ...memoryLogger };
}

async function withFailingJobInsert(run: () => Promise<void>) {
  await testDatabase.db.execute(
    sql.raw(`CREATE FUNCTION fail_job_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha forçada no insert do job'; END $$`),
  );
  await testDatabase.db.execute(
    sql.raw(
      "CREATE TRIGGER fail_job_insert BEFORE INSERT ON job FOR EACH ROW EXECUTE FUNCTION fail_job_insert()",
    ),
  );
  try {
    await run();
  } finally {
    await testDatabase.db.execute(sql.raw("DROP TRIGGER fail_job_insert ON job"));
    await testDatabase.db.execute(sql.raw("DROP FUNCTION fail_job_insert()"));
  }
}

function clientHeaders({
  ip = CLIENT_IP,
  deviceId = DEVICE_ID,
}: {
  ip?: string;
  deviceId?: string | null;
} = {}) {
  return {
    "x-forwarded-for": `198.51.100.250, ${ip}`,
    ...(deviceId === null ? {} : { cookie: `${DEVICE_COOKIE_NAME}=${deviceId}` }),
  };
}

type App = ReturnType<typeof setup>["app"];

async function postOrder(app: App, form: FormData, headers = clientHeaders()) {
  return app.handle(
    new Request("http://localhost/orders", { method: "POST", body: form, headers }),
  );
}

async function getOrder(app: App, token: string) {
  return app.handle(new Request(`http://localhost/orders/${token}`));
}

async function putPhotos(app: App, token: string, form: FormData, headers = clientHeaders()) {
  return app.handle(
    new Request(`http://localhost/orders/${token}/photos`, { method: "PUT", body: form, headers }),
  );
}

async function createdOrder(app: App, photoCount = 2) {
  const photoList = await Promise.all(
    Array.from({ length: photoCount }, async (_, index) =>
      photoFile(await syntheticJpeg(index + 1), `caderno-${index}.jpg`),
    ),
  );
  const response = await postOrder(app, orderForm(photoList));
  expect(response.status).toBe(201);
  const created = createOrderResponseSchema.parse(await response.json());
  const [row] = await testDatabase.db
    .select()
    .from(order)
    .where(eq(order.publicToken, created.publicToken));
  if (row === undefined) throw new Error("pedido não gravado");
  return { ...created, orderId: row.orderId };
}

async function currentPhotoRowList(orderId: string) {
  return testDatabase.db
    .select()
    .from(orderPhoto)
    .where(and(eq(orderPhoto.orderId, orderId), isNull(orderPhoto.replacedDatetime)))
    .orderBy(asc(orderPhoto.photoIndex));
}

async function setOrderStatus(orderId: string, status: OrderStatus) {
  await testDatabase.db.update(order).set({ status }).where(eq(order.orderId, orderId));
}

const EVIDENCE_TEXT = "título da página e seis contas";
const TERMINOLOGY_TEXT = "numerador da turma";
const CONTEXT_THEME_TEXT = "compras na feira";

function mergedExtractionFor(photoCount: number): MergedExtraction {
  return {
    photoList: Array.from({ length: photoCount }, (_, index) => ({
      photoIndex: index + 1,
      legibility: index === 0 ? "good" : "unreadable",
      isUsable: index === 0,
      legibilityScore: index === 0 ? 1 : 0,
      photoIssueList: index === 0 ? [] : ["blurry", "dark"],
    })),
    topicCandidateList: [
      { topicId: "ma5-equivalent-fractions", confidence: "high", photoIndexList: [1] },
      { topicId: "ma5-fractions", confidence: "medium", photoIndexList: [1] },
    ],
    unsupportedTopicList: [{ unsupportedTopicId: "ma-grid-symmetry", photoIndexList: [1] }],
    sourceWarningList: [{ code: "personal_data_visible", photoIndexList: [1] }],
    materialProfile: {
      exerciseFormatList: ["computation", "word_problem"],
      notationList: ["fraction_slash"],
      terminologyList: [TERMINOLOGY_TEXT],
      contextThemeList: [CONTEXT_THEME_TEXT],
      apparentLevel: "at_grade",
      hasFigures: false,
      isHandwritten: true,
    },
    issueList: [
      {
        code: "extraction_personal_data_dropped",
        severity: "warning",
        stage: "extract",
        itemId: null,
        note: EVIDENCE_TEXT,
        excerpt: null,
      },
    ],
  };
}

async function setAnalysis(
  orderId: string,
  status: Extract<OrderStatus, "draft" | "preview_ready">,
  buildAnalysis: (analyzedPhotoIdList: string[]) => OrderAnalysis,
) {
  const photoList = await currentPhotoRowList(orderId);
  const analysis = buildAnalysis(photoList.map((photo) => photo.orderPhotoId));
  await testDatabase.db.update(order).set({ status, analysis }).where(eq(order.orderId, orderId));
  for (const [index, photo] of photoList.entries()) {
    await testDatabase.db
      .update(orderPhoto)
      .set({ legibilityScore: index === 0 ? 1 : 0 })
      .where(eq(orderPhoto.orderPhotoId, photo.orderPhotoId));
  }
  return analysis;
}

const previewAnalysis = (analyzedPhotoIdList: string[]): OrderAnalysis => ({
  outcome: "preview_ready",
  analyzedPhotoIdList,
  mergedExtraction: mergedExtractionFor(analyzedPhotoIdList.length),
});

const failedAnalysis = (analyzedPhotoIdList: string[]): OrderAnalysis => ({
  outcome: "analysis_failed",
  failCode: "only_unsupported_topics",
  isMaterialMismatch: false,
  analyzedPhotoIdList,
  mergedExtraction: { ...mergedExtractionFor(analyzedPhotoIdList.length), topicCandidateList: [] },
});

async function insertPreviewRequestList(
  count: number,
  {
    clientIpHash = hmac("ip:192.0.2.1"),
    deviceHash = hmac("device:outro"),
    insertDatetime = new Date(),
  } = {},
) {
  if (count === 0) return;
  await testDatabase.db
    .insert(previewRequest)
    .values(Array.from({ length: count }, () => ({ clientIpHash, deviceHash, insertDatetime })));
}

async function expectApiError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  photoIndex?: number,
) {
  expect(response.status).toBe(status);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.code).toBe(code);
  if (photoIndex !== undefined) expect(body.photoIndex).toBe(photoIndex);
  return body;
}

describe("POST /orders (RF-01, RF-02, RF-03)", () => {
  it("cria o pedido em draft com fotos normalizadas, miniaturas e order.analyze na mesma transação", async () => {
    const { app, dependencies } = setup();
    const exifPhoto = await syntheticJpeg(1, { width: 3000, height: 2000, withExif: true });
    const response = await postOrder(
      app,
      orderForm([
        photoFile(exifPhoto, "com-gps.jpg"),
        photoFile(await syntheticPng(2), "tela.png", "image/heic"),
      ]),
      clientHeaders({ deviceId: null }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toMatch(
      new RegExp(
        `^${DEVICE_COOKIE_NAME}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=\\d+; HttpOnly; SameSite=Lax$`,
      ),
    );
    const created = createOrderResponseSchema.parse(await response.json());
    const [row] = await testDatabase.db
      .select()
      .from(order)
      .where(eq(order.publicToken, created.publicToken));
    expect(row?.status).toBe("draft");
    expect(row?.shortCode).toBe(created.shortCode);
    const photoList = await currentPhotoRowList(row?.orderId ?? "");
    expect(photoList.map((photo) => photo.photoIndex)).toEqual([0, 1]);
    for (const photo of photoList) {
      const stored = dependencies.storage.objectMap.get(
        photoStorageKey(photo.orderId, photo.orderPhotoId),
      );
      const thumbnail = dependencies.storage.objectMap.get(
        photoThumbnailStorageKey(photo.orderId, photo.orderPhotoId),
      );
      expect(photo.storageKey).toBe(photoStorageKey(photo.orderId, photo.orderPhotoId));
      expect(stored?.contentType).toBe("image/jpeg");
      expect(thumbnail?.contentType).toBe("image/jpeg");
      expect(photo.contentHash).toBe(
        createHash("sha256")
          .update(stored?.body ?? new Uint8Array())
          .digest("hex"),
      );
      const metadata = await sharp(stored?.body).metadata();
      expect([metadata.format, metadata.exif, metadata.orientation]).toEqual([
        "jpeg",
        undefined,
        undefined,
      ]);
      expect([photo.width, photo.height]).toEqual([metadata.width ?? 0, metadata.height ?? 0]);
    }
    expect(photoList[0]?.height).toBe(1600);
    const jobList = await testDatabase.db.select().from(job);
    expect(
      jobList.map(({ name, status, payload, singletonKey }) => ({
        name,
        status,
        payload,
        singletonKey,
      })),
    ).toEqual([
      {
        name: "order.analyze",
        status: "pending",
        payload: { name: "order.analyze", orderId: row?.orderId },
        singletonKey: row?.orderId ?? null,
      },
    ]);
    expect(dependencies.storage.objectMap.size).toBe(4);
  });

  it("recusa entrada inválida antes de reservar vaga, com o photoIndex da foto", async () => {
    const { app } = setup();
    const jpeg = photoFile(await syntheticJpeg(1), "a.jpg");
    const heic = photoFile(
      new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]),
      "iphone.heic",
      "image/heic",
    );
    const oversized = photoFile(
      new Uint8Array([0xff, 0xd8, 0xff, ...new Uint8Array(MAX_PHOTO_BYTES)]),
      "grande.jpg",
    );
    await expectApiError(
      await postOrder(app, orderForm([jpeg], { grade: "8" })),
      400,
      "validation_error",
    );
    await expectApiError(
      await postOrder(app, orderForm([jpeg], { subject: "ciencias" })),
      400,
      "validation_error",
    );
    await expectApiError(await postOrder(app, orderForm([])), 400, "validation_error");
    await expectApiError(
      await postOrder(app, orderForm(Array.from({ length: 6 }, () => jpeg))),
      400,
      "too_many_photos",
    );
    await expectApiError(
      await postOrder(app, orderForm([jpeg, oversized])),
      413,
      "photo_too_large",
      1,
    );
    await expectApiError(await postOrder(app, orderForm([jpeg, heic])), 422, "photo_invalid", 1);
    expect(await testDatabase.db.$count(previewRequest)).toBe(0);
    expect(await testDatabase.db.$count(order)).toBe(0);
  });

  it("foto que não decodifica e foto repetida no mesmo envio são recusadas depois da reserva", async () => {
    const { app, dependencies } = setup();
    const jpegBytes = await syntheticJpeg(3);
    const garbage = photoFile(
      new Uint8Array([0xff, 0xd8, 0xff, ...new Uint8Array(200).fill(7)]),
      "lixo.jpg",
    );
    await expectApiError(await postOrder(app, orderForm([garbage])), 422, "photo_invalid", 0);
    await expectApiError(
      await postOrder(
        app,
        orderForm([photoFile(jpegBytes, "a.jpg"), photoFile(jpegBytes, "copia.jpg")]),
      ),
      422,
      "photo_duplicate",
      1,
    );
    expect(await testDatabase.db.$count(previewRequest)).toBe(2);
    expect(await testDatabase.db.$count(order)).toBe(0);
    expect(dependencies.storage.objectMap.size).toBe(0);
  });

  it("colisão de short_code gera outro código e o pedido sai", async () => {
    let shortCodeDrawCount = 0;
    const { app } = setup({
      randomBytes: (length) => {
        if (length !== SHORT_CODE_LENGTH)
          return new Uint8Array(crypto.getRandomValues(new Uint8Array(length)));
        shortCodeDrawCount += 1;
        return shortCodeDrawCount === 1
          ? new Uint8Array(length)
          : crypto.getRandomValues(new Uint8Array(length));
      },
    });
    await testDatabase.db.insert(order).values({
      publicToken: "Zz3_-cdEfGhIjKlMnOpQrStUvWxYz0123456789abcQ",
      shortCode: "GZ-AAAAAA",
      grade: "5",
      subject: "math",
    });
    const created = await createdOrder(app, 1);
    expect(created.shortCode).not.toBe("GZ-AAAAAA");
    expect(shortCodeDrawCount).toBe(2);
  });

  it("colisão em todas as tentativas dá 500 e remove do storage tudo o que subiu", async () => {
    const { app, dependencies } = setup({ randomBytes: (length) => new Uint8Array(length) });
    await testDatabase.db.insert(order).values({
      publicToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      shortCode: "GZ-AAAAAA",
      grade: "5",
      subject: "math",
    });
    const response = await postOrder(app, orderForm([photoFile(await syntheticJpeg(4), "a.jpg")]));
    await expectApiError(response, 500, "internal_error");
    expect(dependencies.storage.objectMap.size).toBe(0);
    expect(dependencies.storage.deletedKeyList).toHaveLength(2);
    expect(await testDatabase.db.$count(order)).toBe(1);
    expect(await testDatabase.db.$count(orderPhoto)).toBe(0);
    expect(await testDatabase.db.$count(job)).toBe(0);
  });

  it("falha no insert do job não deixa pedido nem foto e remove os objetos (mesma transação)", async () => {
    const { app, dependencies } = setup();
    await withFailingJobInsert(async () => {
      const response = await postOrder(
        app,
        orderForm([
          photoFile(await syntheticJpeg(8), "a.jpg"),
          photoFile(await syntheticJpeg(9), "b.jpg"),
        ]),
      );
      await expectApiError(response, 500, "internal_error");
    });
    expect(await testDatabase.db.$count(order)).toBe(0);
    expect(await testDatabase.db.$count(orderPhoto)).toBe(0);
    expect(await testDatabase.db.$count(job)).toBe(0);
    expect(dependencies.storage.objectMap.size).toBe(0);
    expect(dependencies.storage.deletedKeyList).toHaveLength(4);
  });

  it("falha do storage na 3ª gravação dá 503 e remove as duas primeiras e tenta a terceira", async () => {
    const { app, dependencies } = setup();
    dependencies.storage.failPutAfter(2);
    const response = await postOrder(
      app,
      orderForm([
        photoFile(await syntheticJpeg(5), "a.jpg"),
        photoFile(await syntheticJpeg(6), "b.jpg"),
      ]),
    );
    await expectApiError(response, 503, "service_unavailable");
    expect(dependencies.storage.objectMap.size).toBe(0);
    expect(dependencies.storage.deletedKeyList).toHaveLength(3);
    expect(await testDatabase.db.$count(order)).toBe(0);
  });

  it("falha também na remoção só vira log, e a resposta continua com o erro original", async () => {
    const { app, dependencies, readEntryList } = setup();
    dependencies.storage.failPutAfter(1);
    dependencies.storage.failNextDelete();
    const response = await postOrder(app, orderForm([photoFile(await syntheticJpeg(7), "a.jpg")]));
    await expectApiError(response, 503, "service_unavailable");
    const warn = readEntryList().find((entry) => entry.msg === "remoção no storage falhou");
    expect(warn).toMatchObject({ errorCode: "storage_unavailable" });
    expect(typeof warn?.orderId).toBe("string");
  });
});

describe("GET /orders/:token (RF-04)", () => {
  it("draft traz as miniaturas assinadas na ordem, sem cache", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 3);
    const response = await getOrder(app, created.publicToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const view = orderViewSchema.parse(await response.json());
    if (!("photoList" in view)) throw new Error("draft sem photoList");
    expect(view).toMatchObject({
      status: "draft",
      grade: "5",
      subject: "math",
      shortCode: created.shortCode,
    });
    expect(view.photoList.map((photo) => photo.photoIndex)).toEqual([0, 1, 2]);
    for (const photo of view.photoList) {
      expect(photo.thumbnailUrl).toContain(
        `${photoThumbnailStorageKey(created.orderId, photo.orderPhotoId)}?X-Amz-Expires=600`,
      );
      expect(photo.legibilityScore).toBeNull();
    }
  });

  it("draft com a análise pendente traz analysisFailure nula e fotos sem avaliação (spec F2-02, RF-10)", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 2);
    const view = orderViewSchema.parse(await (await getOrder(app, created.publicToken)).json());
    if (view.status !== "draft") throw new Error("esperava draft");
    expect(view.analysisFailure).toBeNull();
    for (const photo of view.photoList) {
      expect(photo).toMatchObject({ isUsable: null, photoIssueList: [], legibilityScore: null });
    }
  });

  it("draft depois da falha traz o aviso, os não atendidos e o motivo de cada foto (spec F2-02, RF-10)", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 2);
    await setAnalysis(created.orderId, "draft", failedAnalysis);
    const view = orderViewSchema.parse(await (await getOrder(app, created.publicToken)).json());
    if (view.status !== "draft") throw new Error("esperava draft");
    expect(view.analysisFailure).toEqual({
      failCode: "only_unsupported_topics",
      isMaterialMismatch: false,
      unsupportedTopicList: [
        { unsupportedTopicId: "ma-grid-symmetry", label: expect.any(String), reason: "figure" },
      ],
    });
    expect(
      view.photoList.map(({ isUsable, photoIssueList, legibilityScore }) => ({
        isUsable,
        photoIssueList,
        legibilityScore,
      })),
    ).toEqual([
      { isUsable: true, photoIssueList: [], legibilityScore: 1 },
      { isUsable: false, photoIssueList: ["blurry", "dark"], legibilityScore: 0 },
    ]);
  });

  it("preview_ready traz assuntos com rótulo, não atendidos, perfil resumido e o kit, sem texto do material (spec F2-02, RF-10)", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 2);
    await setAnalysis(created.orderId, "preview_ready", previewAnalysis);
    const body = await (await getOrder(app, created.publicToken)).json();
    const view = orderViewSchema.parse(body);
    if (view.status !== "preview_ready") throw new Error("esperava preview_ready");
    expect(view.topicCandidateList).toEqual([
      { topicId: "ma5-equivalent-fractions", label: expect.any(String), confidence: "high" },
      { topicId: "ma5-fractions", label: expect.any(String), confidence: "medium" },
    ]);
    expect(view.unsupportedTopicList.map((topic) => topic.unsupportedTopicId)).toEqual([
      "ma-grid-symmetry",
    ]);
    expect(view.materialProfile).toEqual({
      exerciseFormatList: ["computation", "word_problem"],
      notationList: ["fraction_slash"],
      isHandwritten: true,
    });
    expect(view.kitPreview).toEqual(kitPreview);
    expect(view.photoList[1]).toMatchObject({
      isUsable: false,
      photoIssueList: ["blurry", "dark"],
    });
    const serialized = JSON.stringify(body);
    for (const leaked of [
      "evidence",
      EVIDENCE_TEXT,
      "terminologyList",
      TERMINOLOGY_TEXT,
      "contextThemeList",
      CONTEXT_THEME_TEXT,
      "issueList",
      "sourceWarningList",
      "personal_data_visible",
      "apparentLevel",
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("análise gravada fora do schema dá 500 e loga o orderId com código estável, sem o conteúdo", async () => {
    const { app, readEntryList } = setup();
    const created = await createdOrder(app, 1);
    await testDatabase.db
      .update(order)
      .set({ analysis: { outcome: "preview_ready", nota: EVIDENCE_TEXT } })
      .where(eq(order.orderId, created.orderId));
    await expectApiError(await getOrder(app, created.publicToken), 500, "internal_error");
    const entry = readEntryList().find((item) => item.msg === "análise gravada fora do schema");
    expect(entry).toMatchObject({ orderId: created.orderId, errorCode: "order_analysis_invalid" });
    expect(JSON.stringify(readEntryList())).not.toContain(EVIDENCE_TEXT);
  });

  it("depois da prévia, só os campos base", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 1);
    await setOrderStatus(created.orderId, "paid");
    const view = orderViewSchema.parse(await (await getOrder(app, created.publicToken)).json());
    expect(view.status).toBe("paid");
    expect(view).not.toHaveProperty("photoList");
  });

  it("token mal formado e token inexistente dão o mesmo 404 neutro", async () => {
    const { app } = setup();
    const malformed = await getOrder(app, "curto");
    const unknown = await getOrder(app, "Ab3_-cdEfGhIjKlMnOpQrStUvWxYz0123456789abcQ");
    expect([malformed.status, unknown.status]).toEqual([404, 404]);
    expect(await malformed.json()).toEqual(await unknown.json());
  });
});

describe("PUT /orders/:token/photos (RF-05)", () => {
  it("em preview_ready, troca duas fotos numa chamada, volta a draft e enfileira uma análise", async () => {
    const { app, dependencies, settleBackgroundTasks } = setup();
    const created = await createdOrder(app, 3);
    await testDatabase.db.update(job).set({ status: "completed", finishDatetime: new Date() });
    await setAnalysis(created.orderId, "preview_ready", previewAnalysis);
    await testDatabase.db
      .update(order)
      .set({ materialProfile: { exerciseFormatList: [] } })
      .where(eq(order.orderId, created.orderId));
    const [first, second, third] = await currentPhotoRowList(created.orderId);
    const response = await putPhotos(
      app,
      created.publicToken,
      replaceForm([
        [first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(40), "nova-1.jpg")],
        [third?.orderPhotoId ?? "", photoFile(await syntheticJpeg(41), "nova-3.jpg")],
      ]),
    );
    expect(response.status).toBe(200);
    const view = orderViewSchema.parse(await response.json());
    expect(view.status).toBe("draft");
    const [row] = await testDatabase.db
      .select()
      .from(order)
      .where(eq(order.orderId, created.orderId));
    expect(row?.materialProfile).toBeNull();
    expect(row?.analysis).toBeNull();
    if (view.status !== "draft") throw new Error("esperava draft");
    expect(view.analysisFailure).toBeNull();
    const currentList = await currentPhotoRowList(created.orderId);
    expect(currentList[1]?.orderPhotoId).toBe(second?.orderPhotoId);
    expect(currentList.map((photo) => photo.legibilityScore)).toEqual([null, null, null]);
    expect(currentList.map((photo) => photo.photoIndex)).toEqual([0, 1, 2]);
    expect(currentList[0]?.orderPhotoId).not.toBe(first?.orderPhotoId);
    expect(currentList[2]?.orderPhotoId).not.toBe(third?.orderPhotoId);
    const replacedList = await testDatabase.db
      .select()
      .from(orderPhoto)
      .where(and(eq(orderPhoto.orderId, created.orderId), eq(orderPhoto.photoIndex, 0)));
    const replaced = replacedList.find((photo) => photo.orderPhotoId === first?.orderPhotoId);
    expect(replaced?.replacedDatetime).toBeInstanceOf(Date);
    expect(replaced?.deleteDatetime).toBeNull();
    const oldPhotoKey = photoStorageKey(created.orderId, first?.orderPhotoId ?? "");
    expect(dependencies.storage.objectMap.has(oldPhotoKey)).toBe(true);
    await settleBackgroundTasks();
    const [removed] = await testDatabase.db
      .select()
      .from(orderPhoto)
      .where(eq(orderPhoto.orderPhotoId, first?.orderPhotoId ?? ""));
    expect(removed?.deleteDatetime).toBeInstanceOf(Date);
    expect(dependencies.storage.objectMap.has(oldPhotoKey)).toBe(false);
    const pendingJobList = await testDatabase.db
      .select()
      .from(job)
      .where(eq(job.status, "pending"));
    expect(pendingJobList).toHaveLength(1);
    expect(await testDatabase.db.$count(previewRequest)).toBe(2);
  });

  it("em draft depois da falha, limpa o aviso e as notas e enfileira nova análise (spec F2-02, RF-09)", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 2);
    await testDatabase.db.update(job).set({ status: "completed", finishDatetime: new Date() });
    await setAnalysis(created.orderId, "draft", failedAnalysis);
    const [, second] = await currentPhotoRowList(created.orderId);
    const response = await putPhotos(
      app,
      created.publicToken,
      replaceForm([[second?.orderPhotoId ?? "", photoFile(await syntheticJpeg(70), "nova.jpg")]]),
    );
    expect(response.status).toBe(200);
    const view = orderViewSchema.parse(await response.json());
    if (view.status !== "draft") throw new Error("esperava draft");
    expect(view.analysisFailure).toBeNull();
    expect(view.photoList.map((photo) => [photo.legibilityScore, photo.isUsable])).toEqual([
      [null, null],
      [null, null],
    ]);
    const [row] = await testDatabase.db
      .select({ analysis: order.analysis })
      .from(order)
      .where(eq(order.orderId, created.orderId));
    expect(row?.analysis).toBeNull();
    const pendingJobList = await testDatabase.db
      .select()
      .from(job)
      .where(eq(job.status, "pending"));
    expect(pendingJobList).toHaveLength(1);
  });

  it("em draft com análise pendente, a troca não cria segundo job", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 2);
    const [first] = await currentPhotoRowList(created.orderId);
    const response = await putPhotos(
      app,
      created.publicToken,
      replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(50), "nova.jpg")]]),
    );
    expect(response.status).toBe(200);
    expect(await testDatabase.db.$count(job)).toBe(1);
  });

  it.each(["analyzing", "awaiting_payment", "paid"] as const)(
    "em %s dá 409 sem gravar nada no storage",
    async (status) => {
      const { app, dependencies } = setup();
      const created = await createdOrder(app, 1);
      await setOrderStatus(created.orderId, status);
      const [first] = await currentPhotoRowList(created.orderId);
      const objectCount = dependencies.storage.objectMap.size;
      const response = await putPhotos(
        app,
        created.publicToken,
        replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(60), "nova.jpg")]]),
      );
      await expectApiError(response, 409, "invalid_state");
      expect(dependencies.storage.objectMap.size).toBe(objectCount);
    },
  );

  it("foto de outro pedido, foto já trocada e token inexistente dão 404", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 1);
    const other = await createdOrder(app, 1);
    const [otherPhoto] = await currentPhotoRowList(other.orderId);
    const newPhoto = photoFile(await syntheticJpeg(70), "nova.jpg");
    await expectApiError(
      await putPhotos(
        app,
        created.publicToken,
        replaceForm([[otherPhoto?.orderPhotoId ?? "", newPhoto]]),
      ),
      404,
      "not_found",
    );
    const [ownPhoto] = await currentPhotoRowList(created.orderId);
    expect(
      (
        await putPhotos(
          app,
          created.publicToken,
          replaceForm([[ownPhoto?.orderPhotoId ?? "", newPhoto]]),
        )
      ).status,
    ).toBe(200);
    await expectApiError(
      await putPhotos(
        app,
        created.publicToken,
        replaceForm([
          [ownPhoto?.orderPhotoId ?? "", photoFile(await syntheticJpeg(71), "outra.jpg")],
        ]),
      ),
      404,
      "not_found",
    );
    await expectApiError(
      await putPhotos(app, "curto", replaceForm([[ownPhoto?.orderPhotoId ?? "", newPhoto]])),
      404,
      "order_not_found",
    );
  });

  it("foto igual a outra foto atual do pedido dá 422 com o índice da foto trocada", async () => {
    const { app, dependencies } = setup();
    const photoList = [
      photoFile(await syntheticJpeg(80), "a.jpg"),
      photoFile(await syntheticJpeg(81), "b.jpg"),
    ];
    const response = await postOrder(app, orderForm(photoList));
    const created = createOrderResponseSchema.parse(await response.json());
    const [row] = await testDatabase.db
      .select()
      .from(order)
      .where(eq(order.publicToken, created.publicToken));
    const [, second] = await currentPhotoRowList(row?.orderId ?? "");
    const objectCount = dependencies.storage.objectMap.size;
    await expectApiError(
      await putPhotos(
        app,
        created.publicToken,
        replaceForm([
          [second?.orderPhotoId ?? "", photoFile(await syntheticJpeg(80), "copia-da-a.jpg")],
        ]),
      ),
      422,
      "photo_duplicate",
      1,
    );
    expect(dependencies.storage.objectMap.size).toBe(objectCount);
  });

  it("duas trocas concorrentes da mesma foto: uma passa, a outra dá 404 e não deixa objeto", async () => {
    const { app, dependencies, settleBackgroundTasks } = setup();
    const created = await createdOrder(app, 1);
    const [first] = await currentPhotoRowList(created.orderId);
    const [left, right] = await Promise.all([
      putPhotos(
        app,
        created.publicToken,
        replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(90), "x.jpg")]]),
      ),
      putPhotos(
        app,
        created.publicToken,
        replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(91), "y.jpg")]]),
      ),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 404]);
    await settleBackgroundTasks();
    const currentList = await currentPhotoRowList(created.orderId);
    expect(currentList).toHaveLength(1);
    expect([...dependencies.storage.objectMap.keys()].sort()).toEqual(
      [
        photoStorageKey(created.orderId, currentList[0]?.orderPhotoId ?? ""),
        photoThumbnailStorageKey(created.orderId, currentList[0]?.orderPhotoId ?? ""),
      ].sort(),
    );
  });

  it("falha ao remover o objeto antigo não muda a resposta e deixa delete_datetime nulo", async () => {
    const { app, dependencies, settleBackgroundTasks, readEntryList } = setup();
    const created = await createdOrder(app, 1);
    const [first] = await currentPhotoRowList(created.orderId);
    dependencies.storage.failNextDelete();
    const response = await putPhotos(
      app,
      created.publicToken,
      replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(95), "nova.jpg")]]),
    );
    expect(response.status).toBe(200);
    await settleBackgroundTasks();
    const [replaced] = await testDatabase.db
      .select()
      .from(orderPhoto)
      .where(eq(orderPhoto.orderPhotoId, first?.orderPhotoId ?? ""));
    expect(replaced?.replacedDatetime).toBeInstanceOf(Date);
    expect(replaced?.deleteDatetime).toBeNull();
    expect(
      readEntryList().find((entry) => entry.msg === "remoção no storage falhou"),
    ).toMatchObject({
      orderId: created.orderId,
      orderPhotoId: first?.orderPhotoId,
      errorCode: "storage_unavailable",
    });
  });

  it("falha ao gravar delete_datetime depois da remoção só vira warn, e a troca continua gravada", async () => {
    const { app, dependencies, settleBackgroundTasks, readEntryList } = setup();
    const created = await createdOrder(app, 1);
    const [first] = await currentPhotoRowList(created.orderId);
    const response = await putPhotos(
      app,
      created.publicToken,
      replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(96), "nova.jpg")]]),
    );
    expect(response.status).toBe(200);
    await testDatabase.db.execute(
      sql.raw(`CREATE FUNCTION fail_photo_delete_mark() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'falha forçada no delete_datetime'; END $$`),
    );
    await testDatabase.db.execute(
      sql.raw(`CREATE TRIGGER fail_photo_delete_mark BEFORE UPDATE ON order_photo FOR EACH ROW
        WHEN (NEW.delete_datetime IS NOT NULL) EXECUTE FUNCTION fail_photo_delete_mark()`),
    );
    try {
      await settleBackgroundTasks();
    } finally {
      await testDatabase.db.execute(sql.raw("DROP TRIGGER fail_photo_delete_mark ON order_photo"));
      await testDatabase.db.execute(sql.raw("DROP FUNCTION fail_photo_delete_mark()"));
    }
    const [replaced] = await testDatabase.db
      .select()
      .from(orderPhoto)
      .where(eq(orderPhoto.orderPhotoId, first?.orderPhotoId ?? ""));
    expect(replaced?.replacedDatetime).toBeInstanceOf(Date);
    expect(replaced?.deleteDatetime).toBeNull();
    expect(
      dependencies.storage.objectMap.has(
        photoStorageKey(created.orderId, first?.orderPhotoId ?? ""),
      ),
    ).toBe(false);
    expect(
      readEntryList().find((entry) => entry.msg === "marcação da foto removida falhou"),
    ).toMatchObject({
      orderId: created.orderId,
      orderPhotoId: first?.orderPhotoId,
      errorCode: "photo_delete_mark_failed",
    });
  });

  it("falha no insert do job desfaz a troca inteira e remove os objetos novos", async () => {
    const { app, dependencies } = setup();
    const created = await createdOrder(app, 1);
    const analysis = await setAnalysis(created.orderId, "preview_ready", previewAnalysis);
    const [first] = await currentPhotoRowList(created.orderId);
    await testDatabase.db.delete(job);
    const objectKeyList = [...dependencies.storage.objectMap.keys()];
    await withFailingJobInsert(async () => {
      const response = await putPhotos(
        app,
        created.publicToken,
        replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(97), "nova.jpg")]]),
      );
      await expectApiError(response, 500, "internal_error");
    });
    const [row] = await testDatabase.db
      .select()
      .from(order)
      .where(eq(order.orderId, created.orderId));
    expect(row?.status).toBe("preview_ready");
    expect(row?.analysis).toEqual(analysis);
    const currentList = await currentPhotoRowList(created.orderId);
    expect(currentList.map((photo) => photo.orderPhotoId)).toEqual([first?.orderPhotoId ?? ""]);
    expect(currentList[0]?.legibilityScore).toBe(1);
    expect(await testDatabase.db.$count(orderPhoto)).toBe(1);
    expect([...dependencies.storage.objectMap.keys()].sort()).toEqual(objectKeyList.sort());
  });

  it("mais pares que MAX_PHOTO_COUNT dá 400 too_many_photos", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 1);
    const photo = photoFile(await syntheticJpeg(98), "nova.jpg");
    const response = await putPhotos(
      app,
      created.publicToken,
      replaceForm(Array.from({ length: 6 }, () => [crypto.randomUUID(), photo] as const)),
    );
    await expectApiError(response, 400, "too_many_photos");
  });

  it("duas trocas concorrentes de fotos diferentes para o mesmo conteúdo: a segunda cai na duplicata sob o lock", async () => {
    const { app, dependencies, settleBackgroundTasks } = setup();
    const created = await createdOrder(app, 2);
    const [first, second] = await currentPhotoRowList(created.orderId);
    const sameContent = await syntheticJpeg(99);
    const [left, right] = await Promise.all([
      putPhotos(
        app,
        created.publicToken,
        replaceForm([[first?.orderPhotoId ?? "", photoFile(sameContent, "x.jpg")]]),
      ),
      putPhotos(
        app,
        created.publicToken,
        replaceForm([[second?.orderPhotoId ?? "", photoFile(sameContent, "y.jpg")]]),
      ),
    ]);
    const statusList = [left.status, right.status].sort();
    expect(statusList).toEqual([200, 422]);
    const loser = left.status === 422 ? left : right;
    const loserBody = apiErrorSchema.parse(await loser.json());
    expect(loserBody.code).toBe("photo_duplicate");
    await settleBackgroundTasks();
    const currentList = await currentPhotoRowList(created.orderId);
    expect(new Set(currentList.map((photo) => photo.contentHash)).size).toBe(2);
    expect(dependencies.storage.objectMap.size).toBe(4);
  });
});

describe("rate limit da prévia (RF-06)", () => {
  it(`o envio além de ${PREVIEW_RATE_LIMIT_PER_HOUR.device} por hora do mesmo dispositivo dá 429 challenge_required`, async () => {
    const { app } = setup();
    await insertPreviewRequestList(PREVIEW_RATE_LIMIT_PER_HOUR.device, {
      deviceHash: hmac(`device:${DEVICE_ID}`),
    });
    await expectApiError(
      await postOrder(app, orderForm([photoFile(await syntheticJpeg(100), "a.jpg")])),
      429,
      "challenge_required",
    );
    expect(await testDatabase.db.$count(order)).toBe(0);
    const freshDevice = await postOrder(
      app,
      orderForm([photoFile(await syntheticJpeg(101), "a.jpg")]),
      clientHeaders({ deviceId: null }),
    );
    expect(freshDevice.status).toBe(201);
  });

  it("dispositivos diferentes no mesmo IP param no limite do IP, e o limite do dia também vale", async () => {
    const { app } = setup();
    await insertPreviewRequestList(PREVIEW_RATE_LIMIT_PER_HOUR.ip, {
      clientIpHash: hmac(`ip:${CLIENT_IP}`),
    });
    await expectApiError(
      await postOrder(
        app,
        orderForm([photoFile(await syntheticJpeg(102), "a.jpg")]),
        clientHeaders({ deviceId: null }),
      ),
      429,
      "challenge_required",
    );
    await truncateAllTables(testDatabase.db);
    await insertPreviewRequestList(PREVIEW_RATE_LIMIT_PER_DAY.device, {
      deviceHash: hmac(`device:${DEVICE_ID}`),
      insertDatetime: new Date(Date.now() - 3 * MILLISECONDS_PER_HOUR),
    });
    await expectApiError(
      await postOrder(app, orderForm([photoFile(await syntheticJpeg(103), "a.jpg")])),
      429,
      "challenge_required",
    );
  });

  it("dois endereços do mesmo /64 contam juntos, e o X-Forwarded-For forjado à esquerda não conta", async () => {
    const { app } = setup();
    await insertPreviewRequestList(PREVIEW_RATE_LIMIT_PER_HOUR.ip, {
      clientIpHash: hmac("ip:2804:14c:1:2::/64"),
    });
    await expectApiError(
      await postOrder(app, orderForm([photoFile(await syntheticJpeg(104), "a.jpg")]), {
        "x-forwarded-for": "198.51.100.9, 2804:14c:1:2:abcd::77",
      }),
      429,
      "challenge_required",
    );
    const otherSubnet = await postOrder(
      app,
      orderForm([photoFile(await syntheticJpeg(105), "a.jpg")]),
      { "x-forwarded-for": "2804:14c:1:2::1, 2804:14c:1:3::1" },
    );
    expect(otherSubnet.status).toBe(201);
  });

  it("a troca de fotos também gasta vaga", async () => {
    const { app } = setup();
    const created = await createdOrder(app, 1);
    const [first] = await currentPhotoRowList(created.orderId);
    await insertPreviewRequestList(PREVIEW_RATE_LIMIT_PER_HOUR.device - 1, {
      deviceHash: hmac(`device:${DEVICE_ID}`),
    });
    await expectApiError(
      await putPhotos(
        app,
        created.publicToken,
        replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(106), "nova.jpg")]]),
      ),
      429,
      "challenge_required",
    );
  });

  it("reservas concorrentes no limite não passam do teto", async () => {
    const keys = { clientIpHash: hmac("ip:192.0.2.50"), deviceHash: hmac("device:concorrente") };
    await insertPreviewRequestList(PREVIEW_RATE_LIMIT_PER_HOUR.device - 1, {
      deviceHash: keys.deviceHash,
    });
    const resultList = await Promise.all(
      Array.from({ length: 5 }, () => reservePreviewRequest(testDatabase.db, keys, new Date())),
    );
    expect(resultList.filter((result) => result.ok)).toHaveLength(1);
    expect(
      await testDatabase.db.$count(previewRequest, eq(previewRequest.deviceHash, keys.deviceHash)),
    ).toBe(PREVIEW_RATE_LIMIT_PER_HOUR.device);
  });

  it("apaga as linhas com mais de 24 h e não guarda IP nem cookie em claro", async () => {
    await insertPreviewRequestList(1, {
      insertDatetime: new Date(Date.now() - 25 * MILLISECONDS_PER_HOUR),
    });
    const { app } = setup();
    expect(
      (await postOrder(app, orderForm([photoFile(await syntheticJpeg(107), "a.jpg")]))).status,
    ).toBe(201);
    const rowList = await testDatabase.db.select().from(previewRequest);
    expect(rowList).toHaveLength(1);
    for (const row of rowList) {
      expect(row.clientIpHash).toBe(hmac(`ip:${CLIENT_IP}`));
      expect(row.deviceHash).toBe(hmac(`device:${DEVICE_ID}`));
      expect(JSON.stringify(row)).not.toContain(CLIENT_IP);
      expect(JSON.stringify(row)).not.toContain(DEVICE_ID);
    }
  });
});

describe("logs sem dado pessoal (RF-10)", () => {
  it("criação, troca, 429 e 503 não logam token, IP, cookie nem nome de arquivo, e a falha leva orderId", async () => {
    const { app, dependencies, lineList, readEntryList, waitForEntryList } = setup();
    const created = await createdOrder(app, 1);
    const [first] = await currentPhotoRowList(created.orderId);
    await putPhotos(
      app,
      created.publicToken,
      replaceForm([
        [first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(110), "nome-da-crianca.jpg")],
      ]),
    );
    const [replacedFirst] = await currentPhotoRowList(created.orderId);
    dependencies.storage.failNextPut();
    await putPhotos(
      app,
      created.publicToken,
      replaceForm([
        [replacedFirst?.orderPhotoId ?? "", photoFile(await syntheticJpeg(113), "boletim.jpg")],
      ]),
    );
    dependencies.storage.failNextPut();
    await postOrder(app, orderForm([photoFile(await syntheticJpeg(111), "escola-tal.jpg")]));
    await insertPreviewRequestList(PREVIEW_RATE_LIMIT_PER_HOUR.device, {
      deviceHash: hmac(`device:${DEVICE_ID}`),
    });
    await postOrder(app, orderForm([photoFile(await syntheticJpeg(112), "caderno.jpg")]));
    await waitForEntryList(
      (entryList) => entryList.filter((entry) => entry.msg === "request").length === 5,
    );
    const logText = lineList.join("\n");
    for (const forbidden of [
      created.publicToken,
      CLIENT_IP,
      DEVICE_ID,
      "nome-da-crianca",
      "boletim",
      "escola-tal",
      "caderno-0",
    ]) {
      expect(logText).not.toContain(forbidden);
    }
    const entryList = readEntryList();
    expect(entryList.find((entry) => entry.msg === "pedido criado")).toMatchObject({
      orderId: created.orderId,
      photoCount: 1,
    });
    expect(entryList.find((entry) => entry.msg === "troca de fotos recusada")).toMatchObject({
      orderId: created.orderId,
      photoCount: 1,
      errorCode: "service_unavailable",
    });
    expect(entryList.find((entry) => entry.msg === "pedido recusado")).toMatchObject({
      photoCount: 1,
      errorCode: "service_unavailable",
    });
    expect(typeof entryList.find((entry) => entry.msg === "pedido recusado")?.orderId).toBe(
      "string",
    );
    expect(entryList.find((entry) => entry.msg === "fotos trocadas")).toMatchObject({
      orderId: created.orderId,
    });
    expect(
      entryList.filter((entry) => entry.msg === "request").map((entry) => entry.errorCode),
    ).toEqual(expect.arrayContaining(["service_unavailable", "challenge_required"]));
  });
});
