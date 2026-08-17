# Markdown is saved by autosave, and the editor owns its text

The markdown editor at `/dashboard/documents/$documentId/edit` has no Save button. It writes through `createPacedMutations` with `debounceStrategy({ wait: 800 })`, whose merge semantics are exactly the ones autosave wants: rapid calls join the active transaction and only the last version reaches the server. The unit of a write is the document's *authored fields* — `title` and `content` together — so the title is editable in the editor rather than through a separate rename surface, and there is one server function and one conflict story instead of two.

**The editor owns its text while it is mounted.** The textarea reads the collection exactly once, through `resolveRow` at the loader; after that the text lives in React state and the collection is a write target only. This is the single most important rule here and it exists because of a documented failure mode: a failed `mutationFn` rolls the transaction back, and a rollback of the optimistic state would pull a paragraph off the screen that the author believed was saved. Rollback is now invisible — the text on screen is not the thing being rolled back.

**Nothing retries the paced autosave.** `Transaction.commit()` calls `mutationFn` once inside a `try` and the `catch` calls `rollback()`; there is no retry loop. The `retry`/`retryDelay` options a Query Collection accepts are passed to the `QueryObserver`, which runs the *read*. So retries are not free here, but they are also mostly unnecessary: a person who keeps typing produces a new transaction 800 ms later carrying the newest text over an idempotent endpoint, which is a retry. A retry *inside* the paced autosave was rejected because it races the next debounce — two in-flight requests carrying different versions of one field, where the later one can land first. Only the uncovered case is handled explicitly: the final write of a session, and the flush below, retry twice, at 2 s and 6 s.

**The write does not refetch the collection.** ADR-0034 keeps `content` in the `documents` collection, and a Query Collection refetches the whole collection after a mutation handler and awaits it — which would re-download every markdown body in the organization on every keystroke pause. The handler instead writes the row the server returned using the direct-write utilities and returns `{ refetch: false }`. This is the pattern for every write to `documents`, not a special case for the editor.

**Markdown source is capped at 256 KB**, down from ADR-0007's 1 MB. That cap now has two independent reasons — the blast radius of a rendering bug, and the fact that every body syncs into a list view — and the second one is the tighter. It is enforced in the editor and in the server function's Zod validator, and deliberately *not* as a `CHECK` constraint: ADR-0017 puts the model in the database and the policy in the application, and a size limit is a policy. The character counter appears only past 80% of the cap. At the limit the editor refuses further input and says so; it never truncates and never fails the save silently. `title` is capped at 200 characters, and an empty title becomes `Untitled` at the server, not at the client.

## The row may not exist yet

ADR-0035 reaches this route by an optimistic insert followed by a navigation, so the editor mounts on a document the server has never seen. The insert is one transaction and the first autosave is another, and nothing orders them: an `UPDATE` can arrive before its `INSERT`.

Both ends are closed. The editor holds the insert's `tx.isPersisted.promise` and does not start the paced mutations until it resolves, so the race is not the normal path. And `updateDocument` is an upsert, so it is idempotent and a retry or a reordering costs nothing. Awaiting the server insert before navigating was rejected — it deletes the reason ADR-0035 gave for a client-minted uuidv7.

The upsert takes `organizationId` from `orgMiddleware` and never from the request body. An upsert that trusts a body field is a way to write a row into another organization.

## Leaving the route

Three exits, one mechanism. `createPacedMutations` returns a plain function and exposes no flush and no cancel, so the flush is a *second write path* over the same idempotent `updateDocument` — reading the text from the collection, which already holds it because `onMutate` runs synchronously on every call.

- **Unmount** — flush once, do not await. Blocking navigation with `useBlocker` was rejected: making someone wait on a network request to leave a page is the behavior people learn to distrust.
- **Organization switch** — the same flush, then ADR-0035's redirect from the detail route to its list.
- **Tab close** — `beforeunload`, and only when unsaved text exists. No save is attempted, because none is reliable there.

**The accepted loss is up to 800 ms of typing on a tab close inside the debounce window.** That is the price of autosave without a Save button and it is stated here so nobody discovers it as a bug.

## What the author sees

One line beside the title, moving through *Unsaved changes* → *Saving…* → *Saved*. `Saving…` is held for a minimum of 500 ms, because a write that returns in 90 ms otherwise produces a flash that reads as an error. Showing nothing on success was rejected: ADR-0020 is narrowed by ADR-0057 so a shared document's content is genuinely mutable, and an author needs to know the edit landed before closing the laptop. A resting timestamp — "Saved at 14:32" — was rejected as arithmetic in place of an answer to "is my work safe".

After the retries fail, the line says the changes are not saved and offers a retry control. It never offers to discard them.

## Keys

The decision is a plain textarea, not a WYSIWYG editor, and that leaves three behaviors that an implementer would otherwise invent: `Tab` inserts two spaces, `Enter` continues a list item, and `Cmd`/`Ctrl`+`S` forces an immediate save through the flush path. A bare textarea that moves focus on `Tab` in the middle of a nested list is the first thing anybody reports. `Escape` then `Tab` must still move focus out, or the textarea is a keyboard trap.

`Cmd`/`Ctrl`+`S` is not decoration. Autosave removes the habit people already have, and that key is where the habit lives.

A formatting toolbar was rejected for this slice as the first step toward the WYSIWYG editor already ruled out of scope. The image picker of ADR-0058 is the one button that earns its place.

## Two members editing at once

ADR-0010 makes every member a full content collaborator, so this is reachable today, and one consequence of `{ refetch: false }` makes it worse than it looks: the collection now almost never refetches, so one author never receives the other's edits at all. Last-write-wins on a whole text column, silently, is the failure ADR-0010 accepted people would not notice.

So `updateDocument` takes the `updatedAt` value the client last saw as a precondition. A mismatch is a typed error, not a silent overwrite. The editor stops autosave, freezes the text, names the other person, and offers exactly two choices: load their version and lose mine, or overwrite theirs.

**This detects a collision; it does not resolve one.** Concurrent editing is not supported, and a CRDT is a different product than a plain column of text. The threat model is a careless colleague, so the event is rare, and a rare event deserves a stop rather than a merge. It follows that **`updated_at` is written only by the server** — a client that sets its own makes the precondition meaningless.

## An abandoned document stays

Someone creates a document, lands in the editor, types nothing, and leaves. The row remains, with an empty body and the title from the dialog, visible in the grid. Nothing cleans it up.

Erasing it on unmount was rejected because a route unmounts for reasons that are not a decision by a person — an organization switch, a back button — and data erased by a component lifecycle is data erased by accident. Giving it to the sweeper of ADR-0021 was rejected because the sweeper's job is bytes and rows that disagree, and an empty document is neither. An empty markdown document is also legitimate: a title today, the writing next week. This is recorded because the impulse to tidy it up will return.
