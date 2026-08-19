# An embedded image is a reference, and reachability is one hop

An image inside a markdown document was, until this decision, unservable behind a gate — and nothing in the design said so. ADR-0007 requires that markdown images resolve to our own storage. ADR-0018 has the visitor byte route check "the document is reachable from that link's target". An image embedded in document A is its own document B, which is neither the link's target nor a member of the target vault, so the byte route refuses it and the visitor sees a broken image. The owner does not: the dashboard byte route has no reachability check at all, so it renders perfectly for the person who wrote it. **A failure only the stranger can see is the worst shape available**, and it is the reason this ADR exists before any image feature ships.

## The markdown source stores a reference, not a URL

The same markdown source is rendered on two surfaces that serve bytes from two different routes with two different credentials — `/api/documents/$documentId/bytes` under the organization session, `/v/$slug/f/$documentId` under the visit cookie (ADR-0018). One source must produce both, so **neither URL may appear in the source**. Storing the dashboard URL would have a visitor's browser request an authenticated dashboard endpoint with no session: a broken image, and strangers probing a route they should never touch.

**The stored form is a relative path, `doc/<documentId>`.** It has no scheme, so ADR-0007's `sanitizeUrl` leaves it intact. A custom scheme like `doc:<uuid>` was the obvious idea and is dead on arrival — `sanitizeUrl` reduces every scheme outside `http:`, `https:`, `mailto:`, and `tel:` to an empty string, at parse time, by design. A root-relative `/d/<uuid>` fails differently: ADR-0032 scopes the visit cookie to `Path=/v/<slug>`, so a path outside that neighbourhood carries no credential and the Viewer cannot authorize it.

**`renderHtml()` therefore takes exactly one parameter, `resolveImage`,** and each surface passes its own. This is a refinement of ADR-0007's one-render-path rule, and the boundary must be stated in both directions: the resolver for an image is a parameter, and the parser options, `sanitizeUrl`, and the remote-image block are *not*. They stay internal to the module and are never arguments. "One parameter" invites a second one, so the rule is written as a prohibition rather than a count.

**The Viewer's `resolveImage` checks the source Document's Reference rows, not Reachability.** It answers "is this a reference this Document actually holds", which covers a remote URL, a malformed reference, and a target the cascade has deleted, all three rendering as alt text. The byte route remains the sole enforcement point for Reachability. The two checks agree today and answer different questions; only one of them promises alt text.

**An image that does not resolve renders as its alt text, in plain form.** That covers three cases with one behavior: a remote URL (which ADR-0007 blocks), a malformed reference, and a reference whose document has been deleted — the last arriving for free through the cascade below. A broken-image icon was rejected because it reads as our failure rather than as our policy.

## The reference graph

`updateDocument` extracts the referenced document ids at save time and writes them to a `document_reference` table — `source_document_id`, `target_document_id`, both cascading — which the byte route reads.

Parsing at serve time was rejected on two grounds. It loads and re-parses a 256 KB body for every image on the page, and it gives the byte route a second markdown parser, which is exactly the drift ADR-0059 refuses. Storing nothing and treating every document in the organization as reachable through any of its links was rejected outright: one public link would then serve every byte the organization holds, which defeats the gate entirely.

**The graph is one hop and is not transitive.** An image cannot reference anything, so there is no second hop to follow, and refusing to follow one keeps a stale edge from ever widening access beyond a single document.

## The reachability rule, in full

> A document is reachable from a link when it is the link's target, or a member of the target vault, or referenced by one of those documents.

The vault clause is not a special case, it is the rule read honestly. A vault link targets vault V; V has no references of its own; the documents *in* V do. Resolving instead against "whichever document the visitor currently has open" was rejected — the byte route holds no such state, and a vault index page can show an image before any document is opened.

## An embedded fetch is not a view

Once image B is servable through a link targeting markdown document A, B is a document being fetched inside a visit, and ADR-0023's vocabulary is document-scoped. It does **not** write `document_opened`.

ADR-0026 says an event is written by whoever witnesses it, and nothing witnesses an inline `<img>` as a document somebody read. The visitor read A. Writing the event would double the open count of exactly the documents people care about most, and produce dwell for an image nobody looked at separately, which makes the numbers uninterpretable rather than merely inflated.

Reachability by reference is a **byte permission and not a view**. The two are now different things and the ADR says so in one sentence, because they were the same thing until this decision.

## No paste-to-upload in this slice

Images are inserted by a picker over documents the organization already holds — `kind = 'image'`, `status = 'ready'`, a live query over the warm collection. Pasting an image from the clipboard and uploading it is deliberately deferred.

The affordance is sugar on top of a rule that did not exist; shipping it first ships broken images behind gates. When it arrives it will create an ordinary `document` row through the two-phase upload of ADR-0019, appearing in the grid alongside everything else. It will **not** introduce an "attachment" concept — a row carrying both `kind` and an `is_attachment` flag is two discriminators on the one-document-table of ADR-0015, bought to change a filter on a grid.

Pasting a remote image *URL* stays visibly refused rather than silently ignored: the reference does not resolve, so it renders as its alt text, and the editor says once that images must come from this organization.
