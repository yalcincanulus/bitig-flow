CREATE TABLE "document_reference" (
	"source_document_id" uuid,
	"target_document_id" uuid,
	CONSTRAINT "document_reference_pkey" PRIMARY KEY("source_document_id","target_document_id"),
	CONSTRAINT "document_reference_not_self_check" CHECK ("source_document_id" <> "target_document_id")
);
--> statement-breakpoint
CREATE INDEX "document_reference_target_document_id_idx" ON "document_reference" ("target_document_id");--> statement-breakpoint
ALTER TABLE "document_reference" ADD CONSTRAINT "document_reference_source_document_id_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "document"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "document_reference" ADD CONSTRAINT "document_reference_target_document_id_document_id_fkey" FOREIGN KEY ("target_document_id") REFERENCES "document"("id") ON DELETE CASCADE;