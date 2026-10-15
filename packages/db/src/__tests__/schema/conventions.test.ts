import { describe, expect, it } from "bun:test";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "#src/schema/index.ts";
import { tableList } from "#src/schema/index.ts";

const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

const exportedTableEntryList = (Object.entries(schema) as [string, unknown][]).filter(
  (entry): entry is [string, PgTable] => is(entry[1], PgTable),
);

const expectedIndexMap: Record<string, { name: string; unique: boolean; partial?: boolean }[]> = {
  order: [
    { name: "order_public_token_idx", unique: true },
    { name: "order_short_code_idx", unique: true },
    { name: "order_status_update_datetime_idx", unique: false },
    { name: "order_email_idx", unique: false },
  ],
  order_photo: [
    { name: "order_photo_order_id_idx", unique: false },
    { name: "order_photo_delete_datetime_insert_datetime_idx", unique: false },
  ],
  charge: [
    { name: "charge_order_id_idx", unique: false },
    { name: "charge_gateway_payment_id_idx", unique: true, partial: true },
    { name: "charge_status_expire_datetime_idx", unique: false },
  ],
  kit: [
    { name: "kit_order_id_idx", unique: false },
    { name: "kit_delete_datetime_published_datetime_idx", unique: false },
  ],
  ai_call: [{ name: "ai_call_order_id_idx", unique: false }],
  webhook_event: [{ name: "webhook_event_source_external_id_idx", unique: true }],
  notification: [{ name: "notification_order_id_kind_channel_idx", unique: true }],
  support_ticket: [
    { name: "support_ticket_order_id_idx", unique: false },
    { name: "support_ticket_status_idx", unique: false },
  ],
};

describe("convenções do schema", () => {
  it("tableList contém exatamente as oito tabelas exportadas", () => {
    const exportedNameList = exportedTableEntryList.map(([, table]) => getTableName(table)).sort();
    const listedNameList: string[] = tableList.map((table) => getTableName(table)).sort();
    expect(listedNameList).toEqual(exportedNameList);
    expect(tableList).toHaveLength(8);
  });

  it("export Drizzle é o camelCase singular do nome da tabela", () => {
    for (const [exportName, table] of exportedTableEntryList) {
      expect(exportName).toBe(toCamelCase(getTableName(table)));
    }
  });

  for (const table of tableList) {
    const config = getTableConfig(table);

    describe(config.name, () => {
      it("nome em snake_case singular", () => {
        expect(config.name).toMatch(SNAKE_CASE_PATTERN);
        expect(config.name.endsWith("s")).toBe(false);
      });

      it("PK uuid chamada {tabela}_id com default gerado", () => {
        const primaryColumnList = config.columns.filter((column) => column.primary);
        expect(primaryColumnList).toHaveLength(1);
        const primaryColumn = primaryColumnList[0];
        expect(primaryColumn?.name).toBe(`${config.name}_id`);
        expect(primaryColumn?.getSQLType()).toBe("uuid");
        expect(primaryColumn?.hasDefault).toBe(true);
      });

      it("colunas em snake_case, nenhuma termina em _at", () => {
        for (const column of config.columns) {
          expect(column.name).toMatch(SNAKE_CASE_PATTERN);
          expect(column.name.endsWith("_at")).toBe(false);
        }
      });

      it("insert_datetime e update_datetime são timestamptz not null com default", () => {
        for (const name of ["insert_datetime", "update_datetime"]) {
          const column = config.columns.find((candidate) => candidate.name === name);
          expect(column).toBeDefined();
          expect(column?.notNull).toBe(true);
          expect(column?.hasDefault).toBe(true);
          expect(column?.getSQLType()).toBe("timestamp with time zone");
        }
      });

      it("toda coluna _datetime é timestamptz", () => {
        const datetimeColumnList = config.columns.filter((column) =>
          column.name.endsWith("_datetime"),
        );
        expect(datetimeColumnList.length).toBeGreaterThanOrEqual(2);
        for (const column of datetimeColumnList) {
          expect(column.getSQLType()).toBe("timestamp with time zone");
        }
      });

      it("FKs carregam o nome da PK referenciada e têm onDelete explícito", () => {
        for (const foreignKey of config.foreignKeys) {
          const reference = foreignKey.reference();
          expect(reference.columns).toHaveLength(1);
          expect(reference.foreignColumns).toHaveLength(1);
          const localName = reference.columns[0]?.name ?? "";
          const foreignName = reference.foreignColumns[0]?.name ?? "";
          expect(foreignName).toBe(`${getTableName(reference.foreignTable)}_id`);
          expect(localName.endsWith(foreignName)).toBe(true);
          expect(foreignKey.onDelete).toBeDefined();
          expect(foreignKey.onDelete).not.toBe("no action");
        }
      });

      it("tem os índices obrigatórios do data-model", () => {
        const expectedList = expectedIndexMap[config.name];
        expect(expectedList).toBeDefined();
        const actualList = config.indexes.map((index) => ({
          name: index.config.name,
          unique: index.config.unique,
          partial: index.config.where !== undefined,
        }));
        for (const expected of expectedList ?? []) {
          expect(actualList).toContainEqual({
            name: expected.name,
            unique: expected.unique,
            partial: expected.partial ?? false,
          });
        }
        expect(actualList).toHaveLength(expectedList?.length ?? -1);
      });
    });
  }

  it("toda FK para order usa restrict e a autorreferência de kit usa set null", () => {
    for (const table of tableList) {
      for (const foreignKey of getTableConfig(table).foreignKeys) {
        const foreignTableName = getTableName(foreignKey.reference().foreignTable);
        expect(foreignKey.onDelete).toBe(foreignTableName === "order" ? "restrict" : "set null");
      }
    }
  });
});
