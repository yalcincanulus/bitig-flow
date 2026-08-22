# Only the four org-owned entity sets are collections

TanStack DB collections exist for exactly four things: `documents`, `vaults`, `vaultItems`, and `links`. They are built by a `getCollections(queryClient, orgId)` factory memoized in a `WeakMap<QueryClient, Map<orgId, …>>`, because a collection is scoped to both a QueryClient and a business scope, and this app's QueryClient is created per router while the active Organization can change beneath it. The starter's module-global `export const fooCollection` pattern does not fit and is not used.

All four are preloaded in the `/dashboard` layout loader, not per leaf. The three screens cross-reference each other constantly — a Link needs its target's title, which is a join rather than a denormalized copy — so one warm sync beats three cold ones, and any Dashboard navigation finds the data already there.

Everything else is a plain `createServerFn`. Analytics reads are aggregated on read with no rollup (ADR-0029): they are a query result, not a synced entity set, and a Query collection's `queryFn` is contractually *complete collection state*, so modelling a server-side aggregate as one would be a category error with a destructive failure mode. Members, invitations, and Organization settings belong to better-auth (ADR-0013).

`vaultItems` is a collection rather than a `documentIds: string[]` array on the Vault row. The array would model membership as a value while the database models it as rows (#11), so the optimistic shape and the persisted shape would disagree and every refetch would have to re-aggregate. Keeping rows end to end also means two people editing the same Vault insert and delete independent rows instead of clobbering one array last-write-wins.

**`documents` carries `content`, and its writes do not refetch.** The markdown body syncs with the row rather than being fetched separately, so ADR-0035's "detail routes resolve against the collection" holds for the editor too and the optimistic insert has somewhere local to keep its text. The price is that a list view downloads every markdown body in the organization, which is why ADR-0056 caps markdown at 256 KB. It is also why every mutation handler on this collection writes the server's returned row with the direct-write utilities and returns `{ refetch: false }`: a Query Collection otherwise refetches the whole collection after each handler and awaits it, which would re-download every body on every autosave.

Filtering never happens in `queryFn`. In eager mode a `queryFn` returning a subset means "the server has no other items" and deletes the rest, so Dashboard filters are live-query `where()` clauses over the warm collection and stay out of `loaderDeps`. The analytics date range is the exception that proves it: that one *is* a server query, so `?from`/`?to` go in `loaderDeps`.

## Amendment: analytics payloads contain no display names

An analytics server function returns Link ids and numeric aggregates, never Link names or target titles. The Dashboard joins each result to the already-warm `links` collection with `useLiveQuery`; adding presentation fields to the aggregate would create a second, stale copy of collection-owned data. A missing local row degrades to the word “Link” while keeping the numeric result visible.

## Amendment: People is a route loader, not a fifth collection

**Memberships** and pending **Invitations** stay outside the collection set, as the paragraph above says, and the **People** surface reads them in a route loader that calls `authClient.organization.listMembers` — refreshed by `router.invalidate()` after each mutation, which is already the organization switcher's mechanism. Under ADR-0030 that loader runs in the browser, which is fine: `listMembers` returns each member's name, email, and image, so the screen needs no join against anything warm and no second call. A `useQuery` was rejected for being the only Dashboard screen fetching from inside a component, and a `createServerFn` wrapper for the reason ADR-0013 gives.
