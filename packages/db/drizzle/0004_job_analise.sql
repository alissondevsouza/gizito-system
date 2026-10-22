CREATE TABLE "extraction_cache" (
	"extraction_cache_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"extraction" jsonb NOT NULL,
	"issue_list" jsonb NOT NULL,
	"expire_datetime" timestamp with time zone NOT NULL,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_cache_cache_key_idx" ON "extraction_cache" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "extraction_cache_expire_datetime_idx" ON "extraction_cache" USING btree ("expire_datetime");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_analysis_check" CHECK (CASE "order"."status" WHEN 'analyzing' THEN "order"."analysis" IS NULL WHEN 'preview_ready' THEN "order"."analysis"->>'outcome' IS NOT DISTINCT FROM 'preview_ready' ELSE true END);--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "extraction_cache" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();