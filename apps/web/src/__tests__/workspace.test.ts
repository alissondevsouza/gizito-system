import { expect, it } from "vitest";
import { getRouter } from "#src/router.tsx";

it("resolve o router pelo subpath import #src no Vitest", () => {
  expect(getRouter().routesByPath["/"]).toBeDefined();
});
