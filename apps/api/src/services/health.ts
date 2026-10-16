import type { ApiHealth } from "@gizito/core";
import { type Executor, pingDatabase } from "@gizito/db";

export type ApiHealthCheck = {
  health: ApiHealth;
  errorName?: string;
};

export async function checkApiHealth(db: Executor): Promise<ApiHealthCheck> {
  try {
    await pingDatabase(db);
    return { health: { status: "ok" } };
  } catch (error) {
    return {
      health: { status: "unavailable" },
      errorName: error instanceof Error ? error.name : typeof error,
    };
  }
}
