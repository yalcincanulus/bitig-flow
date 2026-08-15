# drizzle-orm / drizzle-kit 1.0.0-rc.4 vs v0

Research for [#3](https://github.com/veotaar/bitig-flow/issues/3). Scope: what actually changes for a greenfield Postgres schema + migration workflow on the RC already in this repo (`drizzle-orm` and `drizzle-kit` both `1.0.0-rc.4`), including Relations v2 and a `uuid` PK with `DEFAULT uuidv7()`.

Pinned versions (worktree `package.json` + installed packages): **drizzle-orm@1.0.0-rc.4**, **drizzle-kit@1.0.0-rc.4** (kit GitHub release dated 2026-06-27, pre-release). Claims below are from official docs, those packages in `node_modules`, and drizzle-team/drizzle-orm GitHub issues. A throwaway `drizzle-kit generate` was run against a probe schema under `/tmp` (not in this repo) to verify SQL round-trip.

Standing constraints (not reopened): client-generated uuidv7 with `DEFAULT uuidv7()` server fallback; tables include better-auth owned tables plus `document`, `vault`, `vault_item`, `link`, `visit`, `visit_event`; Postgres 18+ native `uuidv7()` (map notes Postgres 19beta — treat as a **runtime version** constraint, not a Drizzle API).

---

## Verdict

Use the RC as the schema/migration stack. Declare tables with optional column-name args, extra config as **arrays**, and `uuid().primaryKey().default(sql\`uuidv7()\`)` (optionally plus `$defaultFn` for client fill). Pass **`defineRelations()`** into `drizzle({ relations })` — not v0 `relations()` and not `{ schema }` for `db.query`. Commit **`drizzle-kit generate`** output (per-migration folder with `migration.sql` + `snapshot.json`); use `push` only for throwaway local iteration. Do **not** enable Better Auth `experimental.joins` on 1.6.28 against this RC.

---

## 1. Breaking changes that hit a Postgres schema

Source: [Changes in v1](https://orm.drizzle.team/docs/v0-v1-changes), [Upgrading to v1](https://orm.drizzle.team/docs/upgrade-v1), [Drizzle schema](https://orm.drizzle.team/docs/sql-schema-declaration), installed `drizzle-orm` types.

### Relational Queries v1 removed

RQBv1 is gone. `drizzle({ schema })` no longer powers `db.query`. The v2 API is `defineRelations()` and `drizzle({ relations })`.

- Docs: [v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes), [Relations v1 → v2](https://orm.drizzle.team/docs/relations-v1-v2)
- Installed: `DrizzleConfig` still has both `schema?` and `relations?` (`drizzle-orm/utils.d.ts`), but `drizzle-orm/node-postgres/driver.js` only reads `config.relations`. `PgAsyncDatabase._` exposes `relations`, not `fullSchema`.

v0 `relations()` still exists under `drizzle-orm/_relations` for old types; do not use it on this stack.

### Column builders

v1 docs declare columns **without** a required DB name: `integer()`, `text()`, `uuid()`. The TypeScript key is the default SQL name. Aliases remain `varchar('first_name')`.

- [SQL schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration)
- [PostgreSQL column types](https://orm.drizzle.team/docs/column-types/pg)

`uuid(name?: string)` in `pg-core/columns/uuid.d.ts`.

### Casing

`drizzle({ casing: 'snake_case' })` is gone from `DrizzleConfig` in rc.4. Mapping is table/view/schema-level:

```ts
import { snakeCase } from "drizzle-orm/pg-core";

export const users = snakeCase.table("users", {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  createdAt: timestamp(), // → created_at
});
```

- [v0 → v1 — New Casing API](https://orm.drizzle.team/docs/v0-v1-changes)
- Installed: `pg-core/casing.d.ts`

### Indexes / extra table config

The third `pgTable` argument should return an **array**. Object form is still typed but `@deprecated` (“will only accept an array”).

```ts
export const posts = pgTable("posts", { ... }, (t) => [
  uniqueIndex("slug_idx").on(t.slug),
  index("title_idx").on(t.title),
]);
```

- Docs: [Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) (array examples)
- Installed: `pg-core/table.d.ts`

### Enums

Still `pgEnum('name', ['a', 'b'])`, then `role: rolesEnum().default('guest')`. Second overload accepts a TypeScript enum object (`pg-core/columns/enum.d.ts`). Kit generate emits `CREATE TYPE ... AS ENUM(...)`.

### Defaults

`.default(value)` or `.default(sql\`...\`)` become SQL `DEFAULT`. `$defaultFn` / `$default` are **runtime-only** and do not appear in kit SQL (column-builder docs in types; confirmed in probe generate).

`uuid().defaultRandom()` is `default(sql\`gen_random_uuid()\`)` (`pg-core/columns/uuid.js`).

### Other schema-adjacent breaks

| Change | Source |
| --- | --- |
| `.array()` is not chainable; use `.array('[][]')` | [v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes); `pg-core/columns/common.d.ts` |
| `.enableRLS()` deprecated; `pgTable.withRLS(...)` | [v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes) |
| `.generatedAlwaysAs()` only `sql` / `() => sql` (Pg builder) | [v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes); `PgColumnBuilder.generatedAlwaysAs(as: SQL \| (() => SQL))` |
| `getTableColumns` deprecated → `getColumns` | [v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes); both still exported |
| Validators live in `drizzle-orm/zod` (etc.) | [v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes); package exports `./zod` |

---

## 2. Relations v2

Sources: [Drizzle relations](https://orm.drizzle.team/docs/relations), [Migrating RQBv1 → v2](https://orm.drizzle.team/docs/relations-v1-v2), `drizzle-orm/relations.d.ts`.

### Shape vs v1 `relations()`

v1: per-table `relations(users, ({ one, many }) => ({ ... }))`, `fields` / `references`, `relationName`, pass all of them via `drizzle({ schema })`.

v2: one `defineRelations(schema, (r) => ({ ... }))`. `r.one.users({ from, to })`, `r.many.posts()`, `alias` instead of `relationName`, `optional` on `one`, `through` for M2M. Pass the result as `drizzle({ relations })`.

`from` / `to` accept a column or an array. You can define **only** the `many` side (`from`/`to` on that side). Inverse `r.many.users()` can omit `from`/`to` when the other side already specifies the join.

Split with `defineRelationsPart` and merge: `drizzle({ relations: { ...relations, ...part } })`.

`db.query` keys are the **TypeScript table keys** in that object (`document`, `vault`, …). Filters and `orderBy` are objects:

```ts
await db.query.document.findMany({
  where: { title: { ilike: "%x%" } },
  orderBy: { title: "asc" },
  with: { vaults: true, links: true },
});
```

SQL-like `db.select().from(document)` is unchanged and does not need relations.

### Idiomatic v2 for bitig-flow

Assumption (see Unconfirmed): `vault_item` is the junction between `vault` and `document`; `link` and `visit` are one-to-many from `document`; `visit_event` is one-to-many from `visit`.

```ts
import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  document: {
    vaults: r.many.vault({
      from: r.document.id.through(r.vaultItem.documentId),
      to: r.vault.id.through(r.vaultItem.vaultId),
    }),
    links: r.many.link({
      from: r.document.id,
      to: r.link.documentId,
    }),
    visits: r.many.visit(),
  },
  vault: {
    documents: r.many.document(),
  },
  vaultItem: {
    vault: r.one.vault({
      from: r.vaultItem.vaultId,
      to: r.vault.id,
      optional: false,
    }),
    document: r.one.document({
      from: r.vaultItem.documentId,
      to: r.document.id,
      optional: false,
    }),
  },
  link: {
    document: r.one.document({
      from: r.link.documentId,
      to: r.document.id,
    }),
  },
  visit: {
    document: r.one.document({
      from: r.visit.documentId,
      to: r.document.id,
    }),
    events: r.many.visitEvent(),
  },
  visitEvent: {
    visit: r.one.visit({
      from: r.visitEvent.visitId,
      to: r.visit.id,
      optional: false,
    }),
  },
}));
```

Query M2M without walking the junction:

```ts
await db.query.vault.findMany({ with: { documents: true } });
```

`through` is `RelationsBuilderColumn.through` in `relations.d.ts`. Docs: [Many-to-many](https://orm.drizzle.team/docs/relations).

Keep FK `.references()` on the tables themselves; relations are query-only (Drizzle team: relations do not affect generated SQL — [issue #5104](https://github.com/drizzle-team/drizzle-orm/issues/5104)).

---

## 3. `uuid` PK + `DEFAULT uuidv7()` + client-supplied id

Official column docs only show `uuid().defaultRandom()` → `DEFAULT gen_random_uuid()` and string literals ([PostgreSQL column types](https://orm.drizzle.team/docs/column-types/pg), [Indexes — Default](https://orm.drizzle.team/docs/indexes-constraints)). There is **no** `defaultUUIDv7()` helper in rc.4 (`pg-core/columns/uuid.js`).

### What to write

```ts
import { sql } from "drizzle-orm";
import { uuid } from "drizzle-orm/pg-core";

id: uuid().primaryKey().default(sql`uuidv7()`)
```

- **Database:** `DEFAULT uuidv7()` so omitted inserts get a server value (Postgres 18+).
- **Client:** inserts may still pass `id`. `.default()` makes `id` optional on `$inferInsert`; supplying it is allowed.
- **Optional client fill when the app omits `id`:** chain `$defaultFn(() => uuidv7FromLib())`. Kit ignores `$defaultFn` (types + probe).

Do **not** write `.default("uuidv7()")`. Uuid `defaultFromDrizzle` in kit quotes JS strings (`'${value}'` in `payload-postgres.js`). Only `SQL` objects skip that path (`defaultFromColumn` uses `dialect.sqlToQuery(def).sql`).

### Probe: does `sql\`uuidv7()\`` round-trip through `generate`?

Yes, on **drizzle-kit@1.0.0-rc.4**. Probe generate produced:

```sql
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"title" text NOT NULL
);
```

Snapshot DDL stored `"default": "uuidv7()"` (unquoted function). `$defaultFn` did not appear in SQL. `uuid().defaultRandom()` emitted `DEFAULT gen_random_uuid()`. A second `generate` with no schema change printed “No schema changes”.

`drizzle-kit pull` used to stringify `uuidv7()` as `.default("uuidv7()")` ([#5093](https://github.com/drizzle-team/drizzle-orm/issues/5093)); closed as fixed in **beta.6**. rc.4 `Uuid.toTs` maps `gen_random_uuid()` → `.defaultRandom()` and other `foo()` defaults → `` sql`foo()` ``. Prefer **generate from TypeScript**, not pull, as the source of truth.

---

## 4. drizzle-kit RC workflow

Sources: [Kit overview](https://orm.drizzle.team/docs/kit-overview), [`generate`](https://orm.drizzle.team/docs/drizzle-kit-generate), [`push`](https://orm.drizzle.team/docs/drizzle-kit-push), [`migrate`](https://orm.drizzle.team/docs/drizzle-kit-migrate), [v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes), [upgrade v1](https://orm.drizzle.team/docs/upgrade-v1), probe output, `drizzle-kit/index.d.ts`.

### `generate` vs `push`

| | `generate` + `migrate` | `push` |
| --- | --- | --- |
| SQL files | yes — review, commit, CI | none |
| Applies to DB | `drizzle-kit migrate` or `migrate()` | immediately (after confirm) |
| Intended | production / teams | prototyping |

For this app: **generate + migrate**. `push` is fine for a scratch local DB; do not mix push-only local state with committed migrations without a reset.

`--strict` is removed; push always confirms data-loss unless `--force`. Preview with `push --explain`.

### Config shape (rc.4)

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts", // glob or string[]
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
});
```

`generate` needs `dialect` + `schema`. `migrate` / `push` need credentials. Default `out` is `./drizzle`.

`schemaFilter` default is **all schemas**, not only `public`; globs are documented in [v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes). Kit `Config` JSDoc still describes the old public-only / no-glob behaviour (stale 0.21 comments in `index.d.ts`) — trust the v1 docs.

### Where migrations live (v3 folder)

No `_journal.json`. Each migration is a folder:

```
drizzle/
  20260815145257_uuidv7-probe/
    migration.sql
    snapshot.json
```

Snapshots are **DDL** (version `"8"`, `dialect: "postgres"`, `id` UUID, `prevIds`, `ddl` array). Probe first snapshot `prevIds` is the zero UUID.

`drizzle-kit drop` is **removed**. Fix a bad migration by deleting its folder (and any later folders) before it is applied.

Migrator matches by **full folder name**, applies **all missing** migrations (not “newer than last timestamp”). `__drizzle_migrations` gains `name` and `applied_at` ([v0 → v1](https://orm.drizzle.team/docs/v0-v1-changes)). Greenfield: first `migrate` creates that table; no `drizzle-kit up`.

### Is generated SQL stable enough to commit?

**Yes, commit the whole folder.** SQL from a given schema was stable across a no-op regenerate. `snapshot.json` includes a random snapshot `id`; that file is the parent of the next diff — it must be committed with the SQL. Do not hand-edit snapshot ids.

Kit `generate` now also runs **commutativity / branch-conflict** checks (`--ignore-conflicts` to skip; docs say that usually means a kit bug).

rc.4 extras (not required for us): `--output json`, programmatic `drizzle-kit/cli`, `drizzle-kit mcp`, `drizzle-kit skills` ([v1.0.0-rc.4 release](https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-rc.4)).

---

## 5. RC caveats that bite a greenfield project

### drizzle-kit

- **[#5960](https://github.com/drizzle-team/drizzle-orm/issues/5960)** / **[#5909](https://github.com/drizzle-team/drizzle-orm/issues/5909)** (open on rc.4): `generate`/`check` commutativity walk is exponential on merged snapshot DAGs. Greenfield stays linear if you generate on one line of history. Avoid merge-commit snapshot diamonds; if generate hangs, empty `out` is fast again.
- **[#6071](https://github.com/drizzle-team/drizzle-orm/issues/6071)**: `text`/`varchar`/`char`/enum `.default(non-string)` throws `input.replace is not a function`. Use string or `sql\`...\`` defaults.
- Kit `Config` JSDoc is still written as 0.21.0+; behaviour follows v1 docs, not those comments.
- `drizzle-kit drop` is gone.

### Relations / `drizzle()`

- `db.query` exists only if `relations` is passed. SQL builder still uses imported table objects.
- `DrizzleConfig.schema` is typed but **unused** by `node-postgres` construct in rc.4. Do not expect `db._.fullSchema`.
- Nested `{ identity: { person } }` schema objects for `defineRelations` are a feature request ([#5483](https://github.com/drizzle-team/drizzle-orm/issues/5483)); keep a **flat** schema export.

### Better Auth (installed `better-auth@1.6.28`)

This is the sharpest integration risk.

- `@better-auth/drizzle-adapter@1.6.28` peer is `drizzle-orm@^0.45.2`. **No** `./relations-v2` export.
- Adapter still does `config.schema || db._.fullSchema` and, for `experimental.joins`, `db.query[model].findFirst/findMany` with v1-shaped `where`. On rc.4, **always pass tables** into `drizzleAdapter(db, { provider: "pg", schema: { user, session, ... } })`.
- `experimental.joins: true` + `defineRelations` 500s on 1.6.x ([better-auth#10297](https://github.com/better-auth/better-auth/issues/10297)). Official v2 adapter is aimed at **better-auth 1.7** ([better-auth#6766](https://github.com/better-auth/better-auth/issues/6766), [PR #9489](https://github.com/better-auth/better-auth/pull/9489)). Until then: generate auth tables with the CLI, include them in kit `schema` globs, **leave joins off**.
- Auth CLI historically emitted v1 `relations()`. Do not paste that into this repo. Either wait for 1.7 `defineRelationsPart` (`authRelations`) or hand-write auth edges in the app `defineRelations` / a `defineRelationsPart`.

### Postgres `uuidv7()`

Drizzle will emit `DEFAULT uuidv7()`. The function exists only if the server is new enough (Postgres 18+). That is independent of kit.

### Pre-release

rc.4 is a GitHub pre-release. APIs can still move before 1.0.0. Pin both packages together.

---

## Recommended shape for bitig-flow

1. **Packages:** keep `drizzle-orm` and `drizzle-kit` on the same RC (already `1.0.0-rc.4`).
2. **Schema files:** `src/db/schema.ts` (or `src/db/schema/*.ts` + glob). Export every table/enum. Use `snakeCase.table` if TS keys are camelCase. Extra config as arrays. Auth tables from Better Auth CLI live beside app tables so kit sees them.
3. **IDs:** `uuid().primaryKey().default(sql\`uuidv7()\`)`. App inserts pass client uuidv7. Optionally `$defaultFn` with a portable uuidv7 lib (not `bun`'s `randomUUIDv7` inside schema files — kit loads schema in Node; [#4469](https://github.com/drizzle-team/drizzle-orm/issues/4469)).
4. **FKs:** `.references()` on `vault_item.vaultId` / `documentId`, `link.documentId`, `visit.documentId`, `visitEvent.visitId`, plus `onDelete` as the domain requires.
5. **Relations:** one `defineRelations` (plus `defineRelationsPart` for auth if 1.7 lands). `drizzle({ client, relations })`. Query builder imports tables directly.
6. **Kit:** root `drizzle.config.ts` as above; `out: "./drizzle"`. Scripts: `drizzle-kit generate`, `drizzle-kit migrate`. Commit each `drizzle/<timestamp>_<name>/` folder. Linear history only.
7. **Better Auth:** pass explicit `schema` of **tables** into the adapter; do not enable `experimental.joins` on 1.6.28.
8. **Local:** `push` only against disposable DBs, or always `generate` even locally so `out/` stays the source of truth.

---

## Unconfirmed

- Exact FK graph for `document` / `vault` / `vault_item` / `link` / `visit` / `visit_event` (no `CONTEXT.md` in this worktree; the M2M example above assumes vault ↔ document via `vault_item`).
- Whether Better Auth 1.7 / `@better-auth/drizzle-adapter/relations-v2` will be the adapter we ship with; 1.6.28 does not include it.
- Whether `drizzle({ schema, relations })` will be restored for `fullSchema` before 1.0.0 (typed today, unused on node-postgres).
- Snapshot `ddl` JSON field order / non-SQL churn across kit patch versions — SQL for a fixed schema was stable on rc.4; snapshot `id` is always new per first generate.
- Kit `schemaFilter` glob matching vs the stale `Config` JSDoc — documented in v1, not re-tested here.
- Runtime insert behaviour when both `.default(sql\`uuidv7()\`)` and `$defaultFn` are set (which wins if the driver omits vs sends the column) — types allow both; not executed against Postgres in this research.
- Native `uuidv7()` availability on the map’s “Postgres 19beta” vs 18 — Drizzle does not version-gate the function name.
