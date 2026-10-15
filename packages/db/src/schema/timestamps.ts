import { timestamp } from "drizzle-orm/pg-core";

export function datetime(name: string) {
  return timestamp(name, { withTimezone: true, mode: "date" });
}

export const timestampColumnMap = {
  insertDatetime: datetime("insert_datetime").notNull().defaultNow(),
  updateDatetime: datetime("update_datetime").notNull().defaultNow(),
};
