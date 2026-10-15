import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { getTableName, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { runMigrations } from "#src/migrations.ts";
import { tableList } from "#src/schema/index.ts";
import { createTestDatabase, type TestDatabase } from "#src/test-helpers/index.ts";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

async function selectColumn(query: ReturnType<typeof sql>, column: string): Promise<string[]> {
  const rowList = (await testDatabase.db.execute(query)) as unknown as Record<string, string>[];
  return Array.from(rowList).map((row) => row[column] ?? "");
}

describe("migration do zero", () => {
  it("cria as oito tabelas do MVP no schema public", async () => {
    const nameList = await selectColumn(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
      "table_name",
    );
    expect(nameList).toEqual(tableList.map((table) => getTableName(table)).sort());
  });

  it("cria os treze enums", async () => {
    const nameList = await selectColumn(
      sql`SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND n.nspname = 'public' ORDER BY t.typname`,
      "typname",
    );
    expect(nameList).toEqual([
      "ai_stage",
      "charge_status",
      "grade",
      "notification_channel",
      "notification_kind",
      "notification_status",
      "order_status",
      "payment_gateway",
      "perceived_difficulty",
      "subject",
      "support_ticket_kind",
      "support_ticket_status",
      "webhook_source",
    ]);
  });

  it("instala o trigger de update_datetime em toda tabela", async () => {
    const nameList = await selectColumn(
      sql`SELECT event_object_table FROM information_schema.triggers WHERE trigger_name = 'set_update_datetime' AND event_manipulation = 'UPDATE' AND action_timing = 'BEFORE' ORDER BY event_object_table`,
      "event_object_table",
    );
    expect(nameList).toEqual(tableList.map((table) => getTableName(table)).sort());
  });

  it("cria todo índice declarado no schema, com o unique parcial de gateway_payment_id", async () => {
    const rowList = (await testDatabase.db.execute(
      sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    )) as unknown as { indexname: string; indexdef: string }[];
    const indexMap = new Map(Array.from(rowList).map((row) => [row.indexname, row.indexdef]));
    const declaredNameList = tableList.flatMap((table) =>
      getTableConfig(table).indexes.map((index) => index.config.name ?? ""),
    );
    expect(declaredNameList).toHaveLength(16);
    for (const name of declaredNameList) {
      expect(indexMap.has(name)).toBe(true);
    }
    expect(indexMap.get("charge_gateway_payment_id_idx")).toContain("UNIQUE");
    expect(indexMap.get("charge_gateway_payment_id_idx")).toContain(
      "WHERE (gateway_payment_id IS NOT NULL)",
    );
    expect(indexMap.get("order_public_token_idx")).toContain("UNIQUE");
  });

  it("rodar as migrations de novo é no-op", async () => {
    await runMigrations(testDatabase.db);
    const countList = await selectColumn(
      sql`SELECT count(*)::text AS total FROM drizzle.__drizzle_migrations`,
      "total",
    );
    expect(countList).toEqual(["1"]);
  });
});
