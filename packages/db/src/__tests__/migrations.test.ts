import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName } from "drizzle-orm";
import { z } from "zod";
import { MIGRATIONS_FOLDER } from "#src/migrations.ts";
import { tableList } from "#src/schema/index.ts";

const journalSchema = z.object({
  version: z.string(),
  dialect: z.literal("postgresql"),
  entries: z
    .array(
      z.object({
        idx: z.int().nonnegative(),
        version: z.string(),
        when: z.int().positive(),
        tag: z.string().regex(/^\d{4}_[a-z0-9-]+$/),
        breakpoints: z.literal(true),
      }),
    )
    .min(1),
});

const journal = journalSchema.parse(
  JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")),
);
const migrationSql = journal.entries
  .map((entry) => readFileSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), "utf8"))
  .join("\n");

describe("migrations", () => {
  it("journal válido, com idx sequencial e snapshot por entrada", () => {
    journal.entries.forEach((entry, position) => {
      expect(entry.idx).toBe(position);
      expect(existsSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`))).toBe(true);
      expect(
        existsSync(
          join(MIGRATIONS_FOLDER, "meta", `${String(position).padStart(4, "0")}_snapshot.json`),
        ),
      ).toBe(true);
    });
  });

  it("a primeira migration é 0000_fundacao", () => {
    expect(journal.entries[0]?.tag).toBe("0000_fundacao");
  });

  it("cria toda tabela do schema", () => {
    for (const table of tableList) {
      expect(migrationSql).toContain(`CREATE TABLE "${getTableName(table)}"`);
    }
  });

  it("define a função set_update_datetime", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION set_update_datetime()");
  });

  it("tem um trigger BEFORE UPDATE de update_datetime por tabela", () => {
    for (const table of tableList) {
      expect(migrationSql).toContain(
        `CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "${getTableName(table)}" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();`,
      );
    }
  });
});
