import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { orderPhotoSchema, orderSchema } from "@gizito/core";
import { eq, sql } from "drizzle-orm";
import {
  buildOrderInsert,
  buildOrderPhotoInsert,
  expectSqlState,
  FIXED_DATETIME,
  SQL_STATE,
} from "#src/__tests__/integration/helpers.ts";
import { order, orderPhoto } from "#src/schema/index.ts";
import { createTestDatabase, type TestDatabase } from "#src/test-helpers/index.ts";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

async function insertOrder(overrides: Partial<typeof order.$inferInsert> = {}) {
  const [row] = await testDatabase.db.insert(order).values(buildOrderInsert(overrides)).returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

describe("order", () => {
  it("insere um pedido com defaults e a linha passa no orderSchema do core", async () => {
    const row = await insertOrder();
    expect(row.status).toBe("draft");
    expect(row.topicIdList).toEqual([]);
    expect(row.email).toBeNull();
    expect(row.insertDatetime).toBeInstanceOf(Date);
    expect(row.updateDatetime.getTime()).toBe(row.insertDatetime.getTime());
    expect(orderSchema.parse(row)).toEqual(row);
  });

  it("guarda topic_id_list, material_profile e datas e devolve os mesmos valores", async () => {
    const row = await insertOrder({
      status: "preview_ready",
      email: "responsavel@example.com",
      topicIdList: ["fractions", "decimals"],
      materialProfile: { kind: "notebook", pageCount: 2 },
      perceivedDifficulty: "basic",
      whatsappPhone: "+5511999999999",
      whatsappConsentDatetime: FIXED_DATETIME,
    });
    const reloaded = await testDatabase.db.query.order.findFirst({
      where: eq(order.orderId, row.orderId),
    });
    expect(reloaded?.topicIdList).toEqual(["fractions", "decimals"]);
    expect(reloaded?.materialProfile).toEqual({ kind: "notebook", pageCount: 2 });
    expect(reloaded?.whatsappConsentDatetime?.getTime()).toBe(FIXED_DATETIME.getTime());
    expect(orderSchema.safeParse(reloaded).success).toBe(true);
  });

  it("grava topic_id_list como array e material_profile como objeto jsonb, não como string", async () => {
    const row = await insertOrder({
      topicIdList: ["fractions"],
      materialProfile: { kind: "notebook" },
    });
    const typeList = (await testDatabase.db.execute(
      sql`SELECT jsonb_typeof(topic_id_list) AS topic_type, jsonb_typeof(material_profile) AS profile_type, topic_id_list->>0 AS first_topic FROM "order" WHERE order_id = ${row.orderId}`,
    )) as unknown as { topic_type: string; profile_type: string; first_topic: string }[];
    expect(Array.from(typeList)).toEqual([
      { topic_type: "array", profile_type: "object", first_topic: "fractions" },
    ]);
  });

  it("trigger atualiza update_datetime a cada UPDATE, mesmo sem a coluna no SET", async () => {
    const pastDatetime = new Date("2020-01-01T00:00:00.000Z");
    const row = await insertOrder({ insertDatetime: pastDatetime, updateDatetime: pastDatetime });
    const [updated] = await testDatabase.db
      .update(order)
      .set({ noteText: "revisar frações" })
      .where(eq(order.orderId, row.orderId))
      .returning();
    expect(updated?.insertDatetime).toEqual(pastDatetime);
    expect(updated?.updateDatetime.getTime()).toBeGreaterThan(pastDatetime.getTime());
  });

  it("rejeita public_token e short_code repetidos", async () => {
    const row = await insertOrder();
    await expectSqlState(
      testDatabase.db.insert(order).values(buildOrderInsert({ publicToken: row.publicToken })),
      SQL_STATE.uniqueViolation,
    );
    await expectSqlState(
      testDatabase.db.insert(order).values(buildOrderInsert({ shortCode: row.shortCode })),
      SQL_STATE.uniqueViolation,
    );
  });

  it("rejeita telefone de WhatsApp sem consentimento e consentimento sem telefone", async () => {
    await expectSqlState(
      testDatabase.db.insert(order).values(buildOrderInsert({ whatsappPhone: "+5511999999999" })),
      SQL_STATE.checkViolation,
    );
    await expectSqlState(
      testDatabase.db
        .insert(order)
        .values(buildOrderInsert({ whatsappConsentDatetime: FIXED_DATETIME })),
      SQL_STATE.checkViolation,
    );
  });

  it("rejeita status fora do enum", async () => {
    await expectSqlState(
      testDatabase.db.execute(
        sql`INSERT INTO "order" (public_token, short_code, status, grade, subject) VALUES ('t', 'c', 'shipped', '5', 'math')`,
      ),
      SQL_STATE.invalidTextRepresentation,
    );
  });

  it("não apaga pedido com fotos: FK restrict", async () => {
    const row = await insertOrder();
    await testDatabase.db.insert(orderPhoto).values(buildOrderPhotoInsert(row.orderId));
    await expectSqlState(
      testDatabase.db.delete(order).where(eq(order.orderId, row.orderId)),
      SQL_STATE.foreignKeyViolation,
    );
  });
});

describe("order_photo", () => {
  it("lista as fotos do pedido pela relation photoList e a linha passa no orderPhotoSchema", async () => {
    const row = await insertOrder();
    await testDatabase.db
      .insert(orderPhoto)
      .values([buildOrderPhotoInsert(row.orderId), buildOrderPhotoInsert(row.orderId)]);
    const loaded = await testDatabase.db.query.order.findFirst({
      where: eq(order.orderId, row.orderId),
      with: { photoList: true, chargeList: true },
    });
    expect(loaded?.photoList).toHaveLength(2);
    expect(loaded?.chargeList).toHaveLength(0);
    for (const photo of loaded?.photoList ?? []) {
      expect(orderPhotoSchema.safeParse(photo).success).toBe(true);
    }
  });

  it("rejeita foto de pedido inexistente", async () => {
    await expectSqlState(
      testDatabase.db.insert(orderPhoto).values(buildOrderPhotoInsert(crypto.randomUUID())),
      SQL_STATE.foreignKeyViolation,
    );
  });

  it.each([
    ["width zero", { width: 0 }],
    ["height zero", { height: 0 }],
    ["legibility_score abaixo de 0", { legibilityScore: -0.1 }],
    ["legibility_score acima de 1", { legibilityScore: 1.5 }],
  ] as const)("rejeita %s", async (_, overrides) => {
    const row = await insertOrder();
    await expectSqlState(
      testDatabase.db.insert(orderPhoto).values(buildOrderPhotoInsert(row.orderId, overrides)),
      SQL_STATE.checkViolation,
    );
  });

  it("aceita legibility_score dentro de 0–1", async () => {
    const row = await insertOrder();
    const [photo] = await testDatabase.db
      .insert(orderPhoto)
      .values(buildOrderPhotoInsert(row.orderId, { legibilityScore: 0.75 }))
      .returning();
    expect(photo?.legibilityScore).toBeCloseTo(0.75);
  });
});
