import {
  type PhotoExtraction,
  photoExtractionSchema,
  type ValidationIssue,
  validationIssueSchema,
} from "@gizito/core";
import { asc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "#src/client.ts";
import { extractionCache } from "#src/schema/extraction-cache.ts";

export type StoredExtraction = {
  readonly extraction: PhotoExtraction;
  readonly issueList: readonly ValidationIssue[];
  readonly expireDatetime: Date;
};

export type PurgeExpiredExtractionCacheOptions = {
  readonly now: Date;
  readonly batchSize: number;
};

const storedIssueListSchema = z.array(validationIssueSchema);

export async function findExtractionCacheEntry(
  executor: Executor,
  cacheKey: string,
): Promise<StoredExtraction | null> {
  const [row] = await executor
    .select({
      extraction: extractionCache.extraction,
      issueList: extractionCache.issueList,
      expireDatetime: extractionCache.expireDatetime,
    })
    .from(extractionCache)
    .where(eq(extractionCache.cacheKey, cacheKey));
  if (row === undefined) return null;
  const extraction = photoExtractionSchema.safeParse(row.extraction);
  const issueList = storedIssueListSchema.safeParse(row.issueList);
  if (!extraction.success || !issueList.success) return null;
  return {
    extraction: extraction.data,
    issueList: issueList.data,
    expireDatetime: row.expireDatetime,
  };
}

export async function saveExtractionCacheEntry(
  executor: Executor,
  cacheKey: string,
  { extraction, issueList, expireDatetime }: StoredExtraction,
): Promise<void> {
  const storedValue = {
    extraction: photoExtractionSchema.parse(extraction),
    issueList: storedIssueListSchema.parse(issueList),
    expireDatetime,
  };
  await executor
    .insert(extractionCache)
    .values({ cacheKey, ...storedValue })
    .onConflictDoUpdate({ target: extractionCache.cacheKey, set: storedValue });
}

export async function purgeExpiredExtractionCache(
  executor: Executor,
  { now, batchSize }: PurgeExpiredExtractionCacheOptions,
): Promise<number> {
  const expiredIdQuery = executor
    .select({ extractionCacheId: extractionCache.extractionCacheId })
    .from(extractionCache)
    .where(lte(extractionCache.expireDatetime, now))
    .orderBy(asc(extractionCache.expireDatetime))
    .limit(batchSize);
  const deletedList = await executor
    .delete(extractionCache)
    .where(inArray(extractionCache.extractionCacheId, expiredIdQuery))
    .returning({ extractionCacheId: extractionCache.extractionCacheId });
  return deletedList.length;
}
