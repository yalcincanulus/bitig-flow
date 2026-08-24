# Unconfirmed uploads never use the final Storage key

Every upload first receives a random, short-lived **Upload key**. **Confirmation** validates those staged bytes, writes the verified result to the Document's immutable **Storage key**, commits actual usage, and removes the Upload key; abandoned staging objects are reaped later.

Presigning the final Storage key let a retained PUT URL overwrite a ready Document after Confirmation, contradicting ADR-0020 while authenticated uploaders were assumed to be trusted. A shorter URL lifetime only narrows that race. Separating staged from confirmed bytes closes it and provides the reservation boundary required for hostile Demo Users, at the cost of a second object write during Confirmation.

**Staging is its own row, not columns on the Document.** `document_upload` holds one row per upload attempt — the Upload key and the byte size the client declared — keyed by `document_id` and cascading with it. Widening `document` was rejected because the Dashboard syncs that table into a collection (ADR-0034), and a column that must never reach a client is a poor thing to put in a synced row; the separate row also means "is this Document staged?" is a row's existence rather than a nullable column read the right way. **Confirmation** deletes it, so a ready Document provably has no Upload key.

**Upload keys live outside the `org/` prefix**, at `upload/<orgId>/<random>`. That keeps them off every path that resolves a Document's bytes — those all go through `document.storage_key`, which stays null until Confirmation — and it keeps the eventual `org/<orgId>/` prefix drop from touching bytes that are still arriving.

**The declared byte size is checked twice and trusted neither time.** `createUpload` refuses a size that is missing, zero, or over the 25 MiB cap before it signs anything, and Confirmation refuses staged bytes that exceed what was declared. The declaration is what the server agreed to stage for — the reservation boundary Demo quotas will hold against — while the measured size is what gets recorded.
