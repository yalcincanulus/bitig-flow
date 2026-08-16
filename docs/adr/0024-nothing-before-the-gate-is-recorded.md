# Nothing before the gate is recorded

A wrong password, an abandoned email form, a hit on an expired link, and a bot drive-by leave no analytics row. The dashboard shows post-gate behaviour only.

ADR-0004 says the abandoned-gate funnel "is still worth measuring, but it is an *event*, not the identity of a visit." That aside was written before ADR-0015 fixed `visit_event.visit_id` as `NOT NULL`, and it does not survive contact with the consequence: a gate-failure row has no visit to hang from, so recording one means either a second table or making `visit_id` nullable — and the latter would poison every analytics query with a filter it can never drop.

The deciding argument is not the schema, though. Every pre-gate record is a row an anonymous stranger can create at will by typing a wrong password at a public URL. Building that table is building an unauthenticated, ungated, unbounded write endpoint whose only consumer is a vanity metric. The counters that carry real weight already exist elsewhere: ADR-0003 caps verification at 5 attempts in Redis, and broader IP-level rate limiting is its own decision.

This supersedes ADR-0004's aside. Funnel analytics is a product feature and is out of this map's scope; if it ever returns it is a separate `gate_attempt` table, never a nullable `visit_id`.
