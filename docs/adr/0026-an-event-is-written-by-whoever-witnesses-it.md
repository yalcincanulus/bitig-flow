# An event is written by whoever witnesses it

Three event types, three writers, chosen by who actually observes the thing:

- **`download`** — written by the gated byte route, when it serves with download intent.
- **`document_opened`** — written by the viewer's route loader for that document.
- **`page_dwell`** — written by the beacon route, because dwell is the only one of the three the server cannot see.

ADR-0018 retired presigned GET, so every byte a visitor receives passes through our origin. A download *is* a request we serve and an open *is* a loader we run; asking the browser to report either means trusting a client to narrate something we watched happen, and accepting that a client closed mid-fetch simply never reports it.

Recording `download` at the byte route also means the count can never exceed what policy permitted, because the same route enforces `allow_download`. The event and the permission are checked in one place, so they cannot drift.

The beacon body therefore shrinks to dwell plus a `seq` and a per-page-load `nonce`. ADR-0027 holds the document-keyed shape and the rule that nothing in the body is a credential. Reachability of each `documentId` from the link's target is then its only validation.

The cost, stated plainly: `document_opened` fires for a bot or a prefetch that loads the route and reads nothing. That is why ADR-0023 keeps it distinct from dwell — "opened, dwell 0" is a meaningful visible row, not a defect.
