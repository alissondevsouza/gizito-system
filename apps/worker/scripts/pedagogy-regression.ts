import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createAnthropicProvider,
  createMathjsEvaluator,
  isKatexParsable,
} from "@gizito/integrations";
import { parseAiEnvironment } from "#src/cli/pipeline-input.ts";
import { toJson, writePipelineOutput } from "#src/cli/pipeline-output.ts";
import type { PipelineSummary } from "#src/cli/pipeline-report.ts";
import { DEFAULT_RENDER_CONCURRENCY } from "#src/config.ts";
import { GENERATION_VERSION } from "#src/pipeline/generate.ts";
import type { PipelineRequest } from "#src/pipeline/run-pipeline.ts";
import {
  type CaseRunOutcome,
  type CaseTextReference,
  checkRegressionCase,
} from "#src/regression/case-check.ts";
import {
  loadCasePhotoList,
  loadPhotoVariationList,
  personalDataTextListOf,
  prepareCasePhotoList,
} from "#src/regression/case-photo.ts";
import { createPersonalDataPainter } from "#src/regression/personal-data-painter.ts";
import {
  type LoadedRegressionCase,
  loadMaterialPhraseMap,
  loadRegressionCaseList,
} from "#src/regression/regression-case.ts";
import { parseRegressionArgs, REGRESSION_USAGE } from "#src/regression/regression-input.ts";
import {
  buildRegressionReport,
  type CaseResult,
  formatRegressionMarkdown,
  formatRegressionTerminal,
  regressionDocFileNameOf,
} from "#src/regression/regression-report.ts";
import {
  type CaseRunDependencies,
  caseRequestOf,
  runRegressionCase,
} from "#src/regression/run-case.ts";
import { createPdfRenderer, errorNameOf } from "#src/render/pdf-renderer.ts";
import { createSemaphore } from "#src/render/semaphore.ts";

const USAGE_EXIT_CODE = 2;
const CRITICAL_EXIT_CODE = 1;
const CASES_DIRECTORY = "tests/pedagogy/cases";
const PHOTO_VARIATION_FILE = "tests/pedagogy/photo-variations.json";
const MATERIAL_PHRASE_FILE = "tests/pedagogy/material-phrases.json";
const PHOTO_SOURCE_DIRECTORY = "docs/materiais-fotograficos";
const DEFAULT_OUTPUT_ROOT = "tests/pedagogy/output/regressao";
const DOC_DIRECTORY = "docs/pedagogy/regressao";
const PHOTO_LOAD_ERROR_NAME = "CasePhotoError";

function exitWith(errorList: readonly string[], withUsage = false): never {
  for (const error of errorList) console.error(`- ${error}`);
  if (withUsage) console.error(`\n${REGRESSION_USAGE}`);
  process.exit(USAGE_EXIT_CODE);
}

function selectCaseList(
  loadedList: readonly LoadedRegressionCase[],
  caseIdList: readonly string[] | null,
): readonly LoadedRegressionCase[] {
  if (caseIdList === null) return loadedList;
  const knownIdList = loadedList.map(({ regressionCase }) => regressionCase.caseId);
  const unknownIdList = caseIdList.filter((caseId) => !knownIdList.includes(caseId));
  if (unknownIdList.length > 0) exitWith([`caso desconhecido: ${unknownIdList.join(", ")}`]);
  return loadedList.filter(({ regressionCase }) => caseIdList.includes(regressionCase.caseId));
}

async function writeCaseOutput(
  outcome: CaseRunOutcome,
  request: PipelineRequest,
  caseOutputDirectory: string,
): Promise<PipelineSummary | null> {
  await mkdir(caseOutputDirectory, { recursive: true });
  if (outcome.kind === "crashed") return null;
  const { run } = outcome;
  const generation = run.generation;
  const attemptList =
    generation === null
      ? []
      : generation.ok
        ? generation.value.attemptList
        : generation.error.attemptList;
  await Bun.write(join(caseOutputDirectory, "issues.json"), toJson(attemptList));
  return writePipelineOutput(run, request, caseOutputDirectory);
}

const parsed = parseRegressionArgs(process.argv.slice(2));
if (!parsed.ok) exitWith(parsed.error, true);
const args = parsed.value;

const loadedCaseList = await loadRegressionCaseList(CASES_DIRECTORY);
if (!loadedCaseList.ok) exitWith(loadedCaseList.error);
const selectedCaseList = selectCaseList(loadedCaseList.value, args.caseIdList);
const loadedVariationList = await loadPhotoVariationList(PHOTO_VARIATION_FILE);
if (!loadedVariationList.ok) exitWith(loadedVariationList.error);
const variationList = loadedVariationList.value;
const loadedMaterialPhraseMap = await loadMaterialPhraseMap(MATERIAL_PHRASE_FILE);
if (!loadedMaterialPhraseMap.ok) exitWith(loadedMaterialPhraseMap.error);
const materialPhraseMap = loadedMaterialPhraseMap.value;

