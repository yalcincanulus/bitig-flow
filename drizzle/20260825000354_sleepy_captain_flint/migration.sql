CREATE TABLE "demo_sample_resource" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"environment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_sample_resource_kind_check" CHECK ("kind" IN ('document', 'vault', 'link'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "demo_sample_resource_resource_id_uidx" ON "demo_sample_resource" ("resource_id");--> statement-breakpoint
CREATE INDEX "demo_sample_resource_environment_id_idx" ON "demo_sample_resource" ("environment_id");--> statement-breakpoint
ALTER TABLE "demo_sample_resource" ADD CONSTRAINT "demo_sample_resource_environment_id_demo_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "demo_environment"("id") ON DELETE CASCADE;