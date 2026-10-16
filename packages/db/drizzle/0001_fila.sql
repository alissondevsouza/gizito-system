CREATE TYPE "public"."job_name" AS ENUM('order.analyze', 'order.generate', 'order.notify', 'charge.reconcile', 'retention.purge', 'whatsapp.inbound');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'active', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "job" (
	"job_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" "job_name" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"singleton_key" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempt_count" integer DEFAULT 4 NOT NULL,
	"run_after_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"lock_expire_datetime" timestamp with time zone,
	"finish_datetime" timestamp with time zone,
	"last_error_code" text,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_attempt_count_check" CHECK ("job"."attempt_count" >= 0),
	CONSTRAINT "job_max_attempt_count_check" CHECK ("job"."max_attempt_count" >= 1),
	CONSTRAINT "job_payload_name_check" CHECK ("job"."payload"->>'name' IS NOT DISTINCT FROM "job"."name"::text)
);
--> statement-breakpoint
CREATE INDEX "job_status_name_run_after_datetime_idx" ON "job" USING btree ("status","name","run_after_datetime");--> statement-breakpoint
CREATE INDEX "job_status_lock_expire_datetime_idx" ON "job" USING btree ("status","lock_expire_datetime");--> statement-breakpoint
CREATE UNIQUE INDEX "job_name_singleton_key_idx" ON "job" USING btree ("name","singleton_key") WHERE "job"."singleton_key" IS NOT NULL AND "job"."status" IN ('pending', 'active');--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "job" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();
