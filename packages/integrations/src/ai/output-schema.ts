import { z } from "zod";

type JsonSchemaNode = { readonly [key: string]: unknown };

const supportedStringFormatSet: ReadonlySet<unknown> = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

const supportedMinItemsList: readonly unknown[] = [0, 1];

function isNode(value: unknown): value is JsonSchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPatternOnly(entry: unknown): entry is { readonly pattern: string } {
  return isNode(entry) && Object.keys(entry).length === 1 && typeof entry.pattern === "string";
}

function mapNodeRecord(record: JsonSchemaNode): JsonSchemaNode {
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, strictSchemaOf(child)]),
  );
}

function isSafeIntegerBound(value: unknown): boolean {
  return value === Number.MIN_SAFE_INTEGER || value === Number.MAX_SAFE_INTEGER;
}

function describedConstraint(description: unknown, leftoverMap: JsonSchemaNode): unknown {
  const leftoverEntryList = Object.entries(leftoverMap).filter(([, value]) => value !== undefined);
  if (leftoverEntryList.length === 0) return description;
  const constraintText = `{${leftoverEntryList
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ")}}`;
  return typeof description === "string" ? `${description}\n\n${constraintText}` : constraintText;
}

function strictSchemaOf(value: unknown): unknown {
  if (!isNode(value)) return value;
  const {
    $schema: _schemaUri,
    $defs,
    $ref,
    type,
    anyOf,
    oneOf,
    allOf,
    enum: enumList,
    const: constValue,
    title,
    description,
    properties,
    required,
    additionalProperties: _additionalProperties,
    items,
    minItems,
    format,
    minimum,
    maximum,
    pattern,
    ...leftoverMap
  } = value;
  const isPatternAllOf = Array.isArray(allOf) && allOf.every(isPatternOnly);
  const nestedAllOf = Array.isArray(allOf) && !isPatternAllOf ? allOf.map(strictSchemaOf) : [];
  const isSupportedMinItems = type === "array" && supportedMinItemsList.includes(minItems);
  const isSupportedFormat = type === "string" && supportedStringFormatSet.has(format);
  const patternList = [
    ...(typeof pattern === "string" ? [pattern] : []),
    ...(isPatternAllOf ? allOf.map((entry) => entry.pattern) : []),
  ];
  const describedDescription = describedConstraint(description, {
    ...leftoverMap,
    minItems: isSupportedMinItems ? undefined : minItems,
    format: isSupportedFormat ? undefined : format,
    minimum: isSafeIntegerBound(minimum) ? undefined : minimum,
    maximum: isSafeIntegerBound(maximum) ? undefined : maximum,
    pattern: patternList.length === 0 ? undefined : patternList.join(" e "),
  });
  const strict: Record<string, unknown> = {};
  if (isNode($defs)) strict.$defs = mapNodeRecord($defs);
  if (describedDescription !== undefined) strict.description = describedDescription;
  if (typeof $ref === "string") {
    const isBareRef = nestedAllOf.length === 0 && describedDescription === undefined;
    return isBareRef ? { ...strict, $ref } : { ...strict, allOf: [{ $ref }, ...nestedAllOf] };
  }
  if (type !== undefined && !Array.isArray(type)) strict.type = type;
  const variantList = Array.isArray(anyOf)
    ? anyOf
    : Array.isArray(oneOf)
      ? oneOf
      : Array.isArray(type)
        ? type.map((variantType) => ({ type: variantType }))
        : null;
  if (variantList !== null) strict.anyOf = variantList.map(strictSchemaOf);
  if (nestedAllOf.length > 0) strict.allOf = nestedAllOf;
  if (enumList !== undefined) strict.enum = enumList;
  if (constValue !== undefined) strict.const = constValue;
  if (title !== undefined) strict.title = title;
  if (type === "object") {
    strict.properties = isNode(properties) ? mapNodeRecord(properties) : {};
    strict.additionalProperties = false;
    if (required !== undefined) strict.required = required;
  }
  if (type === "array" && items !== undefined) strict.items = strictSchemaOf(items);
  if (isSupportedMinItems) strict.minItems = minItems;
  if (isSupportedFormat) strict.format = format;
  return strict;
}

export function toOutputJsonSchema(schema: z.ZodType): { readonly [key: string]: unknown } {
  const strictSchema = strictSchemaOf(z.toJSONSchema(schema, { reused: "ref", io: "input" }));
  return isNode(strictSchema) ? strictSchema : {};
}
