import { expect, it } from "bun:test";
import * as entry from "#src/index.ts";

it("resolve o entrypoint do workspace pelo subpath import #src", () => {
  expect(typeof entry).toBe("object");
});
