import { describe, expect, it } from "bun:test";
import { jobNameList, ok } from "@gizito/core";
import {
  buildJobLaneList,
  DEFAULT_LANE_CONCURRENCY,
  listHandledJobNames,
} from "#src/runner/lanes.ts";

describe("raias de concorrência (jobs.md §1)", () => {
  it("com todos os handlers, cada job está em exatamente uma raia", () => {
    const laneList = buildJobLaneList(jobNameList, { generateConcurrency: 3 });
    const laneNameList = laneList.flatMap((lane) => lane.nameList);
    expect([...laneNameList].sort()).toEqual([...jobNameList].sort());
    expect(laneList.map(({ key, concurrency }) => ({ key, concurrency }))).toEqual([
      { key: "generate", concurrency: 3 },
      { key: "charge_reconcile", concurrency: 1 },
      { key: "retention_purge", concurrency: 1 },
      { key: "default", concurrency: DEFAULT_LANE_CONCURRENCY },
    ]);
  });

  it("raia só leva nomes com handler e some quando não sobra nenhum", () => {
    expect(buildJobLaneList(["order.notify"], { generateConcurrency: 2 })).toEqual([
      { key: "default", nameList: ["order.notify"], concurrency: DEFAULT_LANE_CONCURRENCY },
    ]);
    expect(buildJobLaneList([], { generateConcurrency: 2 })).toEqual([]);
  });

  it("lista os nomes com handler na ordem do core", () => {
    const handler = async () => ok(null);
    expect(listHandledJobNames({ "order.notify": handler, "order.analyze": handler })).toEqual([
      "order.analyze",
      "order.notify",
    ]);
    expect(listHandledJobNames({})).toEqual([]);
  });
});
