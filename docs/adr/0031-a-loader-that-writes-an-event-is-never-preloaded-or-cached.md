# A loader that writes an event is never preloaded or cached

ADR-0026 puts `document_opened` in the Viewer's route loader, because the server witnesses the open and the client cannot be trusted to narrate it. That makes those loaders effectful, and an effectful loader breaks both of the router's caching behaviours in opposite directions:

- **Preloading inflates the count.** `defaultPreload: 'intent'` runs a loader on hover. Hovering a Vault link's list of ten documents would fabricate ten opens — and ADR-0023 appends `document_opened` once per open with no per-visit deduplication, so nothing downstream would absorb the error.
- **Caching deflates it.** A cached loader result silently swallows the second open of the same document within one Visit, which is exactly the revisit the un-deduplicated event exists to record.

So the rule is one rule with two halves, and both must be applied together:

> A route whose loader writes an analytics Event sets `preload: false` and `staleTime: 0`.

Currently binding on `/v/$slug` and `/v/$slug/$documentId`. `defaultPreload: 'intent'` stays on globally and `defaultPreloadStaleTime` rises to the framework default, because the Dashboard preloads freely and correctly — nothing there writes.

The alternative was moving the write out of the loader into a component effect, which would make it client-reported and reintroduce exactly the trust ADR-0026 refuses. Turning preloading off globally was rejected as paying for the Viewer's constraint on every Dashboard navigation.
