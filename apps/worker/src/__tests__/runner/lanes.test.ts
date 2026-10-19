import { describe, expect, it } from "bun:test";
import { jobNameList, ok } from "@gizito/core";
import {
  buildJobLaneList,
  CHARGE_RECONCILE_LANE_CONCURRENCY,
  countWorkerConnections,
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
      { key: "charge_reconcile", concurrency: CHARGE_RECONCILE_LANE_CONCURRENCY },
      { key: "retention_purge", concurrency: 1 },
      { key: "analyze", concurrency: DEFAULT_LANE_CONCURRENCY },
      { key: "default", concurrency: DEFAULT_LANE_CONCURRENCY },
    ]);
    expect(CHARGE_RECONCILE_LANE_CONCURRENCY).toBe(2);
  });

  it("a prévia não divide vaga com notificação e WhatsApp", () => {
    const laneList = buildJobLaneList(jobNameList, { generateConcurrency: 2 });
    expect(laneList.find((lane) => lane.key === "analyze")?.nameList).toEqual(["order.analyze"]);
    expect(laneList.find((lane) => lane.key === "default")?.nameList).toEqual([
      "order.notify",
      "whatsapp.inbound",
    ]);
  });

  it("o pool tem duas conexões por vaga (handler e renovação do lease) mais folga", () => {
    const laneList = buildJobLaneList(jobNameList, { generateConcurrency: 2 });
    expect(countWorkerConnections(laneList)).toBe((2 + 2 + 1 + 2 + 2) * 2 + 2);
    expect(countWorkerConnections([])).toBe(2);
  });

  it("raia só leva nomes com handler e some quando não sobra nenhum", () => {
    expect(buildJobLaneList(["order.notify"], { generateConcurrency: 2 })).toEqual([
      { key: "default", nameList: ["order.notify"], concurrency: DEFAULT_LANE_CONCURRENCY },
    ]);
    expect(buildJobLaneList([], { generateConcurrency: 2 })).toEqual([]);
  });

  it("lista os nomes com handler na ordem do core", () => {
    const handler = async () => ok(null);
    expect(
      listHandledJobNames({
        "order.notify": { handle: handler },
        "order.analyze": { handle: handler },
      }),
    ).toEqual(["order.analyze", "order.notify"]);
    expect(listHandledJobNames({})).toEqual([]);
  });
});
