# A Visitor gets one pending Gate record per Link

The in-progress Gate state ADR-0004 keeps in Redis is keyed by the opaque id in the Visitor's Link-scoped cookie, and requesting a code re-uses the existing record rather than minting a fresh one.

Without this, the per-record controls from ADR-0003 — the 60-second resend cooldown and the 5-attempt code limit — are attached to a disposable object, and cycling records re-arms both for free. Binding the record to the cookie makes those limits stick to the Visitor. It also bounds Redis growth by distinct cookies rather than by requests, and the per-IP submission counter (ADR-0037) already throttles how fast a stranger can mint those, so the ~15 minute TTL is enough to keep the keyspace from being a resource-exhaustion target.

The consequence is that clearing cookies restarts the Gate from the beginning with fresh allowances. That is accepted: it is the same bypass an ordinary user performs by accident, and ADR-0003 already refuses to let any long-lived cookie shortcut a Requirement, so the only thing a fresh cookie buys is the right to start over.
