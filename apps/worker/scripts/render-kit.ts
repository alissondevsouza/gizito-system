import { mkdir } from "node:fs/promises";
import { studyKitSchema } from "@gizito/core";
import { DEFAULT_RENDER_CONCURRENCY } from "#src/config.ts";
import { createPdfRenderer } from "#src/render/pdf-renderer.ts";
import { renderKit } from "#src/render/render-kit.ts";

const [studyKitPath, outputDirectory] = process.argv.slice(2);
if (studyKitPath === undefined || outputDirectory === undefined) {
  console.error("uso: bun run render:kit <study_kit.json> <pasta>");
  process.exit(1);
}

const parsed = studyKitSchema.safeParse(await Bun.file(studyKitPath).json());
if (!parsed.success) {
  console.error("study_kit inválido nos campos:");
  for (const issue of parsed.error.issues)
    console.error(`- ${issue.path.join(".")}: ${issue.code}`);
  process.exit(1);
}

const pdfRenderer = createPdfRenderer({ concurrency: DEFAULT_RENDER_CONCURRENCY });
try {
  const result = await renderKit(
    { studyKit: parsed.data, generatedAt: new Date() },
    { pdfRenderer },
  );
  if (!result.ok) {
    console.error(
      JSON.stringify({
        code: result.error.code,
        issueList: result.error.issueList.map((issue) => `${issue.code}:${issue.itemId ?? "-"}`),
        errorNameList: result.error.errorNameList,
        durationMs: result.error.durationMs,
      }),
    );
    process.exitCode = 1;
  } else {
    await mkdir(outputDirectory, { recursive: true });
    await Bun.write(`${outputDirectory}/activities.pdf`, result.value.activities.bytes);
    await Bun.write(`${outputDirectory}/answer-key.pdf`, result.value.answerKey.bytes);
    console.info(
      JSON.stringify({
        activities: {
          pageCount: result.value.activities.pageCount,
          attemptCount: result.value.activities.attemptCount,
        },
        answerKey: {
          pageCount: result.value.answerKey.pageCount,
          attemptCount: result.value.answerKey.attemptCount,
        },
        warningCodeList: result.value.warningList.map((issue) => issue.code),
        durationMs: result.value.durationMs,
      }),
    );
  }
} finally {
  await pdfRenderer.close();
}
