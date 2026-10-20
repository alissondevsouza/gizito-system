import { z } from "zod";

export const expectedAnswerKindList = ["number", "fraction", "expression", "set", "text"] as const;
export const expectedAnswerKindSchema = z.enum(expectedAnswerKindList);
export type ExpectedAnswerKind = z.infer<typeof expectedAnswerKindSchema>;

const unitSchema = z.string().trim().min(1).max(20).nullable();

export const numberAnswerSchema = z.strictObject({
  kind: z.literal("number"),
  value: z.number().finite(),
  unit: unitSchema,
  tolerance: z.number().min(0),
});

export const fractionAnswerSchema = z.strictObject({
  kind: z.literal("fraction"),
  numerator: z.int(),
  denominator: z.int().positive(),
  unit: unitSchema,
});

export const expressionAnswerSchema = z.strictObject({
  kind: z.literal("expression"),
  expression: z.string().trim().min(1).max(200),
});

export const setAnswerSchema = z.strictObject({
  kind: z.literal("set"),
  valueList: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
});

export const textAnswerSchema = z.strictObject({
  kind: z.literal("text"),
  value: z.string().trim().min(1).max(500),
  acceptedList: z.array(z.string().trim().min(1).max(500)).max(10),
});

export const expectedAnswerSchema = z.discriminatedUnion("kind", [
  numberAnswerSchema,
  fractionAnswerSchema,
  expressionAnswerSchema,
  setAnswerSchema,
  textAnswerSchema,
]);
export type ExpectedAnswer = z.infer<typeof expectedAnswerSchema>;
