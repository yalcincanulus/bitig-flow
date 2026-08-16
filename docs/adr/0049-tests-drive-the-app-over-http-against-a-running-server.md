# Tests drive the app over HTTP against a running server

**The test process and the application are two processes, and the only thing that passes between them is an HTTP request.** A Vitest `globalSetup` spawns the Vite dev server on a test port, the tests `fetch` it with a cookie jar, and teardown kills it. Nothing imports a route, a server function, or a middleware in order to call it.

The bug this application will actually have is not a wrong `WHERE` clause. It is a server function wired to the wrong middleware tier, a visit cookie whose `Path=/v/<slug>` does not cover the endpoint that reads it, or a `gate_version` check placed on a path the request does not take. Every one of those is a *wiring* defect, invisible to a test that imports the function and calls it directly — because importing it is precisely the step that skips the wiring.

Cookies decide this on their own. The gate, the visit, and the visitor id are all cookies, with paths, expiries, and `HttpOnly` flags that are part of the design (ADR-0032, ADR-0040). A test that fabricates a request context can assert what the code *sets*; only a test over the wire can assert what a browser would *send back*.

**Calling server functions in-process was rejected because it means fabricating a context the framework owns.** TanStack Start carries request context through `AsyncLocalStorage`; a hand-built substitute is a second implementation of the framework's contract, maintained by us, drifting from the real one silently and asymmetrically — it will pass long after the real path breaks.

**Testing below the middleware — calling repositories directly with a hand-minted `OrganizationId` — was rejected for a sharper reason.** ADR-0011's guarantee is that only `orgMiddleware` can mint that brand. A test that mints one itself has assumed the guarantee it was supposed to check.

The dev server is used rather than a production build, because a `vite build` in front of every run is where a test suite stops being run. The cost is named rather than hidden: this suite cannot catch a divergence between the dev server and the built one — cookie `Secure` flags and asset serving being the likely places — and it is not evidence that the production build works.
