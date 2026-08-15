# Better Auth + organization plugin + uuidv7 Drizzle schema

**Ticket:** [veotaar/bitig-flow#4](https://github.com/veotaar/bitig-flow/issues/4)  
**Sources:** Better Auth docs (MCP `user-Better Auth`, retrieved 2026-08-15) and installed `better-auth@1.6.28` (`@better-auth/core@1.6.28`, `@better-auth/drizzle-adapter@1.6.28`). TanStack Start from installed `@tanstack/react-start@1.168.45`. Drizzle from installed `drizzle-orm@1.0.0-rc.4`. CLI generator from GitHub tag `v1.6.28`.

Standing constraints used as the target: organization plugin; fixed roles `owner` / `admin` / `member`; `advanced.database.generateId: false`; client uuidv7 for app-owned rows + DB `DEFAULT uuidv7()` for auth-owned rows; HTTP auth only through the Better Auth catch-all plus `createServerFn`; custom `EmailTransport` (Resend prod, nodemailer→mailpit dev); email verification by 6-digit code, not magic links.

---

## 1. Drizzle adapter: mapping a user-provided schema

Better Auth does not introspect SQL. The Drizzle adapter looks up **JavaScript schema object keys**, then reads **Drizzle column properties** on those tables.

Installed adapter (`better-auth/adapters/drizzle` re-exports `@better-auth/drizzle-adapter`):

```ts
drizzleAdapter(db, {
  provider: "pg", // "pg" | "mysql" | "sqlite"
  schema,         // Record of tables; required if db._.fullSchema is missing
  usePlural,      // optional; treat model "user" as schema key "users"
  camelCase,      // CLI naming hint; default snake_case SQL identifiers
  transaction,    // default false
})
```

Sources: [Drizzle adapter docs](https://better-auth.com/docs/adapters/drizzle); `@better-auth/drizzle-adapter` `dist/index.d.mts` and `dist/index.mjs` (1.6.28).

### Table keys

`getSchema(model)` does `schema[model]` where `model` is the Better Auth model name (`user`, `session`, `account`, `verification`, plus plugin models). If the key is missing it throws: *The model "…" was not found in the schema object.*

Two supported remaps ([docs](https://better-auth.com/docs/adapters/drizzle#modifying-table-names)):

1. Adapter `schema: { ...schema, user: schema.users }` (map BA model → your export).
2. Auth config `user: { modelName: "users" }` (BA uses that key).
3. Or `usePlural: true` if **all** tables are plural.

For experimental joins, each Drizzle `relations()` pair must be passed through the adapter schema object ([docs](https://better-auth.com/docs/adapters/drizzle#joins-experimental)).

### Column names and types

Better Auth logical field names (`email`, `userId`, `emailVerified`, …) must exist as **properties** on the Drizzle table object. The SQL identifier can differ:

```ts
email: varchar("email_address", { length: 255 }).notNull().unique()
```

That keeps the property `email` while the DB column is `email_address` ([docs](https://better-auth.com/docs/adapters/drizzle#modifying-field-names)). Alternatively set `user.fields.email: "email_address"` in auth config ([database docs](https://better-auth.com/docs/concepts/database#custom-table-names)). Type inference still uses the original names (`user.email`).

On insert, `checkMissingFields` walks the payload and requires `schemaModel[fieldName]` to exist (`drizzle-adapter` `dist/index.mjs`).

Core tables and TypeScript field types (logical types, not SQL) are documented in [Core schema](https://better-auth.com/docs/concepts/database#core-schema): `id` is `string` on user, session, account, and verification. Adapter output always stringifies `id` and FK-to-`id` values (`@better-auth/core` `factory.mjs` `transformOutput`).

PostgreSQL `uuid` columns are fine: Drizzle’s `uuid()` column data type is `string` (`drizzle-orm/pg-core/columns/uuid.d.ts`).

Docs currently say `npm install @better-auth/drizzle-adapter`. In 1.6.28 the same adapter is also exported from `better-auth/adapters/drizzle` (package `exports`). Either import works; a separate install is not required for this version.

---

## 2. `advanced.database.generateId: false` — exact semantics

[ID generation docs](https://better-auth.com/docs/concepts/database#id-generation) and [options](https://better-auth.com/docs/reference/options#advanced):

> Setting `generateId` to `false` allows your database handle all ID generation  
> Setting `generateId: false` (without a function) disables ID generation for **all** tables.

Runtime (`better-auth/dist/context/create-context.mjs`):

```js
if (dbGenerateId === "serial" || dbGenerateId === false) return false;
```

Adapter factory (`@better-auth/core` `get-id-field.mjs`): when `generateId === false`, the id field’s `defaultValue()` returns `undefined`. `transform.input` then drops empty ids, so **the insert payload omits `id`**. PostgreSQL `INSERT … RETURNING` (`drizzle-adapter` `withReturning`) reads the row the database produced.

So **yes, for adapter-mediated creates**, Better Auth relies on a database default (or identity) on **every model it inserts**, including core `user`, `session`, `account`, `verification` and organization plugin `organization`, `member`, `invitation` (and `team` / `teamMember` / `organizationRole` only if those features are enabled).

Caveats confirmed in 1.6.28 source:

| Path | Behavior when `generateId: false` |
| --- | --- |
| Adapter `create` | Omits `id`; DB default must exist. Passing `id` is **stripped** unless `forceAllowId` (`factory.mjs`). App code cannot inject client uuidv7 through normal Better Auth creates. |
| `createUser` (email sign-up) | Goes through adapter create with no `id` (`sign-up.mjs` `internalAdapter.createUser`). DB default applies. |
| Synthetic user (enumeration protection) | `generateId({ model: "user" }) \|\| generateId()` — `false \|\| generateId()` yields a **JS nanoid**. This id is **not written**; it is only the fake response body (`sign-up.mjs`). |
| `createSession` | Pre-assigns `id` **only** when `secondaryStorage` is set and sessions are **not** stored in the DB. Then `generatedId !== false ? generatedId : generateId()` — so KV-only sessions still get a JS id. Database-backed sessions omit `id` and use the DB default (`internal-adapter.mjs`). |
| Session **token** | Always `generateId(32)` (opaque string, not the PK). Independent of `generateId: false`. |
| Memory adapter | Logs a hard error: no id will exist ([same `create-context.mjs`](https://better-auth.com/docs/concepts/database#id-generation)). |

`generateId: "uuid"` is a **different** mode: JS `crypto.randomUUID()` except PostgreSQL adapters set `supportsUUIDs: true` (`drizzle-adapter` `supportsUUIDs: config.provider === "pg"`), so the DB is expected to fill UUIDs. The CLI then emits `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`)` — **UUID v4**, not v7. That mode does not satisfy the uuidv7 constraint.

Invitation security: with `generateId: false`, Better Auth treats invitation ids as externally controlled / predictable and **requires verified email** on accept/reject/get-by-id unless `requireEmailVerificationOnInvitation: false` ([organization docs](https://better-auth.com/docs/plugins/organization#email-verification-requirement)). uuidv7 is time-ordered; keep the default-on verification requirement.

---

## 3. CLI-generated schema vs hand-edited uuidv7

Command: `pnpm dlx auth@latest generate` (or `npx auth@latest generate`). For Drizzle this writes TypeScript, default path `schema.ts` in the project root, overridable with `--output`. `auth migrate` is **Kysely-only**; Drizzle uses `drizzle-kit generate` / `migrate` after the TS schema exists ([CLI](https://better-auth.com/docs/concepts/cli#generate), [database](https://better-auth.com/docs/concepts/database#generating-schema)).

Generator source: `packages/cli/src/generators/drizzle.ts` at tag `v1.6.28`.

With `generateId` unset / not `"uuid"` / not `"serial"` (including **`false`**), PostgreSQL primary keys are:

```ts
id: text('id').primaryKey()
```

No SQL `DEFAULT`. Foreign keys to `id` are also `text('…')`. Table identifiers are snake_cased unless adapter `camelCase: true`. Logical field names stay camelCase properties (`userId: text('user_id')`).

With `generateId: "uuid"` and `provider: "pg"`:

```ts
id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey()
```

FK-to-id columns become `uuid('…')`. Still **v4**.

### Hand-edits for uuidv7

After a generate (or instead of treating generate as source of truth), change every auth-owned PK and every FK that references those PKs:

```ts
import { sql } from "drizzle-orm";
import { uuid, text, boolean, timestamp, pgTable } from "drizzle-orm/pg-core";

id: uuid("id").default(sql`uuidv7()`).primaryKey(),
userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
```

Installed Drizzle `uuid()` has `defaultRandom()` → `gen_random_uuid()` only (`pg-core/columns/uuid.d.ts`). There is **no** first-class `defaultUUIDv7()`. Use `sql\`uuidv7()\`` (PostgreSQL 18+) or your extension’s function (`pg_uuidv7`, etc.).

Also keep property names aligned with Better Auth (`emailVerified`, `activeOrganizationId`, …).

### Is regenerating after edits safe?

**No, not as an in-place merge.** The generator returns `overwrite: fileExist` (`packages/cli/src/commands/generate.ts`). If the output file exists, the CLI prompts and then **`writeFile`s the entire generated string**. Hand-edits (uuidv7 defaults, extra columns, comments) are destroyed.

Practical ownership: run generate **once** into a scratch file (or `--output` a temp path), copy into the hand-maintained schema, then treat `docs`/app schema as **hand-owned**. Later plugin fields: generate to a temp file and merge by hand, or add columns from the plugin schema docs.

---

## 4. Organization plugin

Install: `organization()` on the server, `organizationClient()` on the client ([docs](https://better-auth.com/docs/plugins/organization)). Then generate/migrate.

### Tables it adds (default names)

From [Schema](https://better-auth.com/docs/plugins/organization#schema) and `organization.mjs` `schema` (1.6.28):

**`organization`:** `id`, `name`, `slug` (unique), `logo?`, `metadata?` (stored as string), `createdAt`.

**`member`:** `id`, `userId` → user, `organizationId` → organization, `role` (string, default `"member"`), `createdAt`. Multiple roles are comma-separated ([docs](https://better-auth.com/docs/plugins/organization#roles)).

**`invitation`:** `id`, `email`, `inviterId` → user, `organizationId`, `role?`, `status` (default `"pending"`: pending / accepted / rejected / canceled), `createdAt`, `expiresAt`. Optional `teamId` only if teams are enabled.

**`session` extras:** `activeOrganizationId?`. `activeTeamId?` only if teams are enabled.

Optional, **do not add** unless those features are turned on:

- `team` + `teamMember` when `teams.enabled: true`.
- `organizationRole` when `dynamicAccessControl.enabled: true`.

Schema remaps: `organization({ schema: { organization: { modelName, fields, additionalFields } } })`.

### `activeOrganization`

[Docs](https://better-auth.com/docs/plugins/organization#active-organization): the workspace on the **session**. Default after sign-in is `null`. `organization.setActive({ organizationId | slug })` writes `session.activeOrganizationId`. Passing `null` unsets it.

Most org APIs default to the active org when `organizationId` is omitted.

Client: `authClient.useActiveOrganization()`. Docs note you can keep active org client-only (e.g. per tab) instead of persisting it.

To set an initial org at session creation, use a session `databaseHooks` create/before and set `activeOrganizationId` ([docs](https://better-auth.com/docs/plugins/organization#set-active-organization)).

### Invitation flow

1. Implement `sendInvitationEmail` — **required** for invite-by-email ([docs](https://better-auth.com/docs/plugins/organization#setup-invitation-email)). Better Auth does **not** build the URL. You send a link containing the invitation id; the logged-in user calls `acceptInvitation({ invitationId })`.
2. Payload (`types.d.mts`): `{ id, role, email, organization, invitation, inviter: Member & { user } }`, plus optional `request`.
3. Default expiry: 48 hours (`invitationExpiresIn`).
4. `addMember` is **server-only** and skips email.
5. With `generateId: false`, keep `requireEmailVerificationOnInvitation` at its auto-on behavior (or set `true` explicitly).
6. Client `listUserInvitations` always requires a verified session email.

Hooks: `organizationHooks.beforeCreateInvitation` / `afterCreateInvitation` / accept / reject / cancel ([docs](https://better-auth.com/docs/plugins/organization#invitation-hooks)). `afterCreateInvitation` is for extra side effects; **delivery still goes through `sendInvitationEmail`**.

---

## 5. Access control

Import `createAccessControl` from `better-auth/plugins/access` (not `better-auth/plugins`) to keep the client bundle small ([docs](https://better-auth.com/docs/plugins/organization#create-access-control)).

### Statements and roles

```ts
const statement = {
  project: ["create", "share", "update", "delete"],
} as const;
const ac = createAccessControl(statement);
const member = ac.newRole({ project: ["create"] });
```

Pass `{ ac, roles: { owner, admin, member } }` into **both** `organization()` and `organizationClient()`.

### Fixed owner / admin / member

Defaults (`better-auth/plugins/organization/access`, `statement.mjs`):

| Role | organization | member | invitation | team | ac (dynamic roles) |
| --- | --- | --- | --- | --- | --- |
| owner | update, delete | create, update, delete | create, cancel | create, update, delete | create, read, update, delete |
| admin | update | create, update, delete | create, cancel | create, update, delete | create, read, update, delete |
| member | (none) | (none) | (none) | (none) | read |

Docs: owner created the org; admin cannot delete the org or change the owner; member is read-only on those resources ([docs](https://better-auth.com/docs/plugins/organization#roles)).

**Custom roles named `owner` / `admin` / `member` replace the built-in permission sets.** To extend rather than wipe, spread `defaultStatements` into the statement object and spread `ownerAc.statements` / `adminAc.statements` / `memberAc.statements` into each `newRole` ([docs](https://better-auth.com/docs/plugins/organization#create-roles)).

New resources (`project`, …) are **not** implicitly granted to owner. `hasPermissionFn` only treats creator as omnipotent if `allowCreatorAllPermissions` is passed on the check (`permission.mjs`). For fixed three roles, put every app resource on the three role objects explicitly.

### Server vs client checks

- **Server:** `auth.api.hasPermission({ headers, body: { permissions: { project: ["create"] } } })`. Resolves the session member role (and dynamic `organizationRole` rows if enabled) (`has-permission.mjs`).
- **Client → server:** `authClient.organization.hasPermission({ permissions })` (network).
- **Client-only, sync:** `authClient.organization.checkRolePermission({ role: "admin", permissions })`. Does **not** include dynamic roles ([docs](https://better-auth.com/docs/plugins/organization#access-control-usage)).

Authorization for org mutations (invite, update member, delete org, …) is enforced on the server from these statements. UI checks are hints only.

Dynamic access control is optional and adds `organizationRole`. Skip it for fixed owner/admin/member.

---

## 6. TanStack Start integration

Installed `@tanstack/react-start@1.168.45`. Official guide: [TanStack Start](https://better-auth.com/docs/integrations/tanstack).

### Catch-all handler (the one HTTP surface)

`src/routes/api/auth/$.ts`:

```ts
import { auth } from "@/lib/auth";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => auth.handler(request),
      POST: ({ request }: { request: Request }) => auth.handler(request),
    },
  },
});
```

Default `basePath` is `/api/auth` ([options](https://better-auth.com/docs/reference/options#basepath)). Client SDK talks to this route. This is the exception to “everything is `createServerFn`”.

### Session inside `createServerFn`

Docs pattern (`src/lib/auth.functions.ts`):

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  return auth.api.getSession({ headers });
});
```

`@tanstack/react-start/server` re-exports `@tanstack/react-start-server`. Use `ensureSession` (throw if missing) to guard other server functions. Protect routes with `beforeLoad` + `getSession` + `redirect` ([docs](https://better-auth.com/docs/integrations/tanstack#protecting-resources)).

### Cookies

- Catch-all `auth.handler(request)` returns `Set-Cookie` on the `Response` — browsers store them on `/api/auth/*` calls.
- If `auth.api.signInEmail` (or any cookie-writing API) runs **inside** `createServerFn`, those headers will not reach the browser unless `tanstackStartCookies()` is registered **last** in `plugins` ([docs](https://better-auth.com/docs/integrations/tanstack#usage-tips)). Implementation: `better-auth/tanstack-start` parses `set-cookie` and calls `setCookie` from `@tanstack/react-start/server`.

Cookie attributes ([cookies](https://better-auth.com/docs/concepts/cookies)): signed with `secret` / `BETTER_AUTH_SECRET`; default prefix `better-auth`; `httpOnly` + `secure` in production. Tune via `advanced.cookiePrefix`, `advanced.cookies`, `advanced.useSecureCookies`, `advanced.defaultCookieAttributes`. Set `baseURL` or `BETTER_AUTH_URL` ([options](https://better-auth.com/docs/reference/options#baseurl)).

Constraint fit: keep sign-up/sign-in/OTP on the catch-all via `authClient`; use `createServerFn` for `getSession` / `hasPermission` / app mutations. Still add `tanstackStartCookies()` last so any future `auth.api` cookie writes work.

---

## 7. Email/password + 6-digit verification codes + custom transport

Better Auth has **no** `EmailTransport` type. Every email is an app callback.

### Password auth

`emailAndPassword: { enabled: true }` ([email & password](https://better-auth.com/docs/authentication/email-password)). Passwords live on `account` with `providerId: "credential"`, hashed with scrypt by default.

### Codes, not magic links

Built-in `emailVerification.sendVerificationEmail` is **link + token** ([email](https://better-auth.com/docs/concepts/email)). For 6-digit codes use the **email OTP plugin** ([email OTP](https://better-auth.com/docs/plugins/email-otp)):

```ts
emailOTP({
  otpLength: 6, // default
  expiresIn: 300,
  overrideDefaultEmailVerification: true, // OTP instead of verification URL
  sendVerificationOnSignUp: true,
  async sendVerificationOTP({ email, otp, type }) {
    void transport.send({ to: email, /* render by type */ });
  },
})
```

`type` is `"sign-in" | "email-verification" | "forget-password" | "change-email"`. Client: `emailOTPClient()`; verify with `authClient.emailOtp.verifyEmail({ email, otp })`.

`overrideDefaultEmailVerification: true` replaces the default verification **link** whenever verification is triggered ([docs](https://better-auth.com/docs/plugins/email-otp#override-default-email-verification)). Pair with `emailAndPassword.requireEmailVerification: true` so unverified users cannot sign in ([email & password](https://better-auth.com/docs/authentication/email-password#require-email-verification)).

OTP rows use the shared **verification** table (or `secondaryStorage`). `storeOTP` defaults to `"plain"`; prefer `"hashed"` at rest. No extra Drizzle tables for email OTP.

Password reset: use `emailOtp.requestPasswordReset` / `resetPassword` (OTP), not `sendResetPassword` links.

Invitation email is still a **link with invitation id**, not an OTP. Route it through the same `EmailTransport`.

Do not `await` the send inside Better Auth callbacks (timing); on serverless use `advanced.backgroundTasks.handler` / `waitUntil` ([email OTP options](https://better-auth.com/docs/plugins/email-otp#options)).

---

## Recommended shape for bitig-flow

1. **Auth instance** (`better-auth@1.6.28`): `drizzleAdapter(db, { provider: "pg", schema: authTables })`, `advanced.database.generateId: false`, `emailAndPassword.enabled`, `requireEmailVerification: true`, plugins in order: `organization({ ac, roles: { owner, admin, member } })`, `emailOTP({ overrideDefaultEmailVerification: true, otpLength: 6, sendVerificationOTP })`, **`tanstackStartCookies()` last**.
2. **Schema (hand-owned):** core four tables + `organization`, `member`, `invitation` + `session.activeOrganizationId`. All of those PKs/FKs: `uuid(…).default(sql\`uuidv7()\`)` (or `.default(sql\`uuidv7()\`)` on PKs only, FKs without default). Do **not** enable teams or dynamic AC unless a later ticket asks. Run CLI generate to a **temp** file only; merge by hand.
3. **IDs:** Better Auth never sends `id` on create. Database `DEFAULT uuidv7()` is the source of truth for auth tables. Client uuidv7 applies to **app** tables via your own inserts, not via `auth.api`.
4. **Invites:** implement `sendInvitationEmail` with `EmailTransport`; require verified email (automatic with `generateId: false`). Accept after login via invitation id in the URL.
5. **AC:** `createAccessControl` + `defaultStatements` merge; redefine `owner`/`admin`/`member` with `ownerAc.statements` spread plus app resources. Check with `auth.api.hasPermission` inside `createServerFn`. Do not trust `checkRolePermission` alone.
6. **HTTP:** `src/routes/api/auth/$.ts` catch-all; `getSession` / `ensureSession` as `createServerFn` using `getRequestHeaders()`; route `beforeLoad` guards.
7. **Email:** one `EmailTransport` used from `sendVerificationOTP` and `sendInvitationEmail` (and later password-reset OTP). Resend in prod, nodemailer→mailpit in dev — Better Auth does not know about either.

---

## Unconfirmed

- Whether the deployed Postgres is **18+** with builtin `uuidv7()`, or needs `pg_uuidv7` / a wrapper function. Drizzle has no `defaultUUIDv7()` in 1.0.0-rc.4.
- Whether `db._.fullSchema` is populated in Drizzle 1.0 rc so `schema:` can be omitted; adapter still documents passing `schema` explicitly.
- End-to-end: omitting `id` on `uuid` columns with `DEFAULT uuidv7()` + Drizzle `returning()` under 1.0 rc.4 (adapter path is sound; not executed in this ticket).
- Whether `generateId: false` + uuidv7 invitation ids are “predictable enough” that Better Auth’s auto `requireEmailVerificationOnInvitation` is always on — docs list `false` as triggering it; uuidv7 guessability vs nanoid is a product judgment.
- Exact `getRequestHeaders` vs `getRequest().headers` stability across `@tanstack/react-start` minors; 1.168.45 re-exports `@tanstack/react-start-server`. Docs use `getRequestHeaders`.
- `experimental.joins: true` with a hand-written relations graph — recommended later for `/get-session` and `/get-full-organization`, not required to wire auth.
- Separate npm package `@better-auth/drizzle-adapter` vs `better-auth/adapters/drizzle` in versions **after** 1.6.28 (docs already prefer the scoped package).
- `customSyntheticUser` field order if enumeration protection is on and extra user columns exist — only needed if plugins add user fields ([docs](https://better-auth.com/docs/authentication/email-password#plugins-that-add-user-fields)).
