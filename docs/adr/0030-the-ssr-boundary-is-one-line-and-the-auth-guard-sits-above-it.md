# The SSR boundary is one line and the auth guard sits above it

`ssr: false` is declared exactly once, on the `/dashboard` layout route. Every route beneath it inherits the setting — `router-core` resolves a parent's `false` to `false` for the whole subtree regardless of what a child declares — so no leaf route repeats it and no leaf route can accidentally opt back in.

`'data-only'` is never used. It runs the loader on the server while skipping the component, which is precisely the thing that hangs: TanStack DB collections cannot sync outside a browser, so a server-side `collection.preload()` is the documented failure. Only `false` skips the loader.

`defaultSsr: false` is likewise rejected. The Viewer is the one surface where server rendering genuinely matters, and a global default would take it away to solve a Dashboard problem.

## Why the guard is a separate layer

`ssr: false` skips `beforeLoad` on the server too, not just the loader. A guard living on the same route as the boundary would therefore never run server-side: a logged-out visitor would receive HTML, hydrate, and only then be bounced to `/login`.

So the authenticated area is two layers, not one:

- **`_authenticated`** — pathless, server-rendered. Its `beforeLoad` resolves session → active organization → role and redirects to `/login` when there is no session. Its loader fetches the user's organization list. Its component is the Dashboard chrome: sidebar, organization switcher, user menu.
- **`/dashboard`** — nested inside it, carrying `ssr: false` and everything backed by collections.

Three consequences follow, and they are the reason for the split. The redirect for a logged-out visitor happens on the server with no flash of application shell. The chrome renders server-side with the real user and organization name rather than a skeleton. And the un-rendered region shrinks from the entire page to the content pane alone.

That pane is filled by a single `pendingComponent` on the `/dashboard` layout — a generic content skeleton, server-rendered into the hole, whose only job is to hold the layout still. In this path the pending component is `ClientOnly`'s fallback and renders immediately; `pendingMs` governs client navigations only. Per-leaf skeletons were refused as five copies of a shape visible for a few hundred milliseconds behind a login, and promoting one leaf later is a local change.

The price is that `_authenticated.beforeLoad` runs on every client navigation as well as on the server. That is the session check we want anyway.
