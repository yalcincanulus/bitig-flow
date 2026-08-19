# The gate is one route and the server decides the step

`/v/$slug` is a single route that renders either the Gate or the target. There is no separate gate URL and no sub-route per Requirement.

The loader reads the visit cookie and returns the Requirements still unsatisfied. No valid Visit means the Gate renders in place; a valid Visit means the target renders. Each step submits through a `createServerFn`, after which `router.invalidate()` re-runs the loader and the next step appears. There is no client-side step machine.

Requirements are composable (ADR-0002), so the Gate is inherently multi-step — password, then email, then code. Giving each step its own URL would put the Visitor's progress somewhere they can edit, which means the server has to re-derive the true state on every submission regardless; the URL would then be decoration at best and an attempted bypass at worst. Deriving the step from the loader makes the server the only thing that ever decides what comes next, and back-button and refresh behaviour fall out of it for free.

It also keeps the shareable URL exactly the Slug. The `/v` subtree takes no search parameters at all.

A Slug that is unknown, expired, revoked, or whose target has been deleted renders one neutral "this link is no longer available" page with a 404. The four are not distinguished. ADR-0024 already refuses to *record* anything before the Gate, and the same reasoning governs what we *tell* a stranger: separating "expired" from "never existed" turns the URL space into an oracle for probing which Slugs are real. The cost is a less helpful message for a legitimate recipient, whose remedy — ask the sender — is identical either way.

The whole `/v` subtree is server-rendered, Gate included, and carries `<meta name="robots" content="noindex, nofollow">` with no OpenGraph tags. A Link's premise is that access is gated and counted; a rich preview card renders content for a crawler, and for everyone in a Slack channel, without passing the Gate.

What the steps *look like* is not decided here.

## What the loader returns past the gate

A discriminated union on `status`: `gate`, `rate_limited`, or `content`. The `reveal` arm is retired — it was a placeholder for "past the Gate, here is a title" and every path that produced it now produces `content`.

The `content` arm is itself a discriminated union on `kind`:

- **markdown** — the loader runs the single server-side sanitized render path (ADR-0007) and returns HTML. Fully server-rendered, no client fetch for content.
- **pdf** — metadata only (`pageCount`, `fileName`); the client buffers the byte route into `getDocument({ data })`. Until the pdf.js island lands, the pane renders a minimal shell (title and page count) behind the dynamic import that island will occupy.
- **image** — metadata only (`fileName`). This slice's shell is the title; the `<img>` that fetches the byte route as a subresource lands with the image arm.
- **vault_index** — the Vault's title and a member list of `{ documentId, title, kind, status }`. Opening the index writes no `document_opened`. Each member opens at `/v/$slug/$documentId`.

Because the branch is already in the loader, `pdfjs-dist` sits behind a dynamic import inside the PDF branch: opening a markdown Link downloads no PDF engine.

A Link targeting a Document renders it at `/v/$slug` itself. A Link targeting a Vault renders the Vault index there (`vault_index`), and each member opens at `/v/$slug/$documentId`. Document loaders write `document_opened`. The Vault index does not: it names no Document, and nothing in the Event vocabulary uses `visit_event.document_id`'s nullability (ADR-0023). Document loaders are subject to ADR-0031.
