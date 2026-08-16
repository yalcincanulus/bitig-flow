# Analytics is aggregated on read

No rollup table, no materialized view. Per-link totals are a `GROUP BY` over `visit_event` joined to `visit`; the per-page chart is `SUM((payload->>'ms')::int)` grouped by `payload->>'page'`. A rollup is a cache, and a cache with no invalidation story is a bug waiting for the first backfill. ADR-0025's row volume — tens of rows per heavy visit — is well inside what a plain query handles.

ADR-0015 already gave us `visit(link_id, started_at DESC)` and `visit_event(visit_id, occurred_at)`. One index is added: **`visit_event(document_id, type)`**, because `visit_event(document_id)` was created for cascade *writes* and the per-document dwell chart is now a read path.

**Per link:** total visits, unique visitors as `COUNT(DISTINCT visitor_id)`, captured emails, total time, and a per-page dwell bar chart. **Per visit:** a timeline, one row per document with time spent, pages reached, and whether it was downloaded, expandable to the per-page breakdown. Identity renders as the captured email when there is one and a shortened `visitor_id` otherwise, with repeat visits grouped underneath — the email supersedes the cookie, as CONTEXT.md has it.

**The per-page chart is shown for `kind = 'pdf'` only.** Markdown scrolls and an image is one view, so both report `page: 1` forever and get a plain total-time figure instead. Encoding scroll quartiles as pseudo-pages was the tempting alternative and is refused: it would put a different meaning behind the same field depending on `document.kind`, so the payload would lie and every query over it would need a kind check. Scroll depth, if it is ever wanted, earns its own event type — which ADR-0023's untyped `type` column admits without a migration.
