DROP INDEX "job_status_name_run_after_datetime_idx";--> statement-breakpoint
DROP INDEX "job_status_lock_expire_datetime_idx";--> statement-breakpoint
DROP INDEX "notification_order_id_kind_channel_idx";--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "recipient_hash" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "charge_gateway_gateway_order_id_idx" ON "charge" USING btree ("gateway","gateway_order_id") WHERE "charge"."gateway_order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "job_pending_name_run_after_datetime_idx" ON "job" USING btree ("name","run_after_datetime","insert_datetime") WHERE "job"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "job_active_lock_expire_datetime_idx" ON "job" USING btree ("lock_expire_datetime") WHERE "job"."status" = 'active';--> statement-breakpoint
CREATE INDEX "job_failed_finish_datetime_idx" ON "job" USING btree ("finish_datetime") WHERE "job"."status" = 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX "notification_order_id_kind_channel_recipient_hash_idx" ON "notification" USING btree ("order_id","kind","channel","recipient_hash");--> statement-breakpoint
CREATE INDEX "notification_recipient_hash_kind_insert_datetime_idx" ON "notification" USING btree ("recipient_hash","kind","insert_datetime");--> statement-breakpoint
CREATE INDEX "order_whatsapp_phone_idx" ON "order" USING btree ("whatsapp_phone") WHERE "order"."whatsapp_phone" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "order_photo_content_hash_idx" ON "order_photo" USING btree ("content_hash");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_order_id_check" CHECK (("notification"."order_id" IS NULL) = ("notification"."kind" = 'whatsapp_help'));--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_hash_check" CHECK ("notification"."recipient_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_topic_id_list_check" CHECK (CASE WHEN jsonb_typeof("order"."topic_id_list") = 'array' THEN jsonb_array_length("order"."topic_id_list") + ("order"."other_topic_text" IS NOT NULL)::int <= 3 ELSE false END);