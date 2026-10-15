import { describe, expect, it } from "bun:test";
import type { Charge, Order, OrderPhoto } from "@gizito/core";
import type { charge, order, orderPhoto } from "#src/schema/index.ts";

type OrderRow = typeof order.$inferSelect;
type OrderPhotoRow = typeof orderPhoto.$inferSelect;
type ChargeRow = typeof charge.$inferSelect;
type OrderInsert = typeof order.$inferInsert;
type OrderPhotoInsert = typeof orderPhoto.$inferInsert;
type ChargeInsert = typeof charge.$inferInsert;

describe("alinhamento com os schemas do core", () => {
  it("linha lida de order, order_photo e charge é atribuível a Order, OrderPhoto e Charge", () => {
    const orderValue: Order = {} as OrderRow;
    const orderPhotoValue: OrderPhoto = {} as OrderPhotoRow;
    const chargeValue: Charge = {} as ChargeRow;
    expect([orderValue, orderPhotoValue, chargeValue]).toHaveLength(3);
  });

  it("entidade validada pelo core é aceita como insert", () => {
    const orderInsert: OrderInsert = {} as Order;
    const orderPhotoInsert: OrderPhotoInsert = {} as OrderPhoto;
    const chargeInsert: ChargeInsert = {} as Charge;
    expect([orderInsert, orderPhotoInsert, chargeInsert]).toHaveLength(3);
  });
});
