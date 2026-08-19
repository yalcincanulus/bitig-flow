# The beacon trusts the visit cookie and nothing in its body

The analytics beacon is a server route taking anonymous `navigator.sendBeacon` writes. It cannot carry a custom header, so the gate cookie is its entire credential.

The route resolves `visit_id`, `link_id`, and `gate_version` **server-side from Redis via the HttpOnly cookie** that ADR-0004 scoped to the link, and ignores any identifier in the payload. The path parameter is read for routing and never for identity: the cookie's `Path=/v/<slug>` already guarantees a Beacon aimed at the wrong Link arrives without one, and trusting the slug would put the Link's identity in exactly the place this ADR says must not be believed. Each `documentId` in the body is checked to be reachable from that link's target. The body is sent as `Content-Type: text/plain` holding a JSON string, which sidesteps CORS preflight, and being same-origin under `SameSite=Lax` it needs no CSRF token.

**The body is document-keyed**, which amends the single-document `{ documentId, pages, seq }` shape from ADR-0026:

```
{ documents: { [documentId]: { [page]: ms } }, seq, nonce }
```

One flush can legitimately hold two Documents — a Visitor reads A for ten seconds, navigates to B within a Vault Link, and the fifteen-second timer fires. Splitting a flush into one Beacon per Document would break the one-flush-one-`seq` invariant and invent a partial-flush failure where the first lands, the second is rate-limited, and the client has already cleared its accumulator.

Forging analytics still requires passing the gate first. That is the honest boundary and we state it as such, in the same spirit as ADR-0009's admission that preventing download is cosmetic.

**Idempotency.** The 15s interval and the `visibilitychange` flush can race on tab close, and a browser may retry, so an appended `page_dwell` could double-count. The client stamps each beacon with a monotonically increasing `seq` and a per-page-load `nonce`, and clears its accumulator only once the beacon is handed off; the server does `SETNX beacon:<visitId>:<nonce>:<seq>` with a 5 minute TTL and drops repeats. A Visit lasts seven days and spans reloads, back-navigations, and tabs, so a bare `seq` restarts at 1 on every page load and the server would drop genuine Beacons until the counter passed the previous high-water mark. Treating duplication as noise was tenable, but time-spent is the headline number on the dashboard and double-counting inflates it systematically rather than randomly; a bare `seq` deflates systematically, which is the same defect pointing the other way. The nonce needs only to be unique, not unguessable, and is not a credential: forging dwell already requires passing the Gate.

**Rate limit.** Beacons are limited to 20 per Visit per fixed 60-second window in Redis (`INCR` / `EXPIRE` / `TTL`, matching the Gate counters). Steady state is four per minute. A tripped limiter logs one `warn` line and records nothing, per ADR-0041. This bounds row count rather than protecting the numbers; the write-time thirty-minute cap already makes forged dwell worthless.

**The response is 204 with an empty body, always** — for a dropped beacon, a forged one, a rate-limited one, and a deduplicated repeat alike. `sendBeacon` cannot read a response, so any status distinction exists solely as a signal to someone probing the endpoint.

One consequence to hold: a visit invalidated mid-read by a `gate_version` bump has its beacons silently discarded, and the visitor learns of it on their next navigation rather than from the beacon.

Each beacon also updates `visit.last_seen_at` in the same statement batch as its inserts. One `UPDATE` by primary key per 15s per active visitor is free at this scale, and `last_seen_at` is what makes "still reading right now" possible on the dashboard. The thirty-minute cap is applied at write: for each `(document, page)` in the body, existing `page_dwell` milliseconds for that `(visit, document, page)` are summed and the append is clamped. Clamping in the read-side aggregation would be cheaper and would leave raw rows that lie — and ADR-0029 refuses rollups precisely so the raw rows are the source of truth.
