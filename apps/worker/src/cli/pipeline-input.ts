import { extname } from "node:path";
import { parseArgs } from "node:util";
import {
  type AiImage,
  countOrderTopics,
  err,
  findUnsupportedTopicList,
  type Grade,
  gradeList,
  gradeSchema,
  isSelectableTopic,
  MAX_NOTE_LENGTH,
  MAX_OTHER_TOPIC_LENGTH,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_COUNT,
  MAX_TOPIC_COUNT,
  MIN_TOPIC_COUNT,
  noteTextSchema,
  OTHER_TOPIC_REF,
  ok,
  otherTopicTextSchema,
  type PerceivedDifficulty,
  perceivedDifficultyList,
  perceivedDifficultySchema,
  type Result,
  type Subject,
  subjectList,
  subjectSchema,
} from "@gizito/core";
import type { z } from "zod";
import type { ExtractionPhoto } from "#src/pipeline/extract.ts";

export type PipelineArgs = {
  readonly photoPathList: readonly string[];
  readonly grade: Grade;
  readonly subject: Subject;
  readonly topicIdList: readonly string[] | null;
  readonly otherTopicText: string | null;
  readonly perceivedDifficulty: PerceivedDifficulty | null;
  readonly noteText: string | null;
  readonly outputDirectory: string | null;
};

const optionMap = {
  photos: { type: "string", multiple: true },
  grade: { type: "string" },
  subject: { type: "string" },
  topics: { type: "string" },
  other: { type: "string" },
  difficulty: { type: "string" },
  note: { type: "string" },
  out: { type: "string" },
} as const;
type OptionName = keyof typeof optionMap;
type SingleOptionName = Exclude<OptionName, "photos">;

const photoMediaTypeByExtension: Readonly<Record<string, AiImage["mediaType"]>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};
const photoExtensionText = Object.keys(photoMediaTypeByExtension).join(", ");
const MEGABYTE = 1024 * 1024;

export const PIPELINE_USAGE = [
  `uso: bun run pipeline --photos <foto>... --grade <${gradeList.join("|")}> --subject <${subjectList.join("|")}> [opções]`,
  "",
  `  --photos      1 a ${MAX_PHOTO_COUNT} fotos ${photoExtensionText}, com caminho a partir da raiz do repositório`,
  `  --grade       ano: ${gradeList.join(", ")}`,
  `  --subject     disciplina: ${subjectList.join(", ")}`,
  "  --topics      ids da taxonomia separados por vírgula, na ordem de relevância; sem ele, os assuntos de confiança alta da prévia",
  `  --other       assunto "outro", até ${MAX_OTHER_TOPIC_LENGTH} caracteres; entra por último`,
  `  --difficulty  dificuldade percebida: ${perceivedDifficultyList.join(", ")}`,
  `  --note        observação, até ${MAX_NOTE_LENGTH} caracteres`,
  "  --out         pasta de saída; padrão tests/pedagogy/output/pipeline/<data-hora>/",
  "",
  "O render precisa do Chromium: bun run --cwd apps/worker browser:install",
].join("\n");

type OptionReader = {
  readonly photoPathList: readonly string[];
  readonly optionValueOf: (name: SingleOptionName) => string | null;
  readonly errorList: string[];
};

function isOptionName(name: string): name is OptionName {
  return Object.hasOwn(optionMap, name);
}

