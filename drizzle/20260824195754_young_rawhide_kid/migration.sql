CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operator_audit_record" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"operator_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_audit_record_kind_check" CHECK ("kind" IN ('bootstrap', 'recovery'))
);
--> statement-breakpoint
CREATE TABLE "platform_operator" (
	"id" text PRIMARY KEY DEFAULT 'platform-operator',
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_operator_singleton_check" CHECK ("id" = 'platform-operator')
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_operator_user_id_uidx" ON "platform_operator" ("user_id");--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "operator_audit_record" ADD CONSTRAINT "operator_audit_record_operator_user_id_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "platform_operator" ADD CONSTRAINT "platform_operator_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT;
