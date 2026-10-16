import type { Subprocess } from "bun";

export async function findFreePort(): Promise<number> {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const { port } = server;
  await server.stop(true);
  if (port === undefined) throw new Error("free port not assigned");
  return port;
}

export async function waitForHttpStatus(
  url: string,
  expectedStatus: number,
  child: Subprocess,
  { attemptCount = 100, intervalMs = 50 }: { attemptCount?: number; intervalMs?: number } = {},
): Promise<Response> {
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`process exited with ${child.exitCode}`);
    const response = await fetch(url).catch(() => null);
    if (response?.status === expectedStatus) return response;
    await Bun.sleep(intervalMs);
  }
  throw new Error(`${url} never answered ${expectedStatus}`);
}
