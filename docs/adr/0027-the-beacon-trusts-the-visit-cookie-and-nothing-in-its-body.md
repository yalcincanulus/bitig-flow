# The beacon trusts the visit cookie and nothing in its body

The analytics beacon is a server route taking anonymous `navigator.sendBeacon` writes. It cannot carry a custom header, so the gate cookie is its entire credential.

The route resolves `visit_id`, `link_id`, and `gate_version` **server-side from Redis via the HttpOnly cookie** that ADR-0004 scoped to the link, and ignores any identifier in the payload. The body carries `{ documentId, pages, seq }` and nothing else; `documentId` is checked to be reachable from that link's target. It is sent as `Content-Type: text/plain` holding a JSON string, which sidesteps CORS preflight, and being same-origin under `SameSite=Lax` it needs no CSRF token.

Forging analytics still requires passing the gate first. That is the honest boundary and we state it as such, in the same spirit as ADR-0009's admission that preventing download is cosmetic.

**Idempotency.** The 15s interval and the `visibilitychange` flush can race on tab close, and a browser may retry, so an appended `page_dwell` could double-count. The client stamps each beacon with a monotonically increasing `seq` and clears its accumulator only once the beacon is handed off; the server does `SETNX beacon:<visitId>:<seq>` with a 5 minute TTL and drops repeats. Treating the duplication as noise was tenable, but time-spent is the headline number on the dashboard and this failure inflates it systematically rather than randomly.

**The response is 204 with an empty body, always** — for a dropped beacon, a forged one, a rate-limited one, and a deduplicated repeat alike. `sendBeacon` cannot read a response, so any status distinction exists solely as a signal to someone probing the endpoint. Beacons are rate-limited per visit id in Redis.

One consequence to hold: a visit invalidated mid-read by a `gate_version` bump has its beacons silently discarded, and the visitor learns of it on their next navigation rather than from the beacon.

Each beacon also updates `visit.last_seen_at` in the same statement batch as its inserts. One `UPDATE` by primary key per 15s per active visitor is free at this scale, and `last_seen_at` is what makes "still reading right now" possible on the dashboard.
