import { createRouter } from "@tanstack/react-router";
import { RouteErrorPage } from "#src/components/route-error-page.tsx";
import { routeTree } from "#src/routeTree.gen.ts";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultErrorComponent: RouteErrorPage,
  });
}
