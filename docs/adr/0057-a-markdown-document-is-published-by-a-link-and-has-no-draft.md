# A markdown document is published by a link, and has no draft

**There is no draft state, and that is now a decision rather than an accident.** ADR-0015 gave markdown documents `status = 'ready'` on creation because `status` describes *bytes* and markdown has none — so markdown fell into the terminal state by default, and publication was never considered. Read honestly, today's behavior is the right one, and it needed to be chosen rather than inherited.

**The Link is the act of publication.** A document nothing points at is unreachable by anyone outside the organization; ADR-0035 reaches the editor straight from the create dialog, before any link exists. Writing in private is therefore the default, and it costs nothing.

A draft flag was rejected as a second, weaker gate standing in front of the real one. Its failure mode is worse than the thing it prevents: forgetting to flip it means you shared a link that shows nothing, to someone you already told to expect a document.

**Reusing `status` for it would have been actively harmful.** `pending` would then mean "bytes not yet proven" for a PDF and "not yet published" for markdown — one column with two meanings selected by `kind` — and it would put a predicate in the Viewer's loader. ADR-0006 rejected `deleted_at` and ADR-0015 defended `status` on precisely that ground: a lifecycle marker describes rows, a filter hides them, and one forgotten filter is a leak. A separate `published_at` column avoids the overloading but not the second-gate problem, and was rejected with the flag.

## ADR-0020 is narrowed to uploaded bytes

ADR-0020 says a `ready` document's bytes never change, and gives as its reason that "an existing link's analytics stream describes bytes that would no longer exist". That reason applies word for word to editing a shared markdown document — and markdown has always been freely mutable, because content is a column and columns accept an `UPDATE`. Two immutability rules were in the repository and one of them was false.

**Markdown content is mutable, including under live links, and ADR-0020 covers uploaded bytes only.** The difference is real and worth stating: an uploaded PDF is an artifact that arrived finished from somewhere else, while markdown is text its author wrote in this app and reasonably expects to keep writing. Freezing markdown on first share would make "share it" a one-way door on the one kind of document people most expect to correct.

The analytics cost is accepted and is smaller than it looks. ADR-0023's vocabulary is three events with no content-version dimension, so there is no stream that *can* describe a particular revision; freezing would buy an integrity nobody reads. ADR-0007's `staleTime: 0` and `no-store` mean an edit reaches a visitor mid-read, which is a consequence, not a bug — the alternative is serving a version the author has already corrected.

This narrowing is written into ADR-0020 itself, not left here to be discovered.

## Deliberately unanswered

Nothing warns an author that the document they are editing is behind a live link. That warning is a product feature and would need a definition of "live" that survives expiry and revocation. It is not a safety control and its absence is not a leak: every person who can edit the document can already read every link in the organization.
