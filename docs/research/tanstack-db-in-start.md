# TanStack DB in a TanStack Start app

Research for [#5](https://github.com/veotaar/bitig-flow/issues/5). Scope: the dashboard only — per the map, the public viewer uses server functions + route loaders and no collections.

**Versions actually installed** (all claims below were verified against these, not against the public docs site):

| Package | Version |
| --- | --- |
| `@tanstack/db` | 0.7.2 |
| `@tanstack/react-db` | 0.2.1 |
| `@tanstack/query-db-collection` | 1.2.4 |
| `@tanstack/router-core` | 1.171.23 |
| `@tanstack/react-router` | 1.170.28 |
| `@tanstack/start-client-core` | 1.170.23 |
| `zod` | 4.4.3 |

Sources are cited as `node_modules` paths. The TanStack Intent skill bundles ship inside the packages themselves (`@tanstack/db/skills/**`), and each carries a frontmatter `sources:` list pointing at the upstream repo file it was derived from; where that matters I cite both. Note the skill bundles declare `library_version: 0.6.17` while the installed runtime is 0.7.2 — where the two could disagree I checked the compiled source, and say so.

---

## 1. The SSR constraint — what it actually means

### The rule

> TanStack DB collections are **client-side only**. SSR is not implemented. Routes using TanStack DB **must disable SSR**.
>
> — `@tanstack/db/skills/meta-framework/SKILL.md`

The same file flags enabling SSR on a collection route as a `CRITICAL` mistake, with this rationale:

> Without `ssr: false`, the route loader runs on the server where collections cannot sync, causing hangs or errors.
>
> — `@tanstack/db/skills/meta-framework/SKILL.md`, § Common Mistakes (source: `TanStack/db:examples/react/todo/src/start.tsx`)

### It is a real route option, and it is three-valued

`ssr` is a first-class route option, not a convention:

```ts
// node_modules/@tanstack/router-core/dist/esm/router.d.ts:42
export type SSROption = boolean | 'data-only'
```

```ts
// node_modules/@tanstack/router-core/dist/esm/route.d.ts:254
ssr?: Constrain<TSSR, undefined | SSROption | ((ctx: SsrContextOptions<...>) => Awaitable<undefined | SSROption>)>
```

So it can be `true`, `false`, `'data-only'`, or a **function** of `{ search, params, location, matches }` returning one of those.

### `false` vs `'data-only'` — this distinction matters and is easy to get wrong

`'data-only'` is **not** safe for TanStack DB. In the server load pipeline, only `false` skips the loader:

```js
// node_modules/@tanstack/router-core/dist/esm/load-server.js:211
if (match.ssr === false) outcome = Promise.resolve([SKIPPED]);
```

`beforeLoad` is likewise skipped only for `false`:

```js
// node_modules/@tanstack/router-core/dist/esm/load-server.js:144
if (match.ssr === false || !route.options.beforeLoad) {
```

`'data-only'` means *run the loader on the server, but don't render the component there*. That would execute `collection.preload()` on the server — exactly the thing the DB skill says hangs or errors. **Use `ssr: false`, never `ssr: 'data-only'`, on any route that touches a collection.**

### `ssr: false` is inherited by children

```js
// node_modules/@tanstack/router-core/dist/esm/load-server.js:56
if (parentSsr === false) return false;
```

A parent match resolving to `false` forces every descendant to `false`, regardless of what the child declares. This is the load-bearing fact for the route tree: **putting `ssr: false` once on the authenticated dashboard layout route covers the whole subtree.** You do not need to repeat it per leaf route.

The default when nothing is specified:

```js
// node_modules/@tanstack/router-core/dist/esm/load-server.js:59
const defaultSsr = router.options.defaultSsr ?? true;
```

### Does `collection.preload()` in a loader still work? Yes.

The loader is skipped *on the server*. On the client — both on hydration of a hard page load and on every client-side navigation — the loader runs normally. So the documented pattern is exactly:

```tsx
// @tanstack/db/skills/meta-framework/SKILL.md
export const Route = createFileRoute('/todos')({
  ssr: false,
  loader: async () => {
    await todoCollection.preload()
    return null
  },
  component: TodoPage,
})
```

And skipping the preload is itself called out as a `HIGH` mistake:

> Without preloading, the collection starts syncing only when the component mounts, causing a loading flash. Preloading in the route loader starts sync during navigation, making data available immediately when the component renders.
>
> — `@tanstack/db/skills/meta-framework/SKILL.md`

So preload's value is *concentrated on client-side navigation*, where the router awaits the loader before swapping the component in. On a cold hard load there is no navigation to hide the fetch behind — see below.

### What first paint actually looks like

This is the part worth being precise about, because "blank shell" is only true if you let it be. In the React renderer:

```js
// node_modules/@tanstack/react-router/dist/esm/Match.js:42
const resolvedNoSsr = match.ssr === false || match.ssr === "data-only";
```

```js
// node_modules/@tanstack/react-router/dist/esm/Match.js (MatchView return)
children: resolvedNoSsr
  ? jsx(ClientOnly, { fallback: pendingElement, children: jsx(MatchInner, { match }) })
  : jsx(MatchInner, { match })
```

`pendingElement` is the route's `pendingComponent` (`renderPending(router, route)`, `Match.js:20`). So on a cold load of a dashboard URL:

1. The server renders the root route's document shell (`__root.tsx` — `HeadContent`, `Scripts`, nav chrome, anything above the `ssr: false` boundary) **normally and fully**. The constraint only applies from the `ssr: false` match downward.
2. In place of the dashboard subtree, the server emits the **`pendingComponent`** of the `ssr: false` route. If no `pendingComponent` is defined, `pendingElement` is undefined and the fallback renders nothing — *that* is the blank-shell case.
3. The client hydrates, `ClientOnly` flips, `beforeLoad` + `loader` run (collection sync starts), and the real component renders.

**Practical consequence for bitig-flow:** the dashboard is not required to flash blank. Define a `pendingComponent` on the `ssr: false` layout route — a skeleton of the dashboard chrome — and it is server-rendered into the HTML, so first paint is a real skeleton rather than an empty div. But the actual data is unavoidably client-fetched: there is no way to have server-rendered document rows on a collection-backed route. Nothing about this is fixable with clever loader code; it is architectural.

This is also fine for the product. The dashboard is authenticated and behind a login; SEO and first-contentful-paint of real data do not matter there. The public viewer — where they *do* matter — was already settled as server functions + loaders with no collections, and gets full SSR.

### Global vs per-route

`createStart` supports a global default:

```ts
// node_modules/@tanstack/start-client-core/dist/esm/createStart.d.ts:8
defaultSsr?: TDefaultSsr
```

```ts
// @tanstack/db/skills/meta-framework/SKILL.md
export const startInstance = createStart(() => ({ defaultSsr: false }))
```

**Recommendation: do not use `defaultSsr: false` in this app.** It would disable SSR for the public viewer too, which is the one part of the app that genuinely needs it. Put `ssr: false` on the authenticated dashboard layout route and rely on inheritance.

---

## 2. `queryCollectionOptions` wired to `createServerFn`

### What the adapter requires

```ts
// node_modules/@tanstack/query-db-collection/dist/esm/query.d.ts:17-28
queryKey: TQueryKey | ((opts: LoadSubsetOptions) => TQueryKey)
queryFn: (context: QueryFunctionContext<TQueryKey>) => Promise<Array<T>> | Array<T>
queryClient: QueryClient
// plus getKey from BaseCollectionConfig
```

`queryFn` is mandatory — omitting it throws `QueryFnRequiredError` (`skills/db-core/collection-setup/references/query-adapter.md`).

### Concrete wiring

Server functions are just async functions on the client, so they drop straight into `queryFn` and the mutation handlers. A realistic bitig-flow shape:

```ts
// src/features/documents/documents.functions.ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const listDocuments = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { orgId } = await requireOrgMember()      // session -> active org -> role
    return documentRepo.listForOrg(orgId)            // org-scoping is a repo-layer invariant
  })

export const createDocument = createServerFn({ method: 'POST' })
  .validator(DocumentInsert)                          // zod 4 schema, see §5
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgMember()
    return documentRepo.insert({ ...data, orgId })
  })

export const renameDocument = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid(), title: z.string().min(1) }))
  .handler(async ({ data }) => { /* ... */ })

export const deleteDocument = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => { /* ... */ })
```

```ts
// src/db-collections/documents.ts
import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

export function createDocumentsCollection(queryClient: QueryClient, orgId: string) {
  return createCollection(
    queryCollectionOptions({
      id: `documents:${orgId}`,
      queryKey: ['org', orgId, 'documents'],
      queryClient,
      schema: DocumentSchema,
      getKey: (doc) => doc.id,
      queryFn: () => listDocuments(),
      onInsert: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((m) => createDocument({ data: m.modified })),
        )
        // do NOT refetch here — the adapter does it, see §3
      },
      onUpdate: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((m) =>
            renameDocument({ data: { id: m.key, ...m.changes } }),
          ),
        )
      },
      onDelete: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((m) => deleteDocument({ data: { id: m.key } })),
        )
      },
    }),
  )
}
```

Two hazards, both documented as `CRITICAL`:

- **`queryFn` must return complete collection state in eager mode.** Returning a filtered subset deletes everything else: *"In eager mode, `queryFn` is complete collection state. Returning `[]` means 'the server has no items' and removes all rows."* (`skills/db-core/collection-setup/SKILL.md`, source `docs/collections/query-collection.md`). Filter with a live query `where()`, never in `queryFn`. For bitig-flow this means `listDocuments` returns all of the org's documents; the vault filter is a live query.
- **Forward the abort signal** where you can: `queryFn: (ctx) => fetch(url, { signal: ctx.signal })` (`query-adapter.md`, § Request Cancellation). Whether a `createServerFn` call accepts an `AbortSignal` is listed as unconfirmed in §9.

### The QueryClient scoping trap — specific to this repo

`src/router.tsx` calls `getContext()`, which does `new QueryClient()` per `getRouter()` call. Collections are bound to a `QueryClient` instance, and the adapter reference is explicit that they are **not** universal singletons:

> Collections are stable within a `QueryClient` and business scope; they are not universal singletons. Creating several instances in one scope causes duplicate syncs and split state. A request-, router-, tenant-, or route-scoped client needs a scoped factory instead of the global module pattern.
>
> — `skills/db-core/collection-setup/SKILL.md`, § Common Mistakes (MEDIUM)

So the `export const fooCollection = createCollection(...)` module-global pattern shown in every doc example **does not fit this repo as written**, for two independent reasons: the `QueryClient` is created inside `getContext()`, and the active org is a business scope. The adapter reference gives the exact remedy — a factory memoized in a `WeakMap<QueryClient, Map<scope, Collection>>`, with `collection.cleanup()` on eviction (`query-adapter.md`, § Runtime QueryClient and Business Scopes, full code listing). The natural home is the router context, so route loaders and components resolve collections from context rather than importing a global.

The existing `src/db-collections/index.ts` is scaffold — a `localOnlyCollectionOptions` messages collection from the starter template — and should be replaced, not extended.

Also relevant: two copies of `@tanstack/db` produce `InvalidSourceError: ... is not a Collection`, and in dev a `DuplicateDbInstanceError` (`@tanstack/react-db/skills/react-db/SKILL.md`, § Common Mistakes HIGH). `pnpm ls @tanstack/db` currently shows one copy (0.7.2); worth re-checking after any dependency bump.

---

## 3. What `onInsert` / `onUpdate` / `onDelete` receive and must return

### Receive

A single object `{ transaction, collection }`. Confirmed in the compiled call site:

```js
// node_modules/@tanstack/db/dist/esm/collection/mutations.js
mutationFn: async (params) => {
  return await this.config.onInsert({
    transaction: params.transaction,
    collection: this.collection
  });
}
```

`transaction.mutations` is `Array<PendingMutation<T>>`:

```ts
// @tanstack/db/skills/db-core/mutations-optimistic/references/transaction-api.md
interface PendingMutation<T, TOperation = 'insert' | 'update' | 'delete'> {
  mutationId: string
  original: TOperation extends 'insert' ? {} : T   // {} for inserts
  modified: T                                      // full post-mutation row
  changes: Partial<T>                              // only changed fields
  key: any                                         // collection-local key (= getKey result)
  globalKey: string                                // collectionId + key
  type: TOperation
  metadata: unknown
  syncMetadata: Record<string, unknown>
  optimistic: boolean
  createdAt: Date
  updatedAt: Date
  collection: Collection
}
```

Which field to use per handler:

| Handler | Use | Why |
| --- | --- | --- |
| `onInsert` | `m.modified` | Full new row. `m.original` is `{}`. `m.changes` holds only the keys literally passed to `insert()`, so schema defaults are **absent** from `changes` but present in `modified`. |
| `onUpdate` | `m.key` + `m.changes` | Patch semantics. `m.modified` is available if you prefer full-row PUT. |
| `onDelete` | `m.key` | Nothing else is meaningful. |

The `changes`-vs-`modified` asymmetry on insert is explicit in the source — `changes` is built by picking only `Object.keys(item)` off the validated data, with the comment *"where a schema has default values ... for changes, we just want to show the data that was actually passed in"* (`dist/esm/collection/mutations.js`). **Use `modified` in `onInsert`.**

A handler may receive **multiple** mutations (batch insert, multi-key update, or a `createTransaction` batch), so always map over `transaction.mutations` rather than indexing `[0]`.

### Must return

Nothing is required. The return value is optional and only one field is read:

```js
// node_modules/@tanstack/query-db-collection/dist/esm/query.js:1020
const wrappedOnInsert = onInsert ? async (params) => {
  const handlerResult = await onInsert(params) ?? {};
  const shouldRefetch = handlerResult.refetch !== false;
  if (shouldRefetch) { await refetch(); }
  return handlerResult;
}
```

Identical wrappers exist for `onUpdate` (`:1028`) and `onDelete` (`:1036`).

So, for a Query collection:

- **Return nothing (or anything)** → the adapter refetches the collection's query keys and **awaits** that refetch before the mutation settles. This is the correct default, and it is what makes optimistic state hand off cleanly to confirmed state.
- **Return `{ refetch: false }`** → skip the automatic refetch. Only correct when the handler itself has written the confirmed server rows via `collection.utils.writeInsert` / `writeUpdate` / `writeBatch`.

Calling `utils.refetch()` inside a handler is a documented `HIGH` mistake — it produces one manual and one automatic request (`skills/db-core/mutations-optimistic/SKILL.md`).

`{ txid: ... }` is an **ElectricSQL** return contract, not a Query-collection one. Ignore it here.

A handler is also **mandatory**: `collection.insert()` without `onInsert` and without an ambient transaction throws `MissingInsertHandlerError` (`dist/esm/collection/mutations.js`).

One caveat worth knowing before reaching for `createTransaction`: for mutations captured by a manual transaction, *"collection-level `onInsert`/`onUpdate`/`onDelete` handlers are not invoked automatically. The manual transaction's `mutationFn` is responsible for persisting `transaction.mutations`"* (`skills/db-core/mutations-optimistic/SKILL.md`).

---

## 4. Optimistic inserts with client-generated uuidv7

This is the question the map's ID decision hinges on, and the answer is clean: **there is no id swap, and the id you send is canonical.**

### How the optimistic row is keyed

```js
// node_modules/@tanstack/db/dist/esm/collection/mutations.js
const validatedData = this.validateData(item, `insert`);
const key = this.config.getKey(validatedData);
if (this.state.has(key) || keysInCurrentBatch.has(key)) {
  throw new DuplicateKeyError(key);
}
```

The key is `getKey(validatedData)` — computed synchronously, in the same tick, from the object you passed to `insert()`. With `getKey: (doc) => doc.id` and a client-generated uuidv7 in `doc.id`, **the optimistic row is keyed by that uuidv7 immediately.** There is no temporary/negative/placeholder key anywhere in the pipeline.

### What happens on server response

The lifecycle is: *"optimistic mutation -> handler persists -> handler waits for sync/ack -> confirmed state. Optimistic state is applied in the current tick and dropped when the handler resolves."* (`skills/db-core/mutations-optimistic/SKILL.md`).

Sequence for a Query collection:

1. `insert()` applies the optimistic row at key `<uuidv7>` and returns a `Transaction`.
2. `onInsert` runs, calls `createDocument`, which persists a row with that same `id`.
3. The adapter refetches and awaits it (`query.js:1020`).
4. The refetched server row has the same `id`, so `getKey` yields the **same key**. The optimistic overlay is dropped and the synced row occupies the key.
5. `tx.isPersisted.promise` resolves.

The row never changes identity, so React keys, selection state, an open detail panel, and a URL containing the id all stay valid across the transition. This is precisely the payoff of the map's "client-generated uuidv7 with `DEFAULT uuidv7()` as server fallback" decision, and it is the reason that decision matters: **if the server were to assign a different id, the refetch would deliver a row at a new key while the optimistic row vanished — a visible flicker and any id-derived UI state would break.** The server must honour the client's id on insert, not overwrite it.

`safeRandomUUID()` is exported from `@tanstack/db` (uuid**4**), and the docs use it in examples — but bitig-flow wants uuid**v7** for index locality, so use whatever v7 generator the project standardises on. The only contract TanStack DB imposes is that the value is unique and `getKey` returns it.

### Failure

If `onInsert` throws, the transaction rolls back and the optimistic row is removed. `tx.isPersisted.promise` rejects (`transaction-api.md`). Rollback also cascades to other pending transactions sharing the same item keys. The skill flags the real UX hazard: *"the rollback removes the optimistic state — which can discard user work the user thought was saved"*, and suggests pending indicators, `{ optimistic: false }` for destructive operations, and idempotent endpoints (`skills/db-core/mutations-optimistic/SKILL.md`, § Tension).

For surfacing pending state there is a built-in: every live-query row carries a virtual `$synced` property, `false` while a local optimistic write is outstanding, usable in `where`/`select`/`orderBy` (`@tanstack/react-db/skills/react-db/SKILL.md`, § Virtual Properties). Note its documented caveat — it does **not** prove backend confirmation.

Because the client picks the id, retries are naturally idempotent if the server upserts on primary key — worth doing.

---

## 5. Schema validation with zod 4

`schema` accepts any [StandardSchema](https://standardschema.dev) validator; Zod is explicitly supported (`skills/db-core/collection-setup/references/schema-patterns.md`). Zod 4 implements StandardSchema, and the `@tanstack/query-db-collection` types are written directly against `StandardSchemaV1` from `@standard-schema/spec` (`query.d.ts:3`).

### Where the types come from

The overloads in `query.d.ts:210-235` establish a strict priority:

1. **Schema present** → row type is `StandardSchemaV1.InferOutput<TSchema>`, and insert input is `InferInput<TSchema>`.
2. **No schema** → inferred from the `queryFn` return type.

Which produces the documented `MEDIUM` mistake — **do not pass both a generic and a schema**: `createCollection<Todo>(queryCollectionOptions({ schema, ... }))` creates conflicting constraints (`skills/db-core/collection-setup/SKILL.md`). Write `createCollection(queryCollectionOptions({ schema, ... }))` and let inference run.

For bitig-flow this gives a single source of truth: one Zod schema per entity feeds the collection type, the `createServerFn` `.validator()`, and TanStack Form.

### Rules that will bite

- **Validation must be synchronous.** Async `.refine()` throws `SchemaMustBeSynchronousError` at mutation time. Do async checks (slug uniqueness, org membership) in the server function instead (`skills/db-core/collection-setup/SKILL.md`, HIGH).
- **`TInput` must be a superset of `TOutput`** whenever the schema transforms. `z.string().transform(v => new Date(v))` breaks `update()`, because the draft proxy hands the schema a `Date` on the way back in. Use `z.coerce.date()` (Zod-specific, simplest) or `z.union([z.string(), z.date()]).transform(...)` (`schema-patterns.md`). Every `createdAt`/`updatedAt`/`expiresAt` column in this app is affected — **use `z.coerce.date()`.**
- **The schema validates client mutations only.** Synced data from the adapter bypasses it entirely: *"Schemas validate client mutations only (`insert()`, `update()`). Synced data from backends ... bypasses the schema"* (`schema-patterns.md`, § Scope). So a Postgres `timestamptz` arriving as an ISO string through `queryFn` is **not** coerced to a `Date` by the collection schema, even though the collection's TypeScript type says `Date`. Either serialise dates properly in the server function or coerce in `queryFn`. This is a genuine type-vs-runtime trap.
- **`getKey` must never return undefined** — throws `UndefinedKeyError` (`skills/db-core/collection-setup/SKILL.md`, HIGH). `(doc) => doc.id` is safe.
- **Primary keys are immutable.** Changing the key in an `update()` draft throws `KeyUpdateNotAllowedError` (`skills/db-core/mutations-optimistic/SKILL.md`, HIGH).
- **`update()` takes a draft callback, not an object.** `collection.update(id, { ...item, title })` is a `CRITICAL` documented error; use `collection.update(id, (draft) => { draft.title = 'new' })`.

Validation errors surface as `SchemaValidationError` with `.type` and `.issues` (`schema-patterns.md`).

---

## 6. Cross-collection coherence

**Question:** if a document is renamed, should the vault list and the link list both update — join, or separate collections?

**Answer: separate collections, and no join is needed for the rename case.** A join is only needed when a single row must display fields from two collections at once.

The reasoning is about where the title lives. Documents, vault items, and links are separate server resources, so they are separate collections (a business scope names a distinct server resource — `query-adapter.md`). The document title is a column on `document`, and therefore exists in exactly one collection.

- If the vault list and the link list each render the title by **joining to `documentsCollection`**, then a single `documentsCollection.update(id, draft => { draft.title = ... })` propagates to both live queries automatically. Differential dataflow recomputes only the affected rows. That is the whole point of the architecture, and it is coherent by construction — there is no second copy to invalidate.
- If instead the server denormalises the title onto the `vault_item` or `link` payload, you have two copies, the optimistic rename updates only one, and they diverge until a refetch. **Avoid denormalising the title into those endpoints.**

So the join is not a coherence mechanism you add on top; it is the thing that makes coherence automatic. Concretely:

```ts
const vaultDocuments = createLiveQueryCollection((q) =>
  q
    .from({ item: vaultItemsCollection })
    .innerJoin({ doc: documentsCollection }, ({ item, doc }) => eq(item.documentId, doc.id))
    .where(({ item }) => eq(item.vaultId, vaultId))
    .select(({ item, doc }) => ({ id: doc.id, title: doc.title, addedAt: item.createdAt })),
)
```

Constraints on joins, all from `skills/db-core/live-queries/SKILL.md`:

- **Equality joins only.** A non-`eq()` condition throws `JoinConditionMustBeEqualityError` — an IVM limitation.
- Default join type is `left`; `leftJoin` / `rightJoin` / `innerJoin` / `fullJoin` are available.
- Sources must be wrapped as `{ alias: collection }`, or `InvalidSourceTypeError`.
- `orderBy` is required for `limit`/`offset`.
- The skill flags a general tension: *"The query builder looks like SQL but has constraints that SQL doesn't"* (`react-db/SKILL.md`, HIGH).

Multi-collection **writes** are a different matter and do need a construct: `createOptimisticAction` applies a synchronous `onMutate` across several collections in one transaction, with one `mutationFn` and all-or-nothing rollback (`skills/db-core/mutations-optimistic/SKILL.md`). Relevant if e.g. creating a document and adding it to a vault should be one atomic optimistic unit. Note `onMutate` **must be synchronous** — returning a Promise throws `OnMutateMustBeSynchronousError`, which is another reason ids must be generated synchronously on the client.

---

## 7. Defaults: `syncMode`, `gcTime`, `autoIndex`, `startSync`

From `node_modules/@tanstack/db/dist/esm/types.d.ts` (the installed 0.7.2 runtime, not the docs):

| Option | Default | Source | Change for this app? |
| --- | --- | --- | --- |
| `syncMode` | `'eager'` | `types.d.ts:452` | **No.** Eager is documented as right for `<10k rows`; on-demand is for `>50k` (`collection-setup/SKILL.md`). A portfolio-scale org has hundreds of documents. Eager also keeps `queryFn` trivial and avoids `parseLoadSubsetOptions` push-down entirely. |
| `gcTime` | 5 minutes (300000ms), *"when it has no active subscribers"* | `types.d.ts:~397` | **No.** Sensible for dashboard navigation. |
| `autoIndex` | `'off'` | `types.d.ts:418` | **No.** Setting `'eager'` without `defaultIndexType` throws `CollectionConfigurationError`. Add explicit `collection.createIndex()` only if a live query measurably drags. |
| `startSync` | `false` at the core level; **the Query adapter defaults it to `true`** | `types.d.ts:408` vs `query-adapter.md` optional-config table | Leave as the adapter sets it. Note collections pause syncing when no subscribers are attached and resume when they reattach, regardless (`types.d.ts` note). |

Query passthrough options (`staleTime`, `refetchOnWindowFocus`, `retry`, `refetchInterval`, …) all fall through to the `QueryClient` defaults when omitted (`query-adapter.md`). `placeholderData` is deliberately unsupported. `initialData` is eager-mode only — passing it with `syncMode: 'on-demand'` throws `InitialDataInOnDemandModeError`.

One `MEDIUM` trap if direct writes are ever used: *"Direct writes update the collection immediately, but the next `queryFn` returns complete server state which overwrites them."* Mitigate with `staleTime` or `{ refetch: false }` (`collection-setup/SKILL.md`).

---

## 8. Recommended shape for bitig-flow

1. **One `ssr: false` on the authenticated dashboard layout route.** Inheritance (`load-server.js:56`) covers the subtree. Never `'data-only'`. Do not set `defaultSsr: false` globally — the public viewer needs SSR.
2. **Give that layout route a `pendingComponent`** that renders the dashboard skeleton. It is server-rendered as the `ClientOnly` fallback (`Match.js`), so first paint is a skeleton rather than a blank div.
3. **Collections via a factory memoized on `(QueryClient, orgId)`**, exposed through router context — not module-level singletons, because `getContext()` mints a `QueryClient` per router and org is a business scope.
4. **`collection.preload()` in each dashboard route loader**, `Promise.all` for multiple collections.
5. **Eager `syncMode`; `queryFn` returns the org's complete set** for that resource. All filtering (by vault, by status) happens in live queries.
6. **One Zod 4 schema per entity**, shared by the collection, the `createServerFn` `.validator()`, and the form. `z.coerce.date()` for every timestamp.
7. **Client-generated uuidv7 in `insert()`**; the server honours it (upsert on PK for retry idempotency). No id swap occurs.
8. **Handlers map over `transaction.mutations`**, use `modified` for insert and `key`/`changes` for update/delete, and return nothing so the adapter's awaited refetch confirms the write.
9. **Don't denormalise document titles** into vault-item or link payloads; join in live queries so a rename propagates for free.

---

## 9. Unconfirmed

Stated plainly rather than guessed:

- **`AbortSignal` through `createServerFn`.** `query-adapter.md` says to forward `ctx.signal` to `fetch`. Whether a `createServerFn`-generated client callable accepts/forwards an `AbortSignal` was not verified in the Start source. Until confirmed, assume in-flight collection fetches are **not** cancellable, and note the consequence: on-demand subset unloading and `collection.cleanup()` only actually abort the request if the query function consumes `ctx.signal` (`query-adapter.md`).
- **Server-function serialisation of `Date`.** §5 establishes that synced data bypasses the collection schema, so the runtime type of a timestamp arriving through `queryFn` depends entirely on Start's server-function serialiser. Whether it revives `Date` objects across the RPC boundary (and whether `setupRouterSsrQueryIntegration`'s serialization adapters apply to server-function returns as well as loader data) was not verified. **Test this before trusting `Date` fields on synced rows.**
- **Interaction between `setupRouterSsrQueryIntegration` and collections.** `src/router.tsx` wires router↔query SSR dehydration. Whether a collection-owned query key participates in that dehydration — and whether an SSR-hydrated cache entry for the collection's exact query key could pre-seed the collection on the client (`query-adapter.md` notes hydrated data for the same exact key takes precedence over `initialData`) — is unverified. If it *does* work, it is a potential route around the cold-load fetch; treat as speculative until tested.
- **Skill-bundle version drift.** The bundled skills declare `library_version: 0.6.17`; installed runtime is `@tanstack/db` 0.7.2 / `query-db-collection` 1.2.4. Everything load-bearing above was re-verified against compiled source, but prose-only claims sourced solely from the skill markdown (e.g. the exact `gcTime` default rationale, the eager/on-demand row-count thresholds) carry that drift risk.
- **Whether the org id belongs in the collection key at all.** Assumed here that switching active orgs should produce a distinct collection. If org switching instead triggers a full router/context rebuild, a simpler scoping scheme may suffice. Downstream of the auth/tenancy ticket.
- **`useLiveInfiniteQuery` for analytics tables.** Exists and is documented (`react-db/SKILL.md`), but its interaction with eager `syncMode` — whether pagination is purely client-side over already-synced rows — was not investigated. Only matters if a visit-event table grows large enough to need it.
