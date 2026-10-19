import { createHash } from "node:crypto";

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : 1))
        .map(([key, item]) => [key, sortKeysDeep(item)]),
    );
  }
  return value;
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortKeysDeep(value)))
    .digest("hex");
}
