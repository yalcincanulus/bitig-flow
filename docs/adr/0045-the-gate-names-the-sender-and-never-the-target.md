# The gate names the sender and never the target

Before a single Requirement is satisfied, the Gate shows who shared the Link and nothing about what was shared. No title, no document count, no kind, no expiry, no preview — not even a redacted one.

The title is content. "Q3 Investor Update" is a mild case; "Series B Term Sheet" or "Redundancy list — final" is most of what an attacker wanted, and a Link is gated precisely because its owner does not trust everyone holding the URL. ADR-0033 already refuses to let the `/v` space act as an oracle for which Slugs are real; printing the target's name to anyone who loads the page is the same disclosure with a better payload. A password Gate that announces what it is protecting has given away the part that mattered.

The sender is disclosed anyway, because the failure it prevents is worse than the one it causes. A page that says only "enter a password" is indistinguishable from a phishing page, and the Visitor's correct response to an unattributed password prompt is to close the tab. Naming the sender is what makes the Gate legible as mail from a person. It leaks that a named individual shared _something_ with whoever holds the Slug, which is a real disclosure and an accepted one.

The line reads `<user.name> at <organization.name>`. `link.created_by` is `SET NULL` (ADR-0016's table), so it can be absent on a Link whose creator has left; the Organization is the guaranteed half and the line degrades to the Organization alone. This is the display-only read of `created_by` that ADR-0015 permits, and it must never reach an authorization decision.

A per-Link "show the title on the gate" flag was considered and rejected. It is a new column, a new control in the Link editor, and a question the owner has to answer correctly every time for a benefit that only materialises when the title is both harmless and useful. The default would be off, which is this decision; the exception is a Link whose title the owner would happily publish, which is a Link that probably wants no Gate at all.

Everything withheld here appears the moment the Gate is satisfied. The reveal is the reward for passing it.
