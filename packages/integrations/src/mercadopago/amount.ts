const CENTS_PER_UNIT = 100;
const decimalAmountPattern = /^(\d+)(?:\.(\d{1,2}))?$/;

export function formatCentsAsDecimal(amountCents: number): string {
  const units = Math.trunc(amountCents / CENTS_PER_UNIT);
  const cents = amountCents % CENTS_PER_UNIT;
  return `${units}.${String(cents).padStart(2, "0")}`;
}

export function parseDecimalAsCents(amount: string): number | null {
  const match = decimalAmountPattern.exec(amount);
  if (match === null) return null;
  const [, units = "", fraction = ""] = match;
  return Number(units) * CENTS_PER_UNIT + Number(fraction.padEnd(2, "0"));
}
