# Analytics aggregates are folded in TypeScript

Analytics repositories select raw Visit and Event rows with the Drizzle builder, then one pure module folds every aggregate in TypeScript. Drizzle's builder has no JSONB path operator, cast, or coalesce for the `page_dwell` payload, so a SQL-side Total time would require a raw `sql` template and split the arithmetic between two implementations; this replaces ADR-0029's SQL-specific aggregation detail while preserving its aggregate-on-read decision.

A per-Link read is a two-step builder query — Visit ids, then their Events — and considers at most the most recent 500 Visits in the range (`ANALYTICS_VISIT_CAP`). When the cap bites, the payload flags it so the screen can say it is showing those 500 Visits rather than a total.
