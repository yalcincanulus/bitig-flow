# One document table, with a kind enum and an explicit upload status

**Markdown, PDFs, and images are one `document` table discriminated by `kind`, not three tables.** Every consumer treats them identically — a **Vault** holds all three, a **Link** targets all three, a **Visit** records views of all three — so splitting them would fork the vault join, the link target, and the analytics stream to save some nullable columns. Markdown carries `content` and no `storage_key`; PDFs and images carry `storage_key`, `mime_type`, `byte_size`, `checksum`, and `page_count` and no `content`.

**`status` is `pending` until an upload is confirmed.** ADR-0008 verifies uploads by magic bytes *at confirmation*, which means the row exists before its bytes do: create the row, hand back a presigned PUT, then confirm. That intermediate state is real, and naming it beats inferring it from `storage_key IS NULL`. Markdown documents are `ready` on creation.

**This is not a soft delete in disguise.** ADR-0006 rejected `deleted_at` because it puts a predicate in every query and one forgotten predicate is a leak. `status` does not carry that risk, because **no query filters on it** — a `pending` document is supposed to appear in the dashboard, as "uploading…". The distinction is that a soft-delete flag hides rows and a lifecycle marker describes them.

**The database refuses incoherent combinations.** One CHECK enforces that a `markdown` document has `content` and no `storage_key`, and that a non-markdown document which is `ready` has a `storage_key`. A markdown row with a bucket key, or a `ready` PDF pointing at nothing, are both bugs, and this is the cheapest place to make them impossible.

**`created_by` is display-only and nulls out.** It exists so the dashboard can say who uploaded something. ADR-0010 fixed that permissions are a pure function of role and never depend on who created a row, so **no authorization code may read this column** — it is `ON DELETE SET NULL` against `user.id` precisely because a user leaving the organization must not delete its documents.
