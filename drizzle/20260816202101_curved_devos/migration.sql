CREATE TABLE "visit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"link_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"gate_version" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	CONSTRAINT "visit_verified_email_check" CHECK (NOT "email_verified" OR "email" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "visit_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"visit_id" uuid NOT NULL,
	"document_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"document_id" uuid,
	"vault_id" uuid,
	"slug" varchar(12) NOT NULL,
	"name" text,
	"password_hash" text,
	"requires_email" boolean DEFAULT false NOT NULL,
	"requires_verification" boolean DEFAULT false NOT NULL,
	"gate_version" integer DEFAULT 1 NOT NULL,
	"allow_download" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "link_exactly_one_target_check" CHECK (("document_id" IS NULL) <> ("vault_id" IS NULL)),
	CONSTRAINT "link_verification_requires_email_check" CHECK (NOT "requires_verification" OR "requires_email")
);
--> statement-breakpoint
CREATE INDEX "visit_link_id_started_at_idx" ON "visit" ("link_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "visit_visitor_id_idx" ON "visit" ("visitor_id");--> statement-breakpoint
CREATE INDEX "visit_event_visit_id_occurred_at_idx" ON "visit_event" ("visit_id","occurred_at");--> statement-breakpoint
CREATE INDEX "visit_event_document_id_idx" ON "visit_event" ("document_id");--> statement-breakpoint
CREATE INDEX "visit_event_document_id_type_idx" ON "visit_event" ("document_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "link_slug_uidx" ON "link" ("slug");--> statement-breakpoint
CREATE INDEX "link_organization_id_idx" ON "link" ("organization_id");--> statement-breakpoint
CREATE INDEX "link_document_id_idx" ON "link" ("document_id");--> statement-breakpoint
CREATE INDEX "link_vault_id_idx" ON "link" ("vault_id");--> statement-breakpoint
ALTER TABLE "visit" ADD CONSTRAINT "visit_link_id_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "link"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "visit_event" ADD CONSTRAINT "visit_event_visit_id_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "visit_event" ADD CONSTRAINT "visit_event_document_id_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_document_id_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_vault_id_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vault"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;