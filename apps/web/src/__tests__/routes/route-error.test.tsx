import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createRequestHandler, defaultRenderHandler } from "@tanstack/react-router/ssr/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RouteErrorPage } from "#src/components/route-error-page.tsx";
import { routeErrorCopy } from "#src/copy/route-error.ts";
import { getRouter } from "#src/router.tsx";
import { Route as rootRoute } from "#src/routes/__root.tsx";

type RootRouteOptions = NonNullable<Parameters<typeof createRootRoute>[0]>;

const SYNTHETIC_ERROR_MESSAGE = "falha-sintetica-com-detalhe-interno";

const RECOVERED_TEXT = "Página recuperada";
const brokenPageState = { shouldThrow: true };

function BrokenPage() {
  if (brokenPageState.shouldThrow) throw new Error(SYNTHETIC_ERROR_MESSAGE);
  return <p>{RECOVERED_TEXT}</p>;
}

const brokenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/quebrada",
  component: BrokenPage,
});

const routeTree = rootRoute.addChildren([brokenRoute]);

beforeEach(() => {
  brokenPageState.shouldThrow = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("componente que lança mostra o erro em pt-BR dentro do documento, sem o detalhe", async () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/quebrada"] }),
  });
  render(<RouterProvider router={router} />, { container: document });
  expect(await screen.findByRole("heading", { level: 1, name: routeErrorCopy.title })).toBeTruthy();
  expect(document.documentElement.getAttribute("lang")).toBe("pt-BR");
  expect(screen.getByText(routeErrorCopy.description)).toBeTruthy();
  expect(screen.getByRole("button", { name: routeErrorCopy.retry })).toBeTruthy();
  expect(screen.getByRole("link", { name: routeErrorCopy.backHome }).getAttribute("href")).toBe(
    "/",
  );
  expect(document.documentElement.outerHTML).not.toContain(SYNTHETIC_ERROR_MESSAGE);
});

it("Tentar de novo recarrega a rota e sai da tela de erro", async () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/quebrada"] }),
  });
  render(<RouterProvider router={router} />, { container: document });
  const retryButton = await screen.findByRole("button", { name: routeErrorCopy.retry });
  brokenPageState.shouldThrow = false;
  fireEvent.click(retryButton);
  expect(await screen.findByText(RECOVERED_TEXT)).toBeTruthy();
  expect(screen.queryByText(routeErrorCopy.title)).toBeNull();
});

it('resposta do servidor com falha na raiz mantém <html lang="pt-BR"> e mostra o texto pt-BR', async () => {
  const { shellComponent, errorComponent } = rootRoute.options as RootRouteOptions;
  const failingRootRoute = createRootRoute({
    shellComponent,
    errorComponent,
    loader: () => {
      throw new Error(SYNTHETIC_ERROR_MESSAGE);
    },
  });
  const handleRequest = createRequestHandler({
    request: new Request("http://localhost/"),
    createRouter: () => createRouter({ routeTree: failingRootRoute, isServer: true }),
  });
  const response = await handleRequest(defaultRenderHandler);
  const html = await response.text();
  const visibleHtml = html.replaceAll(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  expect(visibleHtml.startsWith('<!DOCTYPE html><html lang="pt-BR">')).toBe(true);
  expect(visibleHtml).toContain(routeErrorCopy.title);
  expect(visibleHtml).toContain(routeErrorCopy.backHome);
  expect(visibleHtml).not.toContain(SYNTHETIC_ERROR_MESSAGE);
});

it("erro de loader numa rota filha, no servidor, usa a página de erro pt-BR do router", async () => {
  expect(getRouter().options.defaultErrorComponent).toBe(RouteErrorPage);
  const { shellComponent } = rootRoute.options as RootRouteOptions;
  const shellOnlyRoot = createRootRoute({ shellComponent });
  const brokenLoaderRoute = createRoute({
    getParentRoute: () => shellOnlyRoot,
    path: "/",
    loader: () => {
      throw new Error(SYNTHETIC_ERROR_MESSAGE);
    },
    component: () => <p>nunca renderiza</p>,
  });
  const handleRequest = createRequestHandler({
    request: new Request("http://localhost/"),
    createRouter: () =>
      createRouter({
        routeTree: shellOnlyRoot.addChildren([brokenLoaderRoute]),
        isServer: true,
        defaultErrorComponent: getRouter().options.defaultErrorComponent,
      }),
  });
  const response = await handleRequest(defaultRenderHandler);
  const visibleHtml = (await response.text()).replaceAll(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  expect(visibleHtml).toContain(routeErrorCopy.title);
  expect(visibleHtml).not.toContain("Something went wrong");
  expect(visibleHtml).not.toContain(SYNTHETIC_ERROR_MESSAGE);
});
