import {
  type ExceededPreviewLimit,
  err,
  findExceededPreviewLimit,
  ok,
  PREVIEW_REQUEST_RETENTION_HOURS,
  type Result,
} from "@gizito/core";
import { type Database, previewRequest, type Transaction } from "@gizito/db";
import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import type { ClientKeyHashMap } from "#src/http/client-identity.ts";

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

async function countWindow(
  tx: Transaction,
  column: typeof previewRequest.clientIpHash | typeof previewRequest.deviceHash,
  hash: string,
  now: Date,
) {
  const hourStart = new Date(now.getTime() - MILLISECONDS_PER_HOUR);
  const dayStart = new Date(
    now.getTime() - PREVIEW_REQUEST_RETENTION_HOURS * MILLISECONDS_PER_HOUR,
  );
  const [row] = await tx
    .select({
      hour: sql<number>`count(*) filter (where ${previewRequest.insertDatetime} > ${hourStart})`.mapWith(
        Number,
      ),
      day: count(),
    })
    .from(previewRequest)
    .where(and(eq(column, hash), gt(previewRequest.insertDatetime, dayStart)));
  return { hour: row?.hour ?? 0, day: row?.day ?? 0 };
}

export async function reservePreviewRequest(
  db: Database,
  { clientIpHash, deviceHash }: ClientKeyHashMap,
  now: Date,
): Promise<Result<void, ExceededPreviewLimit>> {
  return db.transaction(async (tx) => {
    for (const hash of [clientIpHash, deviceHash].sort()) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${hash}, 0))`);
    }
    const exceeded = findExceededPreviewLimit({
      device: await countWindow(tx, previewRequest.deviceHash, deviceHash, now),
      ip: await countWindow(tx, previewRequest.clientIpHash, clientIpHash, now),
    });
    if (exceeded !== null) return err(exceeded);
    await tx.insert(previewRequest).values({ clientIpHash, deviceHash, insertDatetime: now });
    await tx
      .delete(previewRequest)
      .where(
        lt(
          previewRequest.insertDatetime,
          new Date(now.getTime() - PREVIEW_REQUEST_RETENTION_HOURS * MILLISECONDS_PER_HOUR),
        ),
      );
    return ok(undefined);
  });
}
