# A visit is created only when a gate is satisfied

A `visit` row is written to Postgres at the moment a link's gate is satisfied — never on the first page load of a gated link. In-progress gate state (which requirements a visitor has cleared) lives in a short-lived Redis record, keyed by an opaque id in an HttpOnly cookie scoped to the link, with a ~15 minute TTL.

`visit` is the analytics table. If every drive-by bot that loaded a URL produced a row, every query over it would need a status filter forever. The abandoned-gate funnel is still worth measuring, but it is an *event*, not the identity of a visit.

A public link is a gate with an empty requirement list, so its visit is created on first load. There is one code path for all links, and every link type produces the same visit shape.

**Granted visits last 7 days** and are revoked at the link level, never per visit. Every request re-reads the link row, so deactivating or expiring a link invalidates all of its live visits immediately. Changes to *who may enter* — the password or either requirement flag — bump a `gate_version` integer stamped into each visit; a mismatch forces a re-gate. Options that are re-read anyway (`allow_download`, `expires_at`, `is_active`) do not bump it, which is what stops every metadata edit from evicting live visitors.

Every terminal state — expired, deactivated, rotated slug, deleted target — shows the visitor **one generic message**. Distinguishing them would leak the owner's activity to a stranger for no gain. An empty vault behind a satisfied gate is not a refusal and does get its own empty state; a missing storage blob is our bug and raises a 500 rather than posing as an expected state.
