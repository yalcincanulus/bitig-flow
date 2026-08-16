# Cross-org is not found, and wrong role is forbidden

**A failed authorization reports one of three outcomes, split on what the caller is already entitled to know.**

- **No session, or no active organization → unauthorized.** The middleware throws `redirect({ to: "/sign-in" })`.
- **A row belonging to another organization → not found.** The caller has no business learning that the row exists, and existence is itself a disclosure.
- **In the organization but holding the wrong role → forbidden.** They already know the organization's contents exist; a not-found here would be a confusing lie about something they can see referenced elsewhere in the UI.

**Cross-org falls out of the repository layer for free.** `findDocument(orgId, documentId)` simply returns nothing for another organization's row, so not-found is what naturally happens — there is no branch to write and therefore none to forget. Only the in-organization role failure needs an explicit throw.

**The three outcomes ride on framework primitives rather than a parallel error channel.** Unauthorized is a thrown `redirect()`, which TanStack Start handles from both loaders and server functions. Not-found is `notFound()`, caught by `notFoundComponent`. Forbidden is the single custom case — a `ForbiddenError` surfaced by an `errorComponent` — because it is the only one of the three with no framework meaning. The client distinguishes them by a typed error shape, never by matching on a message string.

**Permission checks are declarative and therefore auditable.** Server functions compose a `permission({ document: ["create"] })` middleware rather than calling a check inside the handler body. `role.authorize()` is a pure synchronous function over an in-memory statement object, so the check costs nothing once the role is resolved and there is no efficiency argument for burying it. The reason to make it declarative is that an auditor — human or agent — can list every `createServerFn` and see which ones carry no permission middleware. A check inside a handler is invisible to that sweep.
