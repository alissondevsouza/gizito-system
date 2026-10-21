import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildPipelineSummary, type PipelineSummary } from "#src/cli/pipeline-report.ts";
import type { PipelineRequest, PipelineRun } from "#src/pipeline/run-pipeline.ts";

export function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writePipelineOutput(
  run: PipelineRun,
  request: PipelineRequest,
  outputDirectory: string,
): Promise<PipelineSummary> {
  await mkdir(outputDirectory, { recursive: true });
  const { generation, render } = run;
  if (generation?.ok) {
    await Bun.write(join(outputDirectory, "study_kit.json"), toJson(generation.value.studyKit));
  } else if (generation?.error.lastStudyKit) {
    await Bun.write(
      join(outputDirectory, "study_kit.failed.json"),
      toJson(generation.error.lastStudyKit),
    );
  }
  if (render?.ok) {
    await Bun.write(join(outputDirectory, "activities.pdf"), render.value.activities.bytes);
    await Bun.write(join(outputDirectory, "answer-key.pdf"), render.value.answerKey.bytes);
  }
  const summary = buildPipelineSummary(run, request);
  await Bun.write(join(outputDirectory, "summary.json"), toJson(summary));
  return summary;
}
