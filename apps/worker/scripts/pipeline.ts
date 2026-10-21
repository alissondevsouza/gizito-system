import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createAnthropicProvider,
  createMathjsEvaluator,
  isKatexParsable,
} from "@gizito/integrations";
import {
  loadPipelinePhotoList,
  PIPELINE_USAGE,
  parseAiEnvironment,
  parsePipelineArgs,
} from "#src/cli/pipeline-input.ts";
import { toJson, writePipelineOutput } from "#src/cli/pipeline-output.ts";
import {
  buildPipelineCrashSummary,
  formatPipelineCrashSummary,
  formatPipelineSummary,
} from "#src/cli/pipeline-report.ts";
import { DEFAULT_RENDER_CONCURRENCY } from "#src/config.ts";
import {
  type PipelineRequest,
  type PipelineStage,
  runPipeline,
} from "#src/pipeline/run-pipeline.ts";
import { createPdfRenderer } from "#src/render/pdf-renderer.ts";

const USAGE_EXIT_CODE = 2;
const FAILED_EXIT_CODE = 1;
const CRASHED_EXIT_CODE = 3;
const DEFAULT_OUTPUT_ROOT = "tests/pedagogy/output/pipeline";

const stageStartTextMap: Readonly<Record<PipelineStage, string>> = {
  analyze: "Lendo as fotos…",
  confirm: "Confirmando os assuntos…",
  generate: "Gerando o kit: plano, questões, validação e revisão (alguns minutos)…",
  render: "Montando os dois PDFs…",
};

function exitWithUsage(errorList: readonly string[]): never {
  for (const error of errorList) console.error(`- ${error}`);
  console.error(`\n${PIPELINE_USAGE}`);
  process.exit(USAGE_EXIT_CODE);
}

const parsed = parsePipelineArgs(process.argv.slice(2));
if (!parsed.ok) exitWithUsage(parsed.error);
const args = parsed.value;

const environment = parseAiEnvironment(process.env);
if (!environment.ok) exitWithUsage(environment.error);
const { AI_API_KEY, AI_MODEL_EXTRACT, AI_MODEL_GENERATE, AI_EFFORT_EXTRACT, AI_EFFORT_GENERATE } =
  environment.value;

const loaded = await loadPipelinePhotoList(args.photoPathList, new Date());
if (!loaded.ok) exitWithUsage(loaded.error);

const outputDirectory =
  args.outputDirectory ?? join(DEFAULT_OUTPUT_ROOT, new Date().toISOString().replace(/[:.]/g, "-"));
const request: PipelineRequest = {
  grade: args.grade,
  subject: args.subject,
  photoList: loaded.value,
  topicIdList: args.topicIdList,
  otherTopicText: args.otherTopicText,
  perceivedDifficulty: args.perceivedDifficulty,
  noteText: args.noteText,
};
const aiProvider = createAnthropicProvider({
  apiKey: AI_API_KEY,
  extract: { model: AI_MODEL_EXTRACT, effort: AI_EFFORT_EXTRACT },
  generate: { model: AI_MODEL_GENERATE, effort: AI_EFFORT_GENERATE },
});
const pdfRenderer = createPdfRenderer({ concurrency: DEFAULT_RENDER_CONCURRENCY });
const progress: { stage: PipelineStage | null } = { stage: null };
try {
  const run = await runPipeline(request, {
    aiProvider,
    extractModel: AI_MODEL_EXTRACT,
    mathEvaluator: createMathjsEvaluator(),
    isMathMarkupParsable: isKatexParsable,
    pdfRenderer,
    now: () => new Date(),
    onStageStart: (stage) => {
      progress.stage = stage;
      console.info(stageStartTextMap[stage]);
    },
  });
  const summary = await writePipelineOutput(run, request, outputDirectory);
  console.info(`\n${formatPipelineSummary(summary, outputDirectory)}`);
  process.exitCode = run.outcome.status === "ready" ? 0 : FAILED_EXIT_CODE;
} catch (error) {
  const crashSummary = buildPipelineCrashSummary(progress.stage, error);
  await mkdir(outputDirectory, { recursive: true });
  await Bun.write(join(outputDirectory, "summary.json"), toJson(crashSummary));
  console.error(formatPipelineCrashSummary(crashSummary, outputDirectory));
  process.exitCode = CRASHED_EXIT_CODE;
} finally {
  await pdfRenderer.close();
}
