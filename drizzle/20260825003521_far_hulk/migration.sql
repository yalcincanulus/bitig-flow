ALTER TABLE "demo_sample_resource" DROP CONSTRAINT "demo_sample_resource_kind_check";--> statement-breakpoint
DROP INDEX "demo_sample_resource_resource_id_uidx";--> statement-breakpoint
ALTER TABLE "demo_sample_resource" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "demo_sample_resource" ADD COLUMN "vault_id" uuid;--> statement-breakpoint
ALTER TABLE "demo_sample_resource" ADD COLUMN "link_id" uuid;--> statement-breakpoint
UPDATE "demo_sample_resource"
SET "document_id" = CASE WHEN "kind" = 'document' THEN "resource_id" END,
    "vault_id" = CASE WHEN "kind" = 'vault' THEN "resource_id" END,
    "link_id" = CASE WHEN "kind" = 'link' THEN "resource_id" END;--> statement-breakpoint
ALTER TABLE "demo_sample_resource" DROP COLUMN "resource_id";--> statement-breakpoint
CREATE UNIQUE INDEX "demo_sample_resource_document_id_uidx" ON "demo_sample_resource" ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_sample_resource_vault_id_uidx" ON "demo_sample_resource" ("vault_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_sample_resource_link_id_uidx" ON "demo_sample_resource" ("link_id");--> statement-breakpoint
ALTER TABLE "demo_sample_resource" ADD CONSTRAINT "demo_sample_resource_document_id_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "demo_sample_resource" ADD CONSTRAINT "demo_sample_resource_vault_id_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vault"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "demo_sample_resource" ADD CONSTRAINT "demo_sample_resource_link_id_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "link"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "demo_sample_resource" ADD CONSTRAINT "demo_sample_resource_typed_target_check" CHECK ((
        ("kind" = 'document' AND "document_id" IS NOT NULL AND "vault_id" IS NULL AND "link_id" IS NULL)
        OR
        ("kind" = 'vault' AND "document_id" IS NULL AND "vault_id" IS NOT NULL AND "link_id" IS NULL)
        OR
        ("kind" = 'link' AND "document_id" IS NULL AND "vault_id" IS NULL AND "link_id" IS NOT NULL)
      ));
