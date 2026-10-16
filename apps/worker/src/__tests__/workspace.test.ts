import { expect, it } from "bun:test";
import * as core from "@gizito/core";
import * as lanes from "#src/runner/lanes.ts";

it("resolve os módulos do worker pelo subpath import #src", () => {
  expect(typeof lanes.buildJobLaneList).toBe("function");
});

it("resolve @gizito/core como dependência de workspace", () => {
  expect(typeof core).toBe("object");
});
