# The preview is the detail route, and the render module takes one parameter

**The markdown editor has no preview pane.** `/dashboard/documents/$documentId` — which has to become the owner's view of a document regardless — is the preview, and it renders through the same `renderHtml()` the Viewer uses.

The tension this resolves is narrower than it first appears. A second renderer in the editor is a second place where markdown becomes HTML, and what it would drift on is sanitization, which is a security policy rather than a formatting choice. But `@tanstack/markdown` with `allowHtml: false` is not a sanitizer we would be reimplementing: the properties come from the parser options, `sanitizeUrl`, the remote-image block, and `img-src 'self'` in CSP. A client preview importing the *same* module is the same policy running in a second place. The real risk is a later author passing different options at one call site — which is why ADR-0058 makes the options non-parameters, and why the enforceable form of ADR-0007's rule changes here:

> Markdown becomes HTML in exactly one **module**, whose only parameter is `resolveImage`. The parser options, `sanitizeUrl`, and the remote-image block are internal and are never arguments.

That is stronger than "one call site", and it is what makes a split-pane preview a safe later upgrade rather than a reopening of ADR-0007.

## It is a server function call, not SSR

ADR-0030 puts `ssr: false` on `/dashboard`, so the detail route's loader runs in the browser only. "Server-rendered preview" would be a misreading: the loader calls a `renderMarkdown` server function and receives HTML.

**The result caches under a TanStack Query key holding the document id and its `updatedAt`.** Invalidation is then automatic and needs no thought — an autosave moves `updatedAt` (ADR-0056 makes the server its only writer), so the next preview misses the cache and renders again. An uncached render on every visit was rejected as a round-trip for content that provably has not changed.

**Rendering per keystroke against a server function is ruled out on the record.** It is a server CPU pedal wired to a text field, and it does not even solve the drift problem — it moves the second call site to the server.

**Storing rendered HTML in a column is rejected, and this is the important half.** A stored render freezes the renderer's output at the moment of the save, so a later correction to the sanitization policy would not reach documents already written, turning a security fix into a data migration. ADR-0007 wants one render path; a stored copy of its output with a different lifetime is a second one wearing a column's clothes.

## What this leaves open

A split-pane live preview in the editor remains a legitimate future change, on one condition: it imports `renderHtml()` and passes only `resolveImage`. If it ever needs a second parameter, that is the signal that the module's boundary is wrong, and the answer is to fix the boundary rather than widen the signature.
