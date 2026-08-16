CREATE TYPE "document_kind" AS ENUM('markdown', 'pdf', 'image');--> statement-breakpoint
CREATE TYPE "document_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "document_kind" NOT NULL,
	"status" "document_status" NOT NULL,
	"content" text,
	"storage_key" text,
	"file_name" text,
	"mime_type" text,
	"byte_size" integer,
	"checksum" text,
	"page_count" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_content_storage_check" CHECK ((
        ("kind" = 'markdown' AND "content" IS NOT NULL AND "storage_key" IS NULL)
        OR
        ("kind" <> 'markdown' AND ("status" <> 'ready' OR "storage_key" IS NOT NULL))
      )),
	CONSTRAINT "document_byte_size_check" CHECK ("byte_size" > 0),
	CONSTRAINT "document_page_count_check" CHECK ("page_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "vault" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_item" (
	"vault_id" uuid,
	"document_id" uuid,
	"added_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vault_item_pkey" PRIMARY KEY("vault_id","document_id")
);
--> statement-breakpoint
CREATE INDEX "document_organization_id_created_at_idx" ON "document" ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "vault_organization_id_idx" ON "vault" ("organization_id");--> statement-breakpoint
CREATE INDEX "vault_item_document_id_idx" ON "vault_item" ("document_id");--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vault" ADD CONSTRAINT "vault_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_vault_id_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vault"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vault_item" ADD CONSTRAINT "vault_item_document_id_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE;