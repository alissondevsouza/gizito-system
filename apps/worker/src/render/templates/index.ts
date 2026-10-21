import type { StudyKit } from "@gizito/core";
import type { RenderDocument } from "#src/render/document.ts";
import type { KitTemplateContext } from "#src/render/templates/kit-v1/common.ts";
import { kitV1Template } from "#src/render/templates/kit-v1/index.ts";

export type KitTemplate = {
  readonly activities: (studyKit: StudyKit, context: KitTemplateContext) => RenderDocument;
  readonly answerKey: (studyKit: StudyKit, context: KitTemplateContext) => RenderDocument;
};

export const kitTemplateMap: Readonly<Record<StudyKit["formatVersion"], KitTemplate>> = {
  "kit-v1": kitV1Template,
};
