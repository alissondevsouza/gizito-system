import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RouteErrorPage } from "#src/components/route-error-page.tsx";
import { BRAND_NAME } from "#src/copy/brand.ts";
import { notFoundCopy } from "#src/copy/not-found.ts";
import appCss from "#src/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: BRAND_NAME },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

function NotFoundPage() {
  return (
    <main className="mx-auto max-w-content px-4 py-12">
      <h1 className="text-3xl font-extrabold text-board">{notFoundCopy.title}</h1>
      <Link to="/" className="mt-6 inline-flex min-h-12 items-center underline">
        {notFoundCopy.backHome}
      </Link>
    </main>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body className="bg-paper text-ink antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
