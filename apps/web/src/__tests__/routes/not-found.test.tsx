import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { notFoundCopy } from "#src/copy/not-found.ts";
import { routeTree } from "#src/routeTree.gen.ts";

it("rota desconhecida mostra a página neutra em português com link para o início", async () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/nao-existe"] }),
  });
  render(<RouterProvider router={router} />, { container: document });
  expect(await screen.findByRole("heading", { level: 1, name: notFoundCopy.title })).toBeTruthy();
  expect(screen.getByRole("link", { name: notFoundCopy.backHome }).getAttribute("href")).toBe("/");
});