function readOptions(argv: readonly string[]): OptionReader {
  const { tokens } = parseArgs({
    args: [...argv],
    options: optionMap,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  const valueListByOption = new Map<OptionName, string[]>();
  const positionalList: string[] = [];
  const errorList: string[] = [];
  for (const token of tokens) {
    if (token.kind === "positional") positionalList.push(token.value);
    if (token.kind !== "option") continue;
    if (!isOptionName(token.name)) {
      errorList.push(`opção desconhecida: ${token.rawName}`);
    } else if (token.value === undefined || token.value.startsWith("--")) {
      errorList.push(`${token.rawName} precisa de um valor`);
    } else {
      valueListByOption.set(token.name, [
        ...(valueListByOption.get(token.name) ?? []),
        token.value,
      ]);
    }
  }
  return {
    photoPathList: [...(valueListByOption.get("photos") ?? []), ...positionalList],
    optionValueOf: (name) => {
      const valueList = valueListByOption.get(name) ?? [];
      if (valueList.length > 1) errorList.push(`--${name} aparece mais de uma vez`);
      return valueList.at(-1) ?? null;
    },
    errorList,
  };
}

export function photoMediaTypeOf(path: string): AiImage["mediaType"] | null {
  return photoMediaTypeByExtension[extname(path).toLowerCase()] ?? null;
}

function checkPhotoPathList(photoPathList: readonly string[], errorList: string[]): void {
  if (photoPathList.length === 0 || photoPathList.length > MAX_PHOTO_COUNT) {
    errorList.push(
      `--photos pede de 1 a ${MAX_PHOTO_COUNT} fotos, recebeu ${photoPathList.length}`,
    );
  }
  for (const path of photoPathList) {
    if (photoMediaTypeOf(path) === null)
      errorList.push(`foto fora de ${photoExtensionText}: ${path}`);
  }
}

function parseOtherTopicText(
  value: string | null,
  subject: Subject | null,
  errorList: string[],
): string | null {
  if (value === null) return null;
  const parsed = otherTopicTextSchema.safeParse(value);
  if (!parsed.success) {
    errorList.push(`--other aceita até ${MAX_OTHER_TOPIC_LENGTH} caracteres`);
    return null;
  }
  for (const unsupportedTopic of subject === null
    ? []
    : findUnsupportedTopicList(parsed.data, subject)) {
    errorList.push(
      `other_topic_unsupported: o --other cai em assunto ainda não atendido (${unsupportedTopic.label})`,
    );
  }
  return parsed.data;
}

function parseTopicIdList(
  value: string | null,
  otherTopicText: string | null,
  context: { readonly grade: Grade; readonly subject: Subject } | null,
  errorList: string[],
): readonly string[] | null {
  if (value === null) return null;
  const topicIdList = value
    .split(",")
    .map((topicId) => topicId.trim())
    .filter((topicId) => topicId.length > 0);
  if (new Set(topicIdList).size !== topicIdList.length) errorList.push("--topics repete assunto");
  const topicCount = countOrderTopics(topicIdList, otherTopicText);
  if (topicCount < MIN_TOPIC_COUNT || topicCount > MAX_TOPIC_COUNT) {
    errorList.push(
      `--topics e --other somam ${topicCount} assuntos; o pedido aceita de ${MIN_TOPIC_COUNT} a ${MAX_TOPIC_COUNT}`,
    );
  }
  if (context === null) return topicIdList;
  const { grade, subject } = context;
  for (const topicId of topicIdList) {
    if (topicId === OTHER_TOPIC_REF || !isSelectableTopic(topicId, grade, subject)) {
      errorList.push(
        `topic_not_selectable: ${topicId} não é assunto do ${grade}º ano em ${subject}`,
      );
    }
  }
  return topicIdList;
}

function parseOptional<T>(
  value: string | null,
  schema: z.ZodType<T>,
  errorText: string,
  errorList: string[],
): T | null {
  if (value === null) return null;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  errorList.push(errorText);
  return null;
}

export function parsePipelineArgs(
  argv: readonly string[],
): Result<PipelineArgs, readonly string[]> {
  const { photoPathList, optionValueOf, errorList } = readOptions(argv);
  checkPhotoPathList(photoPathList, errorList);
  const grade = gradeSchema.safeParse(optionValueOf("grade"));
  if (!grade.success) errorList.push(`--grade aceita ${gradeList.join(", ")}`);
  const subject = subjectSchema.safeParse(optionValueOf("subject"));
  if (!subject.success) errorList.push(`--subject aceita ${subjectList.join(", ")}`);
  const otherTopicText = parseOtherTopicText(
    optionValueOf("other"),
    subject.success ? subject.data : null,
    errorList,
  );
  const topicIdList = parseTopicIdList(
    optionValueOf("topics"),
    otherTopicText,
    grade.success && subject.success ? { grade: grade.data, subject: subject.data } : null,
    errorList,
  );
  const perceivedDifficulty = parseOptional(
    optionValueOf("difficulty"),
    perceivedDifficultySchema,
    `--difficulty aceita ${perceivedDifficultyList.join(", ")}`,
    errorList,
  );
  const noteText = parseOptional(
    optionValueOf("note"),
    noteTextSchema,
    `--note aceita até ${MAX_NOTE_LENGTH} caracteres`,
    errorList,
  );
  const outputDirectory = optionValueOf("out");
  if (!grade.success || !subject.success || errorList.length > 0) return err(errorList);
  return ok({
    photoPathList,
    grade: grade.data,
    subject: subject.data,
    topicIdList,
    otherTopicText,
    perceivedDifficulty,
    noteText: noteText === "" ? null : noteText,
    outputDirectory,
  });
}

export async function loadPipelinePhotoList(
  photoPathList: readonly string[],
  insertDatetime: Date,
): Promise<Result<readonly ExtractionPhoto[], readonly string[]>> {
  const errorList: string[] = [];
  const photoList: ExtractionPhoto[] = [];
  for (const path of photoPathList) {
    const file = Bun.file(path);
    const mediaType = photoMediaTypeOf(path);
    if (mediaType === null) {
      errorList.push(`foto fora de ${photoExtensionText}: ${path}`);
    } else if (!(await file.exists())) {
      errorList.push(`foto não encontrada: ${path}`);
    } else if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
      errorList.push(`foto vazia ou acima de ${MAX_PHOTO_BYTES / MEGABYTE} MB: ${path}`);
    } else {
      photoList.push({
        image: { mediaType, data: new Uint8Array(await file.arrayBuffer()) },
        insertDatetime,
      });
    }
  }
  return errorList.length > 0 ? err(errorList) : ok(photoList);
}
