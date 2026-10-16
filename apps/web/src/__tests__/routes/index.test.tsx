import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { BRAND_NAME } from "#src/copy/brand.ts";
import { Route } from "#src/routes/index.tsx";

it("a página inicial mostra a marca como título principal", () => {
  const HomePage = Route.options.component;
  if (!HomePage) throw new Error("rota / sem componente");
  render(<HomePage />);
  expect(screen.getByRole("heading", { level: 1, name: BRAND_NAME })).toBeTruthy();
  expect(screen.getByRole("main")).toBeTruthy();
});
