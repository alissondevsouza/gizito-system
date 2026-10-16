import { createFileRoute } from "@tanstack/react-router";
import { BRAND_NAME } from "#src/copy/brand.ts";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  return (
    <>
      <header className="bg-board text-chalk">
        <div className="mx-auto max-w-content px-4 py-6">
          <h1 className="text-3xl font-extrabold">{BRAND_NAME}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-content px-4 py-12" />
    </>
  );
}
