# Document bytes are immutable once ready

**A `ready` document's bytes never change.** `confirmUpload` is callable only against a `pending` row and is a no-op otherwise. Replacing content means a new document with a new id — and, deliberately, new links, because an existing link's analytics stream describes bytes that would no longer exist. Title and other metadata stay editable; the bytes do not.

This needs saying out loud precisely because the fixed key of ADR-0019 makes replacement mechanically trivial — one `PutObject` to the same path — and "re-upload to fix a typo in the PDF" is the obvious user impulse. Versioning is out of scope, and silent in-place replacement is versioning with the history thrown away.

Immutability is also what makes `no-store` (ADR-0009) costless: there is no stale-content problem when content never changes, so the caching rules can be driven entirely by revocation rather than balanced against freshness.
