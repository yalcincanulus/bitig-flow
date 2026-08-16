# Gated bytes are proxied, uncacheable, and unframeable

> **Partly superseded by [ADR-0018](0018-gated-bytes-are-proxied-by-our-origin-and-presigned-get-is-retired.md).** PDFs are proxied too, and presigned GET no longer exists; the final paragraph's caveat about garage owning the PDF response headers no longer applies. Everything else here stands.

**Image bytes are proxied through our origin.** A server route resolves the presigned GET server-side and streams the body, rather than handing the browser a URL on the garage origin. This keeps `img-src 'self'` literally true, so the CSP and the markdown renderer's no-remote-images rule state the same thing rather than approximately the same thing, and it keeps the storage endpoint out of public HTML. PDFs stay on the presigned-redirect path, where the browser navigates rather than embeds. The cost is bytes through the app server, which is acceptable at this app's traffic.

**The viewer route's CSP** is `default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`.

`'unsafe-inline'` for scripts is a **known, deliberate weakening**: TanStack Start's SSR emits inline scripts for hydration and serialized loader data, and threading per-request nonces through them is a real fight for a control that is defence-in-depth here — no user-authored HTML ever reaches the document, because raw HTML is off. The directives doing genuine work are `frame-ancestors 'none'`, which stops a third party from iframing a gated document into their own page, and `object-src 'none'`.

**Gated responses carry `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`,** with `Content-Disposition: attachment` only when the visitor pressed Download. `no-store` is load-bearing rather than hygienic: without it a gated document survives in a shared machine's disk cache long after its link is revoked, defeating link-level revocation. Note the boundary — a PDF fetched through the presigned redirect is served by garage, so those response headers are garage's to set.
