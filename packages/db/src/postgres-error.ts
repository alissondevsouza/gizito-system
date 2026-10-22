const UNIQUE_VIOLATION_SQL_STATE = "23505";

type PostgresErrorFields = {
  readonly errno?: unknown;
  readonly constraint?: unknown;
  readonly cause?: unknown;
};

function listErrorChain(error: unknown): PostgresErrorFields[] {
  const chain: PostgresErrorFields[] = [];
  let current: unknown = error;
  while (typeof current === "object" && current !== null && !chain.includes(current)) {
    chain.push(current);
    current = (current as PostgresErrorFields).cause;
  }
  return chain;
}

export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  return listErrorChain(error).some(
    (link) => link.errno === UNIQUE_VIOLATION_SQL_STATE && link.constraint === constraintName,
  );
}
