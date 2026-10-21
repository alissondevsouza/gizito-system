import { type StudyKit, type Subject, studyKitSchema } from "@gizito/core";

const fixtureFileNameMap: Readonly<Record<Subject, string>> = {
  math: "study-kit-math.json",
  portuguese: "study-kit-portuguese.json",
};

export async function loadRealStudyKit(subject: Subject): Promise<StudyKit> {
  const fileUrl = new URL(fixtureFileNameMap[subject], import.meta.url);
  return studyKitSchema.parse(await Bun.file(fileUrl).json());
}

export const FIXED_GENERATED_AT = new Date("2026-10-21T15:00:00.000Z");

export async function listHtmlOutline(html: string): Promise<readonly string[]> {
  const outline: string[] = [];
  let headingText: { tag: string; text: string } | null = null;
  await new HTMLRewriter()
    .on("[data-section]", {
      element(element) {
        outline.push(`section:${element.getAttribute("data-section")}`);
      },
    })
    .on("[data-kit-item]", {
      element(element) {
        outline.push(`item:${element.getAttribute("data-kit-item")}`);
      },
    })
    .on("[data-kit-answer]", {
      element(element) {
        outline.push(`answer:${element.getAttribute("data-kit-answer")}`);
      },
    })
    .on("[data-base-text]", {
      element(element) {
        outline.push(`base-text:${element.getAttribute("data-base-text")}`);
      },
    })
    .on("h1, h2", {
      element(element) {
        const current = { tag: element.tagName, text: "" };
        headingText = current;
        element.onEndTag(() => {
          outline.push(`${current.tag}:${current.text.replace(/\s+/g, " ").trim()}`);
        });
      },
      text(text) {
        if (headingText !== null) headingText.text += text.text;
      },
    })
    .transform(new Response(html))
    .text();
  return outline;
}

export type ParsedElement = {
  readonly tagName: string;
  readonly attributeNameList: readonly string[];
};

export async function listParsedElement(html: string): Promise<readonly ParsedElement[]> {
  const elementList: ParsedElement[] = [];
  await new HTMLRewriter()
    .on("*", {
      element(element) {
        elementList.push({
          tagName: element.tagName,
          attributeNameList: [...element.attributes].map(([name]) => name),
        });
      },
    })
    .transform(new Response(html))
    .text();
  return elementList;
}
