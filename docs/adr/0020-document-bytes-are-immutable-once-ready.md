# Document bytes are immutable once ready

**A `ready` document's bytes never change.** `confirmUpload` is callable only against a `pending` row and is a no-op otherwise. Replacing content means a new document with a new id — and, deliberately, new links, because an existing link's analytics stream describes bytes that would no longer exist. Title and other metadata stay editable; the bytes do not.

This needs saying out loud precisely because the fixed key of ADR-0019 makes replacement mechanically trivial — one `PutObject` to the same path — and "re-upload to fix a typo in the PDF" is the obvious user impulse. Versioning is out of scope, and silent in-place replacement is versioning with the history thrown away.

**This covers uploaded bytes and not markdown** (narrowed by ADR-0057). Markdown `content` is freely editable, including under live links, and the reason above does not carry across: an uploaded PDF is an artifact that arrived finished from somewhere else, while markdown is text its author wrote in this app and expects to keep writing. Freezing it on first share would make sharing a one-way door on the one kind of document people most expect to correct, and ADR-0023's three events carry no content-version dimension, so there is no stream that could describe a particular revision anyway. Without this narrowing the repository holds two immutability rules and one of them is false.

Immutability is also what makes `no-store` (ADR-0009) costless: there is no stale-content problem when content never changes, so the caching rules can be driven entirely by revocation rather than balanced against freshness.
