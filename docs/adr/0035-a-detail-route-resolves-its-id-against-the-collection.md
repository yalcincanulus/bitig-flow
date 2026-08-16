# A detail route resolves its id against the collection

`/dashboard/documents/$documentId`, `/dashboard/vaults/$vaultId`, and `/dashboard/links/$linkId` look their id up in the warm collection and `throw notFound()` when it is absent. They do not fetch it from the server.

This makes ADR-0012 — cross-organization is not-found, wrong-role is forbidden — true by construction rather than by enforcement. A collection is built per Organization and only ever holds the active Organization's rows, so an id belonging to another Organization is simply not there, and the not-found is a consequence of the data shape instead of a check someone has to remember to write. It also costs no round-trip.

`notFoundMode: 'fuzzy'`, so the not-found renders inside the Dashboard chrome rather than replacing the page.

## Router context

The root context stays `{ queryClient }`. `_authenticated.beforeLoad` *returns* `{ session, organization, role }`, which the router merges into context for that subtree with full inference — so only routes below the guard can see them, and the type proves it. Collections are not in context; loaders resolve them from the factory.

Putting session and Organization in the root context was rejected because it makes them nullable on every surface including the Viewer, which then needs a non-null assertion at every Dashboard use site — turning a fact the type system knows into one the author has to assert.

## Switching organizations

The switcher calls better-auth `setActive` and then `router.invalidate()`. `_authenticated`'s loader re-runs, `/dashboard`'s loader rebuilds collections under the new `orgId`, and because those are separate instances the previous Organization's rows never bleed through. The path is preserved — `/dashboard/documents` stays put.

Detail routes are the exception: after the switch their id is cross-organization, which is not-found, so staying would render a 404 immediately after a successful action. They redirect to their list instead. That is the same rule read honestly, not an exception to it.

## Creation

New Document, new Vault, new Link, and upload are dialogs with no route of their own. The one route is the markdown editor, `/dashboard/documents/$documentId/edit`, so its autosave state has a route lifecycle to hang from — and because the client mints the canonical uuidv7, "write a new document" is an optimistic insert followed by a navigation to a URL that is valid before any server round-trip completes.
