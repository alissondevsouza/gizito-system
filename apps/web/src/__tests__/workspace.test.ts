import { expect, it } from "vitest";
import * as entry from "#src/index.ts";

it("resolve o entrypoint do workspace pelo subpath import #src no Vitest", () => {
  expect(typeof entry).toBe("object");
});
