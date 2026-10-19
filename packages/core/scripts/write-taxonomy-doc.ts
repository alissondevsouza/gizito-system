import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TAXONOMY_VERSION, taxonomyTopicList } from "#src/pedagogy/taxonomy/index.ts";
import { renderTaxonomyMarkdown } from "#src/pedagogy/taxonomy/markdown.ts";
import { unsupportedTopicList } from "#src/pedagogy/taxonomy/unsupported.ts";

const taxonomyDocPath = join(import.meta.dir, "../../../docs/pedagogy/taxonomia.md");

writeFileSync(
  taxonomyDocPath,
  renderTaxonomyMarkdown({
    topicList: taxonomyTopicList,
    taxonomyVersion: TAXONOMY_VERSION,
    unsupportedTopicList,
  }),
);
