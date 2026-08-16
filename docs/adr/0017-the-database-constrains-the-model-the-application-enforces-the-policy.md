# The database constrains the model; the application enforces the policy

**A CHECK constraint earns its place when it rules out a state that is meaningless, not when it encodes a number someone might want to change.** The distinction decides what goes in a migration and what stays in code.

Four constraints describe the model, and are in the schema:

| Table | Constraint | Source |
| --- | --- | --- |
| `link` | exactly one of `document_id` / `vault_id` is set | ADR-0001 |
| `link` | `requires_verification` implies `requires_email` | ADR-0002 |
| `document` | `markdown` ⇒ `content` and no `storage_key`; non-markdown and `ready` ⇒ `storage_key` | ADR-0015 |
| `visit` | `email_verified` implies `email IS NOT NULL` | ADR-0002 |

Each rules out a row that means nothing: a link pointing at both a document and a vault, a gate demanding a verification code for an address it never collected, a verified email that is absent. Plus the arithmetic floors — `byte_size > 0`, `page_count > 0`.

**The 25 MB upload cap from ADR-0008 is deliberately *not* a CHECK.** It is a product policy, and a policy in a CHECK means changing a number requires a migration — and, worse, that raising it retroactively invalidates nothing while lowering it silently makes existing rows unrepresentable. The limit is enforced where it can actually be acted on: at presign time, and again at confirmation alongside the magic-byte check. The same reasoning keeps the allowed MIME list out of the database.

**Indexes are chosen from query paths, not applied decoratively.** `link(slug)` is unique and hot — it is the public path. `document(organization_id, created_at DESC)` is the dashboard's default list in one index. `visit(link_id, started_at DESC)` and `visit_event(visit_id, occurred_at)` are the analytics reads. `member(user_id, organization_id)` is ADR-0013's per-request role lookup.

**Two of the indexes exist for writes, not reads: `vault_item(document_id)` and `visit_event(document_id)`.** Postgres does not index foreign key columns automatically, and ADR-0006 made `ON DELETE CASCADE` the entire deletion story — so an unindexed FK turns deleting one document into a sequential scan of the largest table in the application. They earn their keep even if nothing ever queries by those columns.

**Deleting a document deletes its events, including from vault visits it did not own.** `visit_event.document_id` is `ON DELETE CASCADE`, so removing one document from a **Vault** with live links erases that document's page-dwell history from visits which continue to exist for their other documents. `ON DELETE SET NULL` was the alternative and would leave orphaned events in a live link's analytics. This is the same trade ADR-0006 already made — content deletion takes its history with it, and a confirmation dialog names the cost out loud — and a special case here would be a second deletion story to remember. `document_id` remains nullable because visit-level events (an abandoned gate, a download) belong to no document.
