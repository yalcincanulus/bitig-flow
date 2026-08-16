# Org-scoped queries go through a repository that demands a branded id

**"Every query is scoped to the active organization" is enforced by the type system and a lint rule, not by review vigilance.** Three directories divide the server, and the division is itself the documentation:

- `src/server/db/` — the Drizzle client and schema. The only place the client is constructed.
- `src/server/repositories/` — organization-scoped reads and writes, one file per aggregate. Every exported function takes `orgId: OrganizationId` as its first parameter.
- `src/server/viewer/` — the **Slug**-scoped public path. Functions here take a slug or a link id and never an `orgId`.

An oxlint `no-restricted-imports` rule forbids importing `src/server/db` from anywhere but those two directories. A future agent cannot write an unscoped query without first deleting a lint rule, and a reviewer's entire audit reduces to one question: is this file in `viewer/`, and should it be?

**`OrganizationId` is a zod branded type, minted in exactly one place.** `src/server/ids.ts` exports `z.uuid().brand<"OrganizationId">()` alongside the other entity ids, and `orgMiddleware` parsing `session.activeOrganizationId` is the only sanctioned way to produce one. A bare `string` — a URL parameter, a form field, a value from the request body — will not typecheck into a repository call. One declaration buys both "this is a uuid and not junk" at runtime and "this came from a middleware and not the client" at compile time.

**The viewer path gets its own directory precisely because it has no organization.** A visitor arrives with a slug, no session, and no tenant in scope, so the scoping invariant genuinely does not apply there. Putting those queries in a separate directory makes the absence of an `orgId` a property of *where the file lives* rather than something a reviewer has to notice is missing.

**Postgres row-level security was considered and rejected.** It is the stronger guarantee, but it duplicates the tenancy model in SQL, requires a transaction per request to carry `SET LOCAL`, and — decisively — would be fighting the viewer path, which is half the application and legitimately unscoped.
