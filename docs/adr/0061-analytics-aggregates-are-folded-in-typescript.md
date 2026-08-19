# Analytics aggregates are folded in TypeScript

Analytics repositories select raw Visit and Event rows with the Drizzle builder, then one pure module folds every aggregate in TypeScript. Drizzle's builder has no JSONB path operator, cast, or coalesce for the `page_dwell` payload, so a SQL-side Total time would require a raw `sql` template and split the arithmetic between two implementations; this replaces ADR-0029's SQL-specific aggregation detail while preserving its aggregate-on-read decision.
