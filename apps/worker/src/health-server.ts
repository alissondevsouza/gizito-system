import type { WorkerHealth } from "@gizito/core";

export type StartHealthServerOptions = {
  hostname: string;
  port: number;
  readHealth: () => Promise<WorkerHealth>;
};

export const HEALTH_PATH = "/health";

export function startHealthServer({ hostname, port, readHealth }: StartHealthServerOptions) {
  return Bun.serve({
    hostname,
    port,
    routes: {
      [HEALTH_PATH]: {
        GET: async () => {
          const health = await readHealth();
          return Response.json(health, { status: health.status === "ok" ? 200 : 503 });
        },
      },
    },
    fetch: () => new Response(null, { status: 404 }),
  });
}
