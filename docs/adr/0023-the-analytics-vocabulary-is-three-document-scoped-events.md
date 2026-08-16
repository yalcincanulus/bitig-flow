# The analytics vocabulary is three document-scoped events

`visit_event.type` admits exactly three values, validated in zod and never in a `pgEnum` (ADR-0015 fixed the column as plain `text` for this reason):

| `type` | `document_id` | `payload` |
| --- | --- | --- |
| `document_opened` | required | `null` |
| `page_dwell` | required | `{ page: number, ms: number }` |
| `download` | required | `{ via: 'button' }` — narrowed by ADR-0032 |

The charting-time proposal also carried `view_started`, `email_captured`, and `email_verified`. All three are gone, because `visit` already answers them as columns: a visit exists only once its gate is satisfied (ADR-0004), so `email` and `email_verified` are settled facts at row creation, and `started_at` / `last_seen_at` bound the session. An event that restates a column is a second source of truth that can disagree with the first, and the disagreement is always discovered later, in a query nobody re-reads.

Every event is document-scoped. `visit_event.document_id` is nullable in the schema, but no event in this vocabulary uses that — the nullability stays as headroom, not as a shape anything relies on.

`document_opened` survives, despite dwell implying it, because a vault link can reach several documents and "opened and read nothing" is a real, visible signal rather than an absence. It is appended **once per open**, never deduplicated per visit: the per-visit timeline reads as an ordered narrative, `COUNT(DISTINCT document_id)` recovers the set for free, and reconstructing revisits from a deduplicated row is impossible. Nothing in `visit_event` is ever upserted.

Adding a type later — `scroll_depth` is the likely one — needs no migration. That was the whole point of keeping the column untyped in SQL.

`via: 'print'` was dropped by ADR-0032: the byte route is the writer, and a print is a gesture it never observes.
