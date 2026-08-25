CREATE TABLE "demo_provisioning_attempt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"entry_key_hash" text NOT NULL,
	"state" text DEFAULT 'provisioning' NOT NULL,
	"admission_key" text,
	"global_reserved" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"environment_id" uuid,
	"recovery_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_provisioning_attempt_state_check" CHECK ("state" IN ('provisioning', 'ready')),
	CONSTRAINT "demo_provisioning_attempt_recovery_expiry_check" CHECK ("recovery_expires_at" > "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "demo_provisioning_attempt_entry_key_hash_uidx" ON "demo_provisioning_attempt" ("entry_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_provisioning_attempt_environment_id_uidx" ON "demo_provisioning_attempt" ("environment_id");--> statement-breakpoint
CREATE INDEX "demo_provisioning_attempt_state_created_at_idx" ON "demo_provisioning_attempt" ("state","created_at");--> statement-breakpoint
ALTER TABLE "demo_provisioning_attempt" ADD CONSTRAINT "demo_provisioning_attempt_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "demo_provisioning_attempt" ADD CONSTRAINT "demo_provisioning_attempt_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "demo_provisioning_attempt" ADD CONSTRAINT "demo_provisioning_attempt_T90F7HX7cuDt_fkey" FOREIGN KEY ("environment_id") REFERENCES "demo_environment"("id") ON DELETE SET NULL;