# Hiding a Vault item withdraws it from Links, not from the Vault

A Vault is a flat set of Documents shared as one unit, and until this decision the only way to stop sharing one was to remove it. Removal is destructive in the way that matters: the membership row is gone, so the ordering, the fact that somebody put it there, and the intent behind the grouping all go with it. Owners were re-adding Documents they had removed an hour earlier, which is the signal that removal was doing a job it was never meant to do.

**Visibility is a column on `vault_item`, not on `document`.** The same Document may belong to several Vaults, and hiding it in a deal room says nothing about the Vault where it is the whole point. A flag on the Document would make the two Vaults argue, and the loser would be whichever owner touched it last. `is_visible boolean not null default true` — existing memberships stay shared, because that is what they already were.

## Hiding withdraws bytes, not only the listing

The tempting cheap version filters `listVaultMembers` and stops. That produces a Document nobody can see a link to and everybody can still fetch by pasting its id into the member URL — a listing trick, which is not a permission. **The hidden membership is removed from Reachability (ADR-0058) as well**, so the byte route refuses it, `isVaultMember` refuses it, and the direct URL returns the same 404 as an unknown Slug (ADR-0047).

The reference clause follows the same rule. A hidden markdown Document's References are reachable only through their source, so hiding the source withdraws them too — otherwise hiding a term sheet would leave the chart inside it fetchable.

**Hiding is per-Vault, never per-Link.** A Vault with two Links shows the same set through both. Per-Link visibility is a different feature with a different table, and inventing it here would make "what does this Link serve" a question no single row can answer.

## The Dashboard shows what the Viewer does not

The owner's list keeps hidden Documents in place, dimmed and badged, with the count reading "5 of 6 shared". A hidden Document that vanished from the owner's view would be indistinguishable from a removed one, which is the confusion this decision exists to end.

There is no draft state hiding in here. ADR-0057 says a Document is published by a Link and has none; a hidden membership is a property of one Vault's sharing, not a lifecycle stage of the Document.
