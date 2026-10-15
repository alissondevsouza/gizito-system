import { describe, expect, it } from "bun:test";
import { createDatabase } from "#src/client.ts";

describe("createDatabase", () => {
  it("não conecta antes da primeira query e fecha sem erro", async () => {
    const { db, close } = createDatabase({
      databaseUrl: "postgres://user:secret@127.0.0.1:1/unreachable",
      maxConnections: 1,
    });
    expect(db.query.order).toBeDefined();
    await close();
  });
});
