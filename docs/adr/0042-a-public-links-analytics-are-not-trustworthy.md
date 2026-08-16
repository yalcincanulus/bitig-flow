# A public Link's analytics are not trustworthy

A Link with no Requirements has no Gate to rate limit, and ADR-0004 creates its Visit on first load while ADR-0031 forbids caching or preloading the loader that writes `document_opened`. A bot in a loop on a public `/v/<slug>` therefore mints a Visit row and an Event per request — polluting the very stream this product exists to produce, with no secret at stake and no victim, just garbage data.

The primary fix is not a limiter but the Visit cookie: a request arriving with a valid Visit cookie for that Link does not mint a second Visit. That is already the correct behaviour for a human refreshing the page, and it incidentally caps a cookie-less client at one Visit per request-without-cookie. Behind it sits one coarse backstop — 30 Visit creations per hour per IP across all Links (ADR-0037).

Neither stops a bot that cycles cookies across many addresses, and we do not pretend otherwise. The honest statement, which belongs in the product's own language rather than only in this file, is that a public Link has no access control and therefore no trustworthy analytics. An owner who wants numbers they can believe adds a Requirement.
