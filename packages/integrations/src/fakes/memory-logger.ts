import type { LogLevel } from "@gizito/core";
import { createLogger } from "#src/logger.ts";

export type LogEntry = Record<string, unknown> & { level: number; msg: string };

export function createMemoryLogger({
  service = "test",
  level = "debug",
}: {
  service?: string;
  level?: LogLevel;
} = {}) {
  const lineList: string[] = [];
  const waiterList: { predicate: (entryList: LogEntry[]) => boolean; resolve: () => void }[] = [];
  const readEntryList = () => lineList.map((line) => JSON.parse(line) as LogEntry);
  const settleWaiterList = () => {
    const entryList = readEntryList();
    for (const waiter of waiterList.filter(({ predicate }) => predicate(entryList))) {
      waiterList.splice(waiterList.indexOf(waiter), 1);
      waiter.resolve();
    }
  };
  const logger = createLogger({
    service,
    level,
    destination: {
      write: (line: string) => {
        lineList.push(line);
        settleWaiterList();
      },
    },
  });
  const waitForEntryList = (predicate: (entryList: LogEntry[]) => boolean) =>
    new Promise<void>((resolve) => {
      waiterList.push({ predicate, resolve });
      settleWaiterList();
    });
  return { logger, lineList, readEntryList, waitForEntryList };
}
