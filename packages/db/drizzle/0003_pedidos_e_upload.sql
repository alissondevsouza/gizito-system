CREATE TABLE "preview_request" (
	"preview_request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_ip_hash" text NOT NULL,
	"device_hash" text NOT NULL,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preview_request_client_ip_hash_check" CHECK ("preview_request"."client_ip_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "preview_request_device_hash_check" CHECK ("preview_request"."device_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "order_photo" ADD COLUMN "photo_index" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "order_photo" ADD COLUMN "replaced_datetime" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "preview_request_client_ip_hash_insert_datetime_idx" ON "preview_request" USING btree ("client_ip_hash","insert_datetime");--> statement-breakpoint
CREATE INDEX "preview_request_device_hash_insert_datetime_idx" ON "preview_request" USING btree ("device_hash","insert_datetime");--> statement-breakpoint
CREATE INDEX "preview_request_insert_datetime_idx" ON "preview_request" USING btree ("insert_datetime");--> statement-breakpoint
CREATE UNIQUE INDEX "order_photo_order_id_photo_index_idx" ON "order_photo" USING btree ("order_id","photo_index") WHERE "order_photo"."replaced_datetime" IS NULL;--> statement-breakpoint
ALTER TABLE "order_photo" ADD CONSTRAINT "order_photo_photo_index_check" CHECK ("order_photo"."photo_index" >= 0 AND "order_photo"."photo_index" < 5);--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "preview_request" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();
