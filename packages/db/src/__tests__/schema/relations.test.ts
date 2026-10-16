import { describe, expect, it } from "bun:test";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  is,
  Many,
  One,
} from "drizzle-orm";
import * as schema from "#src/schema/index.ts";

const relationalConfig = extractTablesRelationalConfig(schema, createTableRelationsHelpers);

function relationMapOf(tableExportName: string) {
  return relationalConfig.tables[tableExportName]?.relations ?? {};
}

describe("relations", () => {
  it("order tem uma coleção com sufixo List para cada tabela filha", () => {
    const orderRelationMap = relationMapOf("order");
    expect(Object.keys(orderRelationMap).sort()).toEqual([
      "aiCallList",
      "chargeList",
      "kitList",
      "notificationList",
      "photoList",
      "supportTicketList",
    ]);
    for (const relation of Object.values(orderRelationMap)) {
      expect(is(relation, Many)).toBe(true);
    }
  });

  it("toda filha aponta de volta para order com one", () => {
    for (const name of ["orderPhoto", "charge", "kit", "aiCall", "notification", "supportTicket"]) {
      const relation = relationMapOf(name).order;
      expect(relation).toBeDefined();
      expect(is(relation, One)).toBe(true);
    }
  });

  it("kit.supersededByKit é one para o próprio kit", () => {
    const relation = relationMapOf("kit").supersededByKit;
    expect(relation).toBeDefined();
    expect(is(relation, One)).toBe(true);
    expect(relation?.referencedTableName).toBe("kit");
  });

  it("webhook_event e job não têm relations: não pertencem a um pedido", () => {
    expect(Object.keys(relationMapOf("webhookEvent"))).toHaveLength(0);
    expect(Object.keys(relationMapOf("job"))).toHaveLength(0);
  });
});
