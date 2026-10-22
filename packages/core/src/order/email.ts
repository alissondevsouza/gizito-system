import { z } from "zod";

const EMAIL_MASK = "***";

export function maskEmail(email: string): string {
  const atIndex = email.lastIndexOf("@");
  return `${email.slice(0, 1)}${EMAIL_MASK}${email.slice(atIndex)}`;
}

export const maskedEmailSchema = z.string().regex(/^[^@*]\*{3}@[^@*]+$/);
