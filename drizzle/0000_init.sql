CREATE TYPE "public"."conversation_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('senior', 'haven');--> statement-breakpoint
CREATE TYPE "public"."new_payee_mode" AS ENUM('always', 'over_amount');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('awaiting_confirmation', 'held', 'approved', 'sending', 'sent', 'failed', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "caregivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"senior_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"senior_id" uuid NOT NULL,
	"conversation_id" uuid,
	"trusted_payee_id" uuid,
	"payee_name" text NOT NULL,
	"payee_email" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"purpose" text,
	"status" "payment_status" NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"ai_risk_level" "risk_level",
	"reason" text,
	"ai_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules_triggered" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paypal_batch_id" text,
	"paypal_item_id" text,
	"paypal_status" text,
	"paypal_error" text,
	"decided_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_settings" (
	"senior_id" uuid PRIMARY KEY NOT NULL,
	"max_single_payment_cents" integer NOT NULL,
	"daily_limit_cents" integer NOT NULL,
	"new_payee_mode" "new_payee_mode" DEFAULT 'always' NOT NULL,
	"new_payee_threshold_cents" integer DEFAULT 20000 NOT NULL,
	"rapid_max_count" integer DEFAULT 3 NOT NULL,
	"rapid_window_minutes" integer DEFAULT 60 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seniors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"caregiver_id" uuid NOT NULL,
	"time_zone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"senior_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"paypal_email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_senior_id_seniors_id_fk" FOREIGN KEY ("senior_id") REFERENCES "public"."seniors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_senior_id_seniors_id_fk" FOREIGN KEY ("senior_id") REFERENCES "public"."seniors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_trusted_payee_id_trusted_payees_id_fk" FOREIGN KEY ("trusted_payee_id") REFERENCES "public"."trusted_payees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_settings" ADD CONSTRAINT "rule_settings_senior_id_seniors_id_fk" FOREIGN KEY ("senior_id") REFERENCES "public"."seniors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seniors" ADD CONSTRAINT "seniors_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_payees" ADD CONSTRAINT "trusted_payees_senior_id_seniors_id_fk" FOREIGN KEY ("senior_id") REFERENCES "public"."seniors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_senior_created_idx" ON "payments" USING btree ("senior_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_batch_idx" ON "payments" USING btree ("paypal_batch_id");--> statement-breakpoint
CREATE INDEX "payments_updated_idx" ON "payments" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "trusted_payees_senior_idx" ON "trusted_payees" USING btree ("senior_id");