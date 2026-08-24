CREATE TABLE "demo_daily_aggregate" (
	"day" date PRIMARY KEY,
	"environment_count" integer DEFAULT 0 NOT NULL,
	"expired_count" integer DEFAULT 0 NOT NULL,
	"ended_by_demo_user_count" integer DEFAULT 0 NOT NULL,
	"operator_terminated_count" integer DEFAULT 0 NOT NULL,
	"reported_count" integer DEFAULT 0 NOT NULL,
	"provisioning_failed_count" integer DEFAULT 0 NOT NULL,
	"fleet_deleted_count" integer DEFAULT 0 NOT NULL,
	"document_created_count" integer DEFAULT 0 NOT NULL,
	"vault_created_count" integer DEFAULT 0 NOT NULL,
	"link_created_count" integer DEFAULT 0 NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"delivered_bytes" bigint DEFAULT 0 NOT NULL,
	"refusal_count" integer DEFAULT 0 NOT NULL,
	"aggregated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_environment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"anonymous_reference" varchar(12) NOT NULL,
	"state" text DEFAULT 'provisioning' NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"uploaded_document_count" integer DEFAULT 0 NOT NULL,
	"vault_count" integer DEFAULT 0 NOT NULL,
	"link_count" integer DEFAULT 0 NOT NULL,
	"pending_upload_count" integer DEFAULT 0 NOT NULL,
	"confirmation_count" integer DEFAULT 0 NOT NULL,
	"upload_key_lifetime_count" integer DEFAULT 0 NOT NULL,
	"document_lifetime_count" integer DEFAULT 0 NOT NULL,
	"vault_lifetime_count" integer DEFAULT 0 NOT NULL,
	"link_lifetime_count" integer DEFAULT 0 NOT NULL,
	"confirmed_bytes" bigint DEFAULT 0 NOT NULL,
	"reserved_upload_bytes" bigint DEFAULT 0 NOT NULL,
	"delivered_bytes" bigint DEFAULT 0 NOT NULL,
	"visit_lifetime_count" integer DEFAULT 0 NOT NULL,
	"event_lifetime_count" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"refusal_count" integer DEFAULT 0 NOT NULL,
	"refusal_first_at" timestamp with time zone,
	"refusal_last_at" timestamp with time zone,
	"analytics_incomplete" boolean DEFAULT false NOT NULL,
	CONSTRAINT "demo_environment_state_check" CHECK ("state" IN ('provisioning', 'active', 'global_paused', 'report_paused', 'terminating', 'completed')),
	CONSTRAINT "demo_environment_end_reason_check" CHECK ("end_reason" IS NULL OR "end_reason" IN ('expired', 'ended_by_demo_user', 'operator_terminated', 'reported', 'provisioning_failed', 'fleet_deleted')),
	CONSTRAINT "demo_environment_expiry_check" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "demo_environment_nonnegative_usage_check" CHECK ("state_version" >= 0
        AND "document_count" >= 0
        AND "uploaded_document_count" >= 0
        AND "vault_count" >= 0
        AND "link_count" >= 0
        AND "pending_upload_count" >= 0
        AND "confirmation_count" >= 0
        AND "upload_key_lifetime_count" >= 0
        AND "document_lifetime_count" >= 0
        AND "vault_lifetime_count" >= 0
        AND "link_lifetime_count" >= 0
        AND "confirmed_bytes" >= 0
        AND "reserved_upload_bytes" >= 0
        AND "delivered_bytes" >= 0
        AND "visit_lifetime_count" >= 0
        AND "event_lifetime_count" >= 0
        AND "report_count" >= 0
        AND "refusal_count" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "demo_global_usage" (
	"id" text PRIMARY KEY DEFAULT 'demo-global',
	"active_environment_count" integer DEFAULT 0 NOT NULL,
	"confirmed_bytes" bigint DEFAULT 0 NOT NULL,
	"pending_upload_count" integer DEFAULT 0 NOT NULL,
	"confirmation_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_global_usage_singleton_check" CHECK ("id" = 'demo-global'),
	CONSTRAINT "demo_global_usage_nonnegative_check" CHECK ("active_environment_count" >= 0
        AND "confirmed_bytes" >= 0
        AND "pending_upload_count" >= 0
        AND "confirmation_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "demo_report" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"environment_id" uuid NOT NULL,
	"link_id" uuid,
	"category" text NOT NULL,
	"details" varchar(280),
	"network_hash" text NOT NULL,
	"rate_limit_window_started_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "demo_report_category_check" CHECK ("category" IN ('spam_or_phishing', 'malware_or_suspicious_download', 'harmful_or_illegal_content')),
	CONSTRAINT "demo_report_expiry_check" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "demo_summary" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"retain_until" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"end_reason" text NOT NULL,
	"document_created_count" integer DEFAULT 0 NOT NULL,
	"vault_created_count" integer DEFAULT 0 NOT NULL,
	"link_created_count" integer DEFAULT 0 NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"delivered_bytes" bigint DEFAULT 0 NOT NULL,
	"peak_document_count" integer DEFAULT 0 NOT NULL,
	"peak_vault_count" integer DEFAULT 0 NOT NULL,
	"peak_link_count" integer DEFAULT 0 NOT NULL,
	"peak_confirmed_bytes" bigint DEFAULT 0 NOT NULL,
	"refusal_count" integer DEFAULT 0 NOT NULL,
	"analytics_incomplete" boolean DEFAULT false NOT NULL,
	CONSTRAINT "demo_summary_end_reason_check" CHECK ("end_reason" IN ('expired', 'ended_by_demo_user', 'operator_terminated', 'reported', 'provisioning_failed', 'fleet_deleted')),
	CONSTRAINT "demo_summary_bounds_check" CHECK ("ended_at" >= "started_at"
        AND "retain_until" > "ended_at"
        AND "duration_seconds" >= 0
        AND "document_created_count" >= 0
        AND "vault_created_count" >= 0
        AND "link_created_count" >= 0
        AND "visit_count" >= 0
        AND "event_count" >= 0
        AND "delivered_bytes" >= 0
        AND "peak_document_count" >= 0
        AND "peak_vault_count" >= 0
        AND "peak_link_count" >= 0
        AND "peak_confirmed_bytes" >= 0
        AND "refusal_count" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "maintenance_run" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" jsonb,
	"failure" text,
	CONSTRAINT "maintenance_run_kind_check" CHECK ("kind" IN ('reaper', 'sweep', 'summary_fold')),
	CONSTRAINT "maintenance_run_status_check" CHECK ("status" IN ('running', 'succeeded', 'failed')),
	CONSTRAINT "maintenance_run_completion_check" CHECK (("status" = 'running' AND "finished_at" IS NULL)
        OR ("status" <> 'running' AND "finished_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "accept_new_demos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "pause_all_demo_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "environment_lifetime_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "environment_confirmed_bytes" bigint DEFAULT 52428800 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "upload_bytes" bigint DEFAULT 26214400 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "document_count" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "uploaded_document_count" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "vault_count" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "link_count" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "pending_upload_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "confirmation_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "upload_key_lifetime_count" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "delivered_bytes" bigint DEFAULT 262144000 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "visit_lifetime_count" integer DEFAULT 250 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "event_lifetime_count" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "document_lifetime_count" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "vault_lifetime_count" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "link_lifetime_count" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "active_environment_count" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "global_confirmed_bytes" bigint DEFAULT 1073741824 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "global_pending_upload_count" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "global_confirmation_count" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "demo_environment_user_id_uidx" ON "demo_environment" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_environment_organization_id_uidx" ON "demo_environment" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_environment_anonymous_reference_uidx" ON "demo_environment" ("anonymous_reference");--> statement-breakpoint
CREATE INDEX "demo_environment_state_expires_at_idx" ON "demo_environment" ("state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_report_environment_hash_uidx" ON "demo_report" ("environment_id","network_hash");--> statement-breakpoint
CREATE INDEX "demo_report_created_at_idx" ON "demo_report" ("created_at");--> statement-breakpoint
CREATE INDEX "demo_report_expires_at_idx" ON "demo_report" ("expires_at");--> statement-breakpoint
CREATE INDEX "demo_summary_retain_until_idx" ON "demo_summary" ("retain_until");--> statement-breakpoint
CREATE INDEX "maintenance_run_kind_started_at_idx" ON "maintenance_run" ("kind","started_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "demo_environment" ADD CONSTRAINT "demo_environment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "demo_environment" ADD CONSTRAINT "demo_environment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "demo_report" ADD CONSTRAINT "demo_report_environment_id_demo_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "demo_environment"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "demo_report" ADD CONSTRAINT "demo_report_link_id_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "link"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD CONSTRAINT "deployment_policy_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "deployment_policy" ADD CONSTRAINT "deployment_policy_positive_limits_check" CHECK ("environment_lifetime_hours" > 0
        AND "environment_confirmed_bytes" > 0
        AND "upload_bytes" > 0
        AND "document_count" > 0
        AND "uploaded_document_count" > 0
        AND "vault_count" > 0
        AND "link_count" > 0
        AND "pending_upload_count" > 0
        AND "confirmation_count" > 0
        AND "upload_key_lifetime_count" > 0
        AND "delivered_bytes" > 0
        AND "visit_lifetime_count" > 0
        AND "event_lifetime_count" > 0
        AND "document_lifetime_count" > 0
        AND "vault_lifetime_count" > 0
        AND "link_lifetime_count" > 0
        AND "active_environment_count" > 0
        AND "global_confirmed_bytes" > 0
        AND "global_pending_upload_count" > 0
        AND "global_confirmation_count" > 0);--> statement-breakpoint
INSERT INTO "deployment_policy" ("id") VALUES ('deployment') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "demo_global_usage" ("id") VALUES ('demo-global') ON CONFLICT ("id") DO NOTHING;
