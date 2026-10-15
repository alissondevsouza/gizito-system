import { expect, it } from "bun:test";
import * as core from "@gizito/core";
import * as entry from "#src/index.ts";

it("resolve o entrypoint do workspace pelo subpath import #src", () => {
  expect(typeof entry).toBe("object");
});

it("resolve @gizito/core como dependência de workspace", () => {
  expect(typeof core).toBe("object");
});
