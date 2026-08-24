CREATE TABLE "document_upload" (
	"document_id" uuid PRIMARY KEY,
	"upload_key" text NOT NULL UNIQUE,
	"declared_byte_size" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_upload_declared_byte_size_check" CHECK ("declared_byte_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "document_upload" ADD CONSTRAINT "document_upload_document_id_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE;