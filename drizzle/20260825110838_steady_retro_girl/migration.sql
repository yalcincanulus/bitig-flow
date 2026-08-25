ALTER TABLE "demo_daily_aggregate" ADD COLUMN "download_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "demo_environment" ADD COLUMN "download_lifetime_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "demo_summary" ADD COLUMN "download_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "demo_environment" DROP CONSTRAINT "demo_environment_nonnegative_usage_check", ADD CONSTRAINT "demo_environment_nonnegative_usage_check" CHECK ("state_version" >= 0
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
        AND "download_lifetime_count" >= 0
        AND "report_count" >= 0
        AND "refusal_count" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "demo_summary" DROP CONSTRAINT "demo_summary_bounds_check", ADD CONSTRAINT "demo_summary_bounds_check" CHECK ("ended_at" >= "started_at"
        AND "retain_until" > "ended_at"
        AND "duration_seconds" >= 0
        AND "document_created_count" >= 0
        AND "vault_created_count" >= 0
        AND "link_created_count" >= 0
        AND "download_count" >= 0
        AND "visit_count" >= 0
        AND "event_count" >= 0
        AND "delivered_bytes" >= 0
        AND "peak_document_count" >= 0
        AND "peak_vault_count" >= 0
        AND "peak_link_count" >= 0
        AND "peak_confirmed_bytes" >= 0
        AND "refusal_count" BETWEEN 0 AND 100);