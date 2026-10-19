import { Link, useRouter } from "@tanstack/react-router";
import { routeErrorCopy } from "#src/copy/route-error.ts";

export function RouteErrorPage() {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-content px-4 py-12">
      <h1 className="text-3xl font-extrabold text-board">{routeErrorCopy.title}</h1>
      <p className="mt-4">{routeErrorCopy.description}</p>
      <div className="mt-6 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => void router.invalidate()}
          className="inline-flex min-h-12 items-center rounded-md border-2 border-board px-4 font-bold"
        >
          {routeErrorCopy.retry}
        </button>
        <Link to="/" className="inline-flex min-h-12 items-center underline">
          {routeErrorCopy.backHome}
        </Link>
      </div>
    </main>
  );
}
