# Raw HTML in markdown is off permanently

User-authored markdown is rendered to anonymous visitors on a public URL, so it is a stored-XSS surface. `@tanstack/markdown` is used with `allowHtml` left at its default of `false` — and that is a **policy, not a default we happen to have inherited**. Enabling it is a vulnerability, not a feature toggle, and the render site carries a comment saying so.

The library's own guidance is explicit that `allowHtml: true` is not a sanitization step — it emits raw nodes, which React renders via `dangerouslySetInnerHTML`. The alternative to this decision is not "raw HTML plus DOMPurify"; it is owning a sanitizer allowlist forever and turning every future markdown feature request into a security review. The real loss is `<details>`, `<kbd>`, and embedded iframes; anything genuinely needed should arrive as a markdown *extension*, never as an HTML hole.

Supporting rules, all decided together:

- **One render path.** Markdown becomes HTML in exactly one place — `renderHtml()` server-side in the viewer's loader — so there is a single site to audit. Markdown source is capped at 1 MB.
  - *Amended by ADR-0059:* the rule is one **module**, not one call site, and its only parameter is `resolveImage`. The parser options, `sanitizeUrl`, and the remote-image block are internal and are never arguments. The Dashboard's detail route calls the same module through a `renderMarkdown` server function.
  - *Amended by ADR-0056:* the cap is **256 KB**, not 1 MB. Markdown `content` syncs into the Dashboard's `documents` collection, so the payload of a list view is the tighter of the two reasons for a cap.
- **Links** get `rel="noopener noreferrer" target="_blank"`. The library's `sanitizeUrl` already reduces any scheme outside `http:`, `https:`, `mailto:`, and `tel:` to an empty string, so `javascript:` URLs are dead at parse time.
- **Remote images are blocked.** Markdown images must resolve to our own storage. A third-party image URL in a gated document is a beacon that tells someone else's server when the document was opened and from which IP, which defeats the point of the gate. Enforced twice: in the renderer, and by `img-src 'self'` in CSP.
  - *Extended by ADR-0058:* "resolve to our own storage" means the source stores `doc/<documentId>` and `resolveImage` turns it into that surface's byte route. Anything that does not resolve — a remote URL, a malformed reference, a deleted document — renders as its **alt text in plain form**, never as a broken-image icon.
- `@tanstack/highlight` escapes both code text and the language name, so syntax highlighting adds no injection surface.
