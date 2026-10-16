import { personalDataJobNameList, personalDataJobRetainedFieldMap } from "@gizito/core";
import { and, eq, type SQL, sql } from "drizzle-orm";
import { job } from "#src/schema/job.ts";

export type JobLease = {
  jobId: string;
  attemptCount: number;
  maxAttemptCount: number;
};

export function activeLeaseCondition(lease: JobLease): SQL | undefined {
  return and(
    eq(job.jobId, lease.jobId),
    eq(job.attemptCount, lease.attemptCount),
    eq(job.status, "active"),
  );
}

export function finishedPayloadSql(): SQL {
  const whenList = personalDataJobNameList.map((name) => {
    const pairList = personalDataJobRetainedFieldMap[name].map(
      (field) => sql`${field}::text, ${job.payload} -> ${field}::text`,
    );
    return sql`WHEN ${name} THEN jsonb_build_object(${sql.join(pairList, sql`, `)})`;
  });
  return sql`CASE ${job.name} ${sql.join(whenList, sql` `)} ELSE ${job.payload} END`;
}
