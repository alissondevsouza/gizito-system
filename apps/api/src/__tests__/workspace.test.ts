import { expect, it } from "bun:test";
import * as core from "@gizito/core";
import * as app from "#src/app.ts";

it("resolve o módulo do app pelo subpath import #src", () => {
  expect(typeof app.createApp).toBe("function");
});

it("resolve @gizito/core como dependência de workspace", () => {
  expect(typeof core).toBe("object");
});
