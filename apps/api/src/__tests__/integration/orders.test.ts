import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import {
  type ApiErrorCode,
  apiErrorSchema,
  createOrderResponseSchema,
  MAX_PHOTO_BYTES,
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
import { and, asc, eq, isNull } from "drizzle-orm";
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
  const dependencies = buildAppDependencies(testDatabase.db, memoryLogger.logger, overrides);
  return { app: createApp(dependencies), dependencies, ...memoryLogger };
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

  it("falha do storage na 3ª gravação dá 503 e remove as duas primeiras", async () => {
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
    expect(dependencies.storage.deletedKeyList).toHaveLength(2);
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
    const { app, dependencies } = setup();
    const created = await createdOrder(app, 3);
    await testDatabase.db.update(job).set({ status: "completed", finishDatetime: new Date() });
    await testDatabase.db
      .update(order)
      .set({ status: "preview_ready", materialProfile: { exerciseFormatList: [] } })
      .where(eq(order.orderId, created.orderId));
    const [first, , third] = await currentPhotoRowList(created.orderId);
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
    const currentList = await currentPhotoRowList(created.orderId);
    expect(currentList.map((photo) => photo.photoIndex)).toEqual([0, 1, 2]);
    expect(currentList[0]?.orderPhotoId).not.toBe(first?.orderPhotoId);
    expect(currentList[2]?.orderPhotoId).not.toBe(third?.orderPhotoId);
    const replacedList = await testDatabase.db
      .select()
      .from(orderPhoto)
      .where(and(eq(orderPhoto.orderId, created.orderId), eq(orderPhoto.photoIndex, 0)));
    const replaced = replacedList.find((photo) => photo.orderPhotoId === first?.orderPhotoId);
    expect(replaced?.replacedDatetime).toBeInstanceOf(Date);
    expect(replaced?.deleteDatetime).toBeInstanceOf(Date);
    expect(
      dependencies.storage.objectMap.has(
        photoStorageKey(created.orderId, first?.orderPhotoId ?? ""),
      ),
    ).toBe(false);
    const pendingJobList = await testDatabase.db
      .select()
      .from(job)
      .where(eq(job.status, "pending"));
    expect(pendingJobList).toHaveLength(1);
    expect(await testDatabase.db.$count(previewRequest)).toBe(2);
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
    const { app, dependencies } = setup();
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
    const { app, dependencies } = setup();
    const created = await createdOrder(app, 1);
    const [first] = await currentPhotoRowList(created.orderId);
    dependencies.storage.failNextDelete();
    const response = await putPhotos(
      app,
      created.publicToken,
      replaceForm([[first?.orderPhotoId ?? "", photoFile(await syntheticJpeg(95), "nova.jpg")]]),
    );
    expect(response.status).toBe(200);
    const [replaced] = await testDatabase.db
      .select()
      .from(orderPhoto)
      .where(eq(orderPhoto.orderPhotoId, first?.orderPhotoId ?? ""));
    expect(replaced?.replacedDatetime).toBeInstanceOf(Date);
    expect(replaced?.deleteDatetime).toBeNull();
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
  it("criação, troca, 429 e 503 não logam token, IP, cookie nem nome de arquivo", async () => {
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
    dependencies.storage.failNextPut();
    await postOrder(app, orderForm([photoFile(await syntheticJpeg(111), "escola-tal.jpg")]));
    await insertPreviewRequestList(PREVIEW_RATE_LIMIT_PER_HOUR.device, {
      deviceHash: hmac(`device:${DEVICE_ID}`),
    });
    await postOrder(app, orderForm([photoFile(await syntheticJpeg(112), "caderno.jpg")]));
    await waitForEntryList(
      (entryList) => entryList.filter((entry) => entry.msg === "request").length === 4,
    );
    const logText = lineList.join("\n");
    for (const forbidden of [
      created.publicToken,
      CLIENT_IP,
      DEVICE_ID,
      "nome-da-crianca",
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
    expect(entryList.find((entry) => entry.msg === "fotos trocadas")).toMatchObject({
      orderId: created.orderId,
    });
    expect(
      entryList.filter((entry) => entry.msg === "request").map((entry) => entry.errorCode),
    ).toEqual(expect.arrayContaining(["service_unavailable", "challenge_required"]));
  });
});
