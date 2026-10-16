import { createRouter } from "@tanstack/react-router";
import { routeTree } from "#src/routeTree.gen.ts";

export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true });
}
