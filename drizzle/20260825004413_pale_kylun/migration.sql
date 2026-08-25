ALTER TABLE "demo_environment" ADD COLUMN "entry_key_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "demo_environment_entry_key_hash_uidx" ON "demo_environment" ("entry_key_hash");