const preparation = await prepareCasePhotoList(selectedCaseList, {
  sourceDirectory: PHOTO_SOURCE_DIRECTORY,
  variationList,
  createPainter: () => createPersonalDataPainter(),
});
if (!preparation.ok) exitWith(preparation.error);
console.info(
  `Fotos conferidas: ${preparation.value.presentCount} já prontas, ${preparation.value.writtenCount} preparadas agora.`,
);
if (args.preparePhotosOnly) process.exit(0);

const environment = parseAiEnvironment(process.env);
if (!environment.ok) exitWith(environment.error);
const { AI_API_KEY, AI_MODEL_EXTRACT, AI_MODEL_GENERATE, AI_EFFORT_EXTRACT, AI_EFFORT_GENERATE } =
  environment.value;

const startedAt = new Date();
const runId = startedAt.toISOString().replace(/[:.]/g, "-");
const outputDirectory = args.outputDirectory ?? join(DEFAULT_OUTPUT_ROOT, runId);
const pdfRenderer = createPdfRenderer({ concurrency: DEFAULT_RENDER_CONCURRENCY });
const dependencies: CaseRunDependencies = {
  aiProvider: createAnthropicProvider({
    apiKey: AI_API_KEY,
    extract: { model: AI_MODEL_EXTRACT, effort: AI_EFFORT_EXTRACT },
    generate: { model: AI_MODEL_GENERATE, effort: AI_EFFORT_GENERATE },
  }),
  extractModel: AI_MODEL_EXTRACT,
  mathEvaluator: createMathjsEvaluator(),
  isMathMarkupParsable: isKatexParsable,
  pdfRenderer,
  now: () => new Date(),
};
const semaphore = createSemaphore(args.concurrency);

function textReferenceOf(caseId: string): CaseTextReference {
  return {
    personalDataTextList: personalDataTextListOf(variationList, caseId),
    materialPhraseList: materialPhraseMap[caseId] ?? [],
  };
}

function printCaseLine(caseId: string, result: CaseResult): void {
  const { failedCheckList, actualKitOutcome } = result.check;
  const checkText = failedCheckList.length === 0 ? "ok" : failedCheckList.join(", ");
  console.info(
    `${failedCheckList.length === 0 ? "✓" : "✗"} ${caseId}: kit ${actualKitOutcome}; ${checkText}`,
  );
}

async function executeCase(loadedCase: LoadedRegressionCase): Promise<CaseResult> {
  const { regressionCase } = loadedCase;
  const { caseId } = regressionCase;
  const photoList = await loadCasePhotoList(loadedCase, new Date());
  const request = caseRequestOf(regressionCase, photoList.ok ? photoList.value : []);
  console.info(`→ ${caseId}`);
  const outcome: CaseRunOutcome = photoList.ok
    ? await runRegressionCase(request, dependencies)
    : { kind: "crashed", stage: null, errorName: PHOTO_LOAD_ERROR_NAME };
  const check = checkRegressionCase(regressionCase, outcome, textReferenceOf(caseId));
  const caseOutputDirectory = join(outputDirectory, caseId);
  const summary = await writeCaseOutput(outcome, request, caseOutputDirectory);
  await Bun.write(join(caseOutputDirectory, "check.json"), toJson(check));
  return {
    regressionCase,
    check,
    summary,
    crash:
      outcome.kind === "crashed" ? { stage: outcome.stage, errorName: outcome.errorName } : null,
  };
}

async function runCase(loadedCase: LoadedRegressionCase): Promise<CaseResult> {
  const { regressionCase } = loadedCase;
  const result = await executeCase(loadedCase).catch((error: unknown): CaseResult => {
    const crashed: CaseRunOutcome = { kind: "crashed", stage: null, errorName: errorNameOf(error) };
    return {
      regressionCase,
      check: checkRegressionCase(regressionCase, crashed, textReferenceOf(regressionCase.caseId)),
      summary: null,
      crash: { stage: null, errorName: crashed.errorName },
    };
  });
  printCaseLine(regressionCase.caseId, result);
  return result;
}

try {
  const resultList = await Promise.all(
    selectedCaseList.map((loadedCase) => semaphore.run(() => runCase(loadedCase))),
  );
  const report = buildRegressionReport(resultList, {
    runId,
    aiSetting: {
      extractModel: AI_MODEL_EXTRACT,
      extractEffort: AI_EFFORT_EXTRACT ?? null,
      generateModel: AI_MODEL_GENERATE,
      generateEffort: AI_EFFORT_GENERATE ?? null,
    },
    startedAt,
    generationVersion: GENERATION_VERSION,
    isComplete: args.caseIdList === null,
    usdBrlRate: args.usdBrlRate,
  });
  const markdown = formatRegressionMarkdown(report);
  await Bun.write(join(outputDirectory, "report.json"), toJson(report));
  await Bun.write(join(outputDirectory, "report.md"), markdown);
  if (report.isComplete) {
    const docPath = join(DOC_DIRECTORY, regressionDocFileNameOf(report));
    await mkdir(DOC_DIRECTORY, { recursive: true });
    await Bun.write(docPath, markdown);
    console.info(`Resumo gravado em ${docPath}`);
  }
  console.info(`\n${formatRegressionTerminal(report, outputDirectory)}`);
  process.exitCode = report.criticalCaseIdList.length > 0 ? CRITICAL_EXIT_CODE : 0;
} finally {
  await pdfRenderer.close();
}
