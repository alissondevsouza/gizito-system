CREATE TYPE "public"."ai_stage" AS ENUM('extract', 'plan', 'generate', 'review');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('pending', 'paid', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."grade" AS ENUM('4', '5', '6', '7');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('order_link', 'kit_ready', 'kit_failed', 'whatsapp_linked', 'whatsapp_unlinked', 'whatsapp_help');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'analyzing', 'preview_ready', 'awaiting_payment', 'paid', 'processing', 'ready', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_gateway" AS ENUM('mercadopago', 'asaas', 'fake');--> statement-breakpoint
CREATE TYPE "public"."perceived_difficulty" AS ENUM('basic', 'intermediate', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."subject" AS ENUM('math', 'portuguese');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_kind" AS ENUM('content_error', 'delivery_problem', 'duplicate_payment', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."webhook_source" AS ENUM('mercadopago', 'whatsapp');--> statement-breakpoint
CREATE TABLE "ai_call" (
	"ai_call_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stage" "ai_stage" NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_token_count" integer NOT NULL,
	"output_token_count" integer NOT NULL,
	"cost_cents" numeric(12, 6) NOT NULL,
	"duration_ms" integer NOT NULL,
	"outcome_code" text NOT NULL,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_call_non_negative_check" CHECK ("ai_call"."input_token_count" >= 0 AND "ai_call"."output_token_count" >= 0 AND "ai_call"."cost_cents" >= 0 AND "ai_call"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "charge" (
	"charge_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gateway" "payment_gateway" NOT NULL,
	"gateway_order_id" text,
	"gateway_payment_id" text,
	"amount_cents" integer NOT NULL,
	"status" charge_status DEFAULT 'pending' NOT NULL,
	"qr_code" text NOT NULL,
	"qr_code_base64" text NOT NULL,
	"ticket_url" text,
	"expire_datetime" timestamp with time zone NOT NULL,
	"paid_datetime" timestamp with time zone,
	"refund_id" text,
	"refund_datetime" timestamp with time zone,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charge_amount_cents_check" CHECK ("charge"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "kit" (
	"kit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"study_kit" jsonb,
	"generation_version" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"activities_storage_key" text NOT NULL,
	"answer_key_storage_key" text NOT NULL,
	"page_count_activities" integer NOT NULL,
	"page_count_answer_key" integer NOT NULL,
	"published_datetime" timestamp with time zone NOT NULL,
	"superseded_by_kit_id" uuid,
	"delete_datetime" timestamp with time zone,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kit_page_count_check" CHECK ("kit"."page_count_activities" > 0 AND "kit"."page_count_answer_key" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"notification_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"error_code" text,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"order_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"short_code" text NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"grade" "grade" NOT NULL,
	"subject" "subject" NOT NULL,
	"email" text,
	"topic_id_list" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"other_topic_text" text,
	"note_text" text,
	"perceived_difficulty" "perceived_difficulty",
	"material_profile" jsonb,
	"whatsapp_phone" text,
	"whatsapp_consent_datetime" timestamp with time zone,
	"paid_datetime" timestamp with time zone,
	"ready_datetime" timestamp with time zone,
	"fail_reason_code" text,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_whatsapp_consent_check" CHECK (("order"."whatsapp_phone" IS NULL) = ("order"."whatsapp_consent_datetime" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "order_photo" (
	"order_photo_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"legibility_score" real,
	"delete_datetime" timestamp with time zone,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_photo_dimensions_check" CHECK ("order_photo"."width" > 0 AND "order_photo"."height" > 0),
	CONSTRAINT "order_photo_legibility_score_check" CHECK ("order_photo"."legibility_score" IS NULL OR ("order_photo"."legibility_score" >= 0 AND "order_photo"."legibility_score" <= 1))
);
--> statement-breakpoint
CREATE TABLE "support_ticket" (
	"support_ticket_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "support_ticket_kind" NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"note_text" text,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"webhook_event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "webhook_source" NOT NULL,
	"external_id" text NOT NULL,
	"received_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_datetime" timestamp with time zone,
	"outcome_code" text,
	"insert_datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"update_datetime" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_order_id_order_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge" ADD CONSTRAINT "charge_order_id_order_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_order_id_order_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_superseded_by_kit_id_kit_kit_id_fk" FOREIGN KEY ("superseded_by_kit_id") REFERENCES "public"."kit"("kit_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_order_id_order_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_photo" ADD CONSTRAINT "order_photo_order_id_order_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_order_id_order_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_order_id_idx" ON "ai_call" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "charge_order_id_idx" ON "charge" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charge_gateway_payment_id_idx" ON "charge" USING btree ("gateway_payment_id") WHERE "charge"."gateway_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "charge_status_expire_datetime_idx" ON "charge" USING btree ("status","expire_datetime");--> statement-breakpoint
CREATE INDEX "kit_order_id_idx" ON "kit" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "kit_delete_datetime_published_datetime_idx" ON "kit" USING btree ("delete_datetime","published_datetime");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_order_id_kind_channel_idx" ON "notification" USING btree ("order_id","kind","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "order_public_token_idx" ON "order" USING btree ("public_token");--> statement-breakpoint
CREATE UNIQUE INDEX "order_short_code_idx" ON "order" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "order_status_update_datetime_idx" ON "order" USING btree ("status","update_datetime");--> statement-breakpoint
CREATE INDEX "order_email_idx" ON "order" USING btree ("email");--> statement-breakpoint
CREATE INDEX "order_photo_order_id_idx" ON "order_photo" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_photo_delete_datetime_insert_datetime_idx" ON "order_photo" USING btree ("delete_datetime","insert_datetime");--> statement-breakpoint
CREATE INDEX "support_ticket_order_id_idx" ON "support_ticket" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "support_ticket_status_idx" ON "support_ticket" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_source_external_id_idx" ON "webhook_event" USING btree ("source","external_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_update_datetime() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.update_datetime := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "order" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "order_photo" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "charge" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "kit" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "ai_call" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "webhook_event" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "notification" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();--> statement-breakpoint
CREATE TRIGGER "set_update_datetime" BEFORE UPDATE ON "support_ticket" FOR EACH ROW EXECUTE FUNCTION set_update_datetime();
