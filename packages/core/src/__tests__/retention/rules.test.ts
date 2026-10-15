import { describe, expect, it } from "bun:test";
import {
  isKitExpired,
  isPhotoExpired,
  kitDeleteDeadline,
  photoDeleteDeadline,
} from "#src/retention/rules.ts";

describe("retenção (invariante 10)", () => {
  it("foto vence 30 dias depois, inclusive na virada de mês", () => {
    expect(photoDeleteDeadline(new Date("2026-10-15T12:00:00.000Z"))).toEqual(
      new Date("2026-11-14T12:00:00.000Z"),
    );
    expect(photoDeleteDeadline(new Date("2026-01-31T00:00:00.000Z"))).toEqual(
      new Date("2026-03-02T00:00:00.000Z"),
    );
  });

  it("kit vence 12 meses depois; 29 de fevereiro cai em 1º de março", () => {
    expect(kitDeleteDeadline(new Date("2026-10-15T12:00:00.000Z"))).toEqual(
      new Date("2027-10-15T12:00:00.000Z"),
    );
    expect(kitDeleteDeadline(new Date("2024-02-29T00:00:00.000Z"))).toEqual(
      new Date("2025-03-01T00:00:00.000Z"),
    );
  });

  it("expira no instante exato do prazo, não antes", () => {
    const inserted = new Date("2026-10-15T12:00:00.000Z");
    expect(isPhotoExpired(inserted, new Date("2026-11-14T11:59:59.999Z"))).toBe(false);
    expect(isPhotoExpired(inserted, new Date("2026-11-14T12:00:00.000Z"))).toBe(true);
    expect(isKitExpired(inserted, new Date("2027-10-15T11:59:59.999Z"))).toBe(false);
    expect(isKitExpired(inserted, new Date("2027-10-15T12:00:00.000Z"))).toBe(true);
  });
});
