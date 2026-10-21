import type { KitTemplate } from "#src/render/templates/index.ts";
import { activitiesDocument } from "#src/render/templates/kit-v1/activities.ts";
import { answerKeyDocument } from "#src/render/templates/kit-v1/answer-key.ts";

export const kitV1Template: KitTemplate = {
  activities: activitiesDocument,
  answerKey: answerKeyDocument,
};
