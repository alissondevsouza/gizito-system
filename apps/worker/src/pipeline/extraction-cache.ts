import type { Grade, PhotoExtraction, Subject, ValidationIssue } from "@gizito/core";

export type ExtractionCacheKeyInput = {
  readonly contentHash: string;
  readonly grade: Grade;
  readonly subject: Subject;
  readonly taxonomyVersion: string;
  readonly promptVersion: string;
  readonly model: string;
};

export function buildExtractionCacheKey({
  contentHash,
  grade,
  subject,
  taxonomyVersion,
  promptVersion,
  model,
}: ExtractionCacheKeyInput): string {
  return [contentHash, grade, subject, taxonomyVersion, promptVersion, model].join(":");
}

export type ExtractionCacheEntry = {
  readonly extraction: PhotoExtraction;
  readonly issueList: readonly ValidationIssue[];
  readonly expireDatetime: Date;
};

export interface ExtractionCache {
  find(key: string): Promise<ExtractionCacheEntry | null>;
  save(key: string, entry: ExtractionCacheEntry): Promise<void>;
}

export type MemoryExtractionCache = ExtractionCache & {
  readonly entryMap: ReadonlyMap<string, ExtractionCacheEntry>;
};

export function createMemoryExtractionCache(): MemoryExtractionCache {
  const entryMap = new Map<string, ExtractionCacheEntry>();
  return {
    find: async (key) => entryMap.get(key) ?? null,
    save: async (key, entry) => {
      entryMap.set(key, entry);
    },
    entryMap,
  };
}
