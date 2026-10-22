import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { getTableName, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { MIGRATIONS_FOLDER, runMigrations } from "#src/migrations.ts";
import { tableList } from "#src/schema/index.ts";
import { createTestDatabase, type TestDatabase } from "#src/test-helpers/index.ts";

const MIGRATION_COUNT = readdirSync(MIGRATIONS_FOLDER).filter((file) =>
  file.endsWith(".sql"),
).length;

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
  it("cria as tabelas do schema no public", async () => {
    const nameList = await selectColumn(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
      "table_name",
    );
    expect(nameList).toEqual(tableList.map((table) => getTableName(table)).sort());
  });

  it("cria os quinze enums", async () => {
    const nameList = await selectColumn(
      sql`SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typtype = 'e' AND n.nspname = 'public' ORDER BY t.typname`,
      "typname",
    );
    expect(nameList).toEqual([
      "ai_stage",
      "charge_status",
      "grade",
      "job_name",
      "job_status",
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

  it("cria todo índice declarado no schema, com os uniques e os parciais", async () => {
    const rowList = (await testDatabase.db.execute(
      sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    )) as unknown as { indexname: string; indexdef: string }[];
    const indexMap = new Map(Array.from(rowList).map((row) => [row.indexname, row.indexdef]));
    const declaredNameList = tableList.flatMap((table) =>
      getTableConfig(table).indexes.map((index) => index.config.name ?? ""),
    );
    expect(declaredNameList).toHaveLength(31);
    for (const name of declaredNameList) {
      expect(indexMap.has(name)).toBe(true);
    }
    expect(indexMap.get("charge_gateway_payment_id_idx")).toContain("UNIQUE");
    expect(indexMap.get("charge_gateway_payment_id_idx")).toContain(
      "WHERE (gateway_payment_id IS NOT NULL)",
    );
    expect(indexMap.get("order_public_token_idx")).toContain("UNIQUE");
    expect(indexMap.get("order_photo_order_id_photo_index_idx")).toContain("UNIQUE");
    expect(indexMap.get("order_photo_order_id_photo_index_idx")).toContain(
      "WHERE (replaced_datetime IS NULL)",
    );
    expect(indexMap.get("job_name_singleton_key_idx")).toContain("UNIQUE");
    expect(indexMap.get("job_name_singleton_key_idx")).toContain("singleton_key IS NOT NULL");
    expect(indexMap.get("job_pending_name_run_after_datetime_idx")).toContain(
      "WHERE (status = 'pending'::job_status)",
    );
    expect(indexMap.get("job_active_lock_expire_datetime_idx")).toContain(
      "WHERE (status = 'active'::job_status)",
    );
    expect(indexMap.get("job_failed_finish_datetime_idx")).toContain(
      "WHERE (status = 'failed'::job_status)",
    );
    expect(indexMap.has("job_status_name_run_after_datetime_idx")).toBe(false);
    expect(indexMap.has("job_status_lock_expire_datetime_idx")).toBe(false);
    expect(indexMap.get("charge_gateway_gateway_order_id_idx")).toContain("UNIQUE");
    expect(indexMap.get("order_whatsapp_phone_idx")).toContain(
      "WHERE (whatsapp_phone IS NOT NULL)",
    );
    expect(indexMap.get("order_photo_content_hash_idx")).toContain("(content_hash)");
    expect(indexMap.get("notification_order_id_kind_channel_recipient_hash_idx")).toContain(
      "UNIQUE",
    );
  });

  it("rodar as migrations de novo é no-op", async () => {
    await runMigrations(testDatabase.db);
    const countList = await selectColumn(
      sql`SELECT count(*)::text AS total FROM drizzle.__drizzle_migrations`,
      "total",
    );
    expect(countList).toEqual([String(MIGRATION_COUNT)]);
  });
});
