import { describe, expect, it } from "bun:test";
import {
  kitContentSchemaBySubject,
  kitPlanSchema,
  kitRepairSchemaBySubject,
  photoExtractionSchema,
  reviewResultSchema,
} from "@gizito/core";
import { z } from "zod";
import { toOutputJsonSchema } from "#src/ai/output-schema.ts";

const allowedKeywordSet: ReadonlySet<string> = new Set([
  "$defs",
  "$ref",
  "type",
  "anyOf",
  "allOf",
  "enum",
  "const",
  "title",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "format",
]);

const outputSchemaByName: Readonly<Record<string, z.ZodType>> = {
  photoExtraction: photoExtractionSchema,
  kitPlan: kitPlanSchema,
  mathKitContent: kitContentSchemaBySubject.math,
  portugueseKitContent: kitContentSchemaBySubject.portuguese,
  mathKitRepair: kitRepairSchemaBySubject.math,
  portugueseKitRepair: kitRepairSchemaBySubject.portuguese,
  reviewResult: reviewResultSchema,
};

type SchemaNode = { readonly [key: string]: unknown };

function isNode(value: unknown): value is SchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listSchemaNode(node: unknown): readonly SchemaNode[] {
  if (!isNode(node)) return [];
  const childList = [
    ...Object.values(isNode(node.$defs) ? node.$defs : {}),
    ...Object.values(isNode(node.properties) ? node.properties : {}),
    ...(Array.isArray(node.anyOf) ? node.anyOf : []),
    ...(Array.isArray(node.allOf) ? node.allOf : []),
    ...(node.items === undefined ? [] : [node.items]),
  ];
  return [node, ...childList.flatMap(listSchemaNode)];
}

describe("toOutputJsonSchema (spec F1-05, RF-02)", () => {
  it.each(Object.entries(outputSchemaByName))(
    "%s só usa palavras-chave aceitas e fecha todo objeto",
    (_, schema) => {
      const nodeList = listSchemaNode(toOutputJsonSchema(schema));
      expect(nodeList.length).toBeGreaterThan(1);
      for (const node of nodeList) {
        for (const keyword of Object.keys(node)) expect(allowedKeywordSet.has(keyword)).toBe(true);
        if (node.type === "object") expect(node.additionalProperties).toBe(false);
        const isTyped =
          "type" in node || "anyOf" in node || "allOf" in node || "$ref" in node || "const" in node;
        expect(isTyped).toBe(true);
      }
    },
  );

  it("mantém enum e const e manda o limite de tamanho para a descrição", () => {
    const outputSchema = toOutputJsonSchema(
      z.strictObject({
        kind: z.literal("number"),
        level: z.enum(["high", "medium"]),
        statement: z.string().min(10).max(700),
        optionList: z.array(z.string()).length(4),
        minutes: z.int().min(20).max(60),
        code: z
          .string()
          .regex(/^[a-z]+$/)
          .regex(/^ma/),
        tagList: z.array(z.string()).min(1),
      }),
    );
    const properties = outputSchema.properties as Record<string, SchemaNode>;
    expect(properties.kind).toEqual({ type: "string", const: "number" });
    expect(properties.level).toEqual({ type: "string", enum: ["high", "medium"] });
    expect(properties.statement).toEqual({
      type: "string",
      description: "{minLength: 10, maxLength: 700}",
    });
    expect(properties.optionList?.description).toBe("{maxItems: 4, minItems: 4}");
    expect(properties.minutes).toEqual({
      type: "integer",
      description: "{minimum: 20, maximum: 60}",
    });
    expect(properties.code?.allOf).toBeUndefined();
    expect(properties.code?.description).toBe('{pattern: "^[a-z]+$ e ^ma"}');
    expect(properties.tagList?.minItems).toBe(1);
    expect(outputSchema.additionalProperties).toBe(false);
    expect(outputSchema.$schema).toBeUndefined();
  });

  it("descarta os limites de inteiro seguro do z.int() e escreve união como anyOf", () => {
    const outputSchema = toOutputJsonSchema(
      z.strictObject({
        count: z.int(),
        value: z.union([z.string(), z.number()]),
        answer: z.discriminatedUnion("kind", [
          z.strictObject({ kind: z.literal("number"), value: z.number() }),
          z.strictObject({ kind: z.literal("text"), value: z.string() }),
        ]),
      }),
    );
    const properties = outputSchema.properties as Record<string, SchemaNode>;
    expect(properties.count).toEqual({ type: "integer" });
    expect(properties.value).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
    const answerVariantList = properties.answer?.anyOf as readonly SchemaNode[];
    expect(answerVariantList.map((variant) => variant.additionalProperties)).toEqual([
      false,
      false,
    ]);
    expect(properties.answer?.oneOf).toBeUndefined();
  });
});
