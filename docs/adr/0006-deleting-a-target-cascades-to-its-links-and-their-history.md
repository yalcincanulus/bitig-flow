# Deleting a target cascades to its links and their history

Deleting a document or a vault deletes its links, their visits, and their analytics events, via `ON DELETE CASCADE`. We do not soft-delete.

Soft deletion is the defensible choice for a product whose value is the analytics history, but it is a systemic decision: it infects every query in the application with a `deleted_at IS NULL` predicate, and one forgotten predicate is a data leak. A confirmation dialog that names the cost out loud — "this also deletes 3 links and their view history" — is honest, and it keeps every query in the codebase simple.

This is recorded so a future reader knows the missing `deleted_at` column was a choice, not an oversight.
