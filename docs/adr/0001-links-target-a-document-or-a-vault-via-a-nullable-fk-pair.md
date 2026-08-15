# Links target a document or a vault via a nullable FK pair

A link points at exactly one target, which is either a document or a vault. We model this as two nullable foreign key columns (`document_id`, `vault_id`) with a CHECK constraint that exactly one is set, rather than a `target_type` discriminator over an untyped `target_id` or two separate link tables.

The discriminator would cost us referential integrity and cascade behaviour on the most important relationship in the app; two tables would fork the slug space, the gate logic, and the analytics stream. The nullable pair keeps one link table, one slug space, one analytics stream, and real foreign keys, at the price of one CHECK constraint and a nullable column that is always null for half the rows.

A vault link resolves its document set **fresh on every request** — never snapshotted at gate pass — so removing a document from a vault takes effect immediately, even mid-visit. A snapshot would be a cache of an access decision, and access decisions must not lag.
