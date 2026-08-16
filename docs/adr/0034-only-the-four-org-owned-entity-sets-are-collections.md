# Only the four org-owned entity sets are collections

TanStack DB collections exist for exactly four things: `documents`, `vaults`, `vaultItems`, and `links`. They are built by a `getCollections(queryClient, orgId)` factory memoized in a `WeakMap<QueryClient, Map<orgId, …>>`, because a collection is scoped to both a QueryClient and a business scope, and this app's QueryClient is created per router while the active Organization can change beneath it. The starter's module-global `export const fooCollection` pattern does not fit and is not used.

All four are preloaded in the `/dashboard` layout loader, not per leaf. The three screens cross-reference each other constantly — a Link needs its target's title, which is a join rather than a denormalized copy — so one warm sync beats three cold ones, and any Dashboard navigation finds the data already there.

Everything else is a plain `createServerFn`. Analytics reads are aggregated on read with no rollup (ADR-0029): they are a query result, not a synced entity set, and a Query collection's `queryFn` is contractually *complete collection state*, so modelling a server-side aggregate as one would be a category error with a destructive failure mode. Members, invitations, and Organization settings belong to better-auth (ADR-0013).

`vaultItems` is a collection rather than a `documentIds: string[]` array on the Vault row. The array would model membership as a value while the database models it as rows (#11), so the optimistic shape and the persisted shape would disagree and every refetch would have to re-aggregate. Keeping rows end to end also means two people editing the same Vault insert and delete independent rows instead of clobbering one array last-write-wins.

Filtering never happens in `queryFn`. In eager mode a `queryFn` returning a subset means "the server has no other items" and deletes the rest, so Dashboard filters are live-query `where()` clauses over the warm collection and stay out of `loaderDeps`. The analytics date range is the exception that proves it: that one *is* a server query, so `?from`/`?to` go in `loaderDeps`.
