import { describe, expect, it } from "bun:test";
import {
  aiStageList,
  chargeStatusList,
  gradeList,
  jobNameList,
  jobStatusList,
  notificationChannelList,
  notificationKindList,
  notificationStatusList,
  orderStatusList,
  paymentGatewayList,
  perceivedDifficultyList,
  subjectList,
  supportTicketKindList,
  supportTicketStatusList,
  webhookSourceList,
} from "@gizito/core";
import { is } from "drizzle-orm";
import { PgEnumColumn } from "drizzle-orm/pg-core";
import {
  aiStageEnum,
  chargeStatusEnum,
  gradeEnum,
  jobNameEnum,
  jobStatusEnum,
  notificationChannelEnum,
  notificationKindEnum,
  notificationStatusEnum,
  orderStatusEnum,
  paymentGatewayEnum,
  perceivedDifficultyEnum,
  subjectEnum,
  supportTicketKindEnum,
  supportTicketStatusEnum,
  webhookSourceEnum,
} from "#src/schema/enums.ts";
import * as schema from "#src/schema/index.ts";

const enumCaseList = [
  { pgEnum: orderStatusEnum, name: "order_status", list: orderStatusList },
  { pgEnum: gradeEnum, name: "grade", list: gradeList },
  { pgEnum: subjectEnum, name: "subject", list: subjectList },
  { pgEnum: chargeStatusEnum, name: "charge_status", list: chargeStatusList },
  { pgEnum: paymentGatewayEnum, name: "payment_gateway", list: paymentGatewayList },
  { pgEnum: perceivedDifficultyEnum, name: "perceived_difficulty", list: perceivedDifficultyList },
  { pgEnum: aiStageEnum, name: "ai_stage", list: aiStageList },
  { pgEnum: notificationChannelEnum, name: "notification_channel", list: notificationChannelList },
  { pgEnum: notificationKindEnum, name: "notification_kind", list: notificationKindList },
  { pgEnum: notificationStatusEnum, name: "notification_status", list: notificationStatusList },
  { pgEnum: webhookSourceEnum, name: "webhook_source", list: webhookSourceList },
  { pgEnum: supportTicketKindEnum, name: "support_ticket_kind", list: supportTicketKindList },
  { pgEnum: supportTicketStatusEnum, name: "support_ticket_status", list: supportTicketStatusList },
  { pgEnum: jobNameEnum, name: "job_name", list: jobNameList },
  { pgEnum: jobStatusEnum, name: "job_status", list: jobStatusList },
] as const;

describe("enums do banco", () => {
  it("são quinze", () => {
    expect(enumCaseList).toHaveLength(15);
  });

  for (const { pgEnum, name, list } of enumCaseList) {
    it(`${name} tem exatamente os valores da lista do core`, () => {
      expect(pgEnum.enumName).toBe(name);
      expect(pgEnum.enumValues).toEqual([...list]);
    });
  }

  it("toda coluna enum do schema usa um dos quinze enums", () => {
    const knownNameList: string[] = enumCaseList.map((enumCase) => enumCase.name);
    for (const table of schema.tableList) {
      for (const column of Object.values(table)) {
        if (is(column, PgEnumColumn)) {
          expect(knownNameList).toContain(column.enum.enumName);
        }
      }
    }
  });
});
