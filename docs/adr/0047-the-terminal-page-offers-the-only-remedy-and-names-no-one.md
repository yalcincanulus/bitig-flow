# The terminal page offers the only remedy and names no one

ADR-0033 collapses unknown, expired, deactivated, rotated, and deleted-target into one neutral page with a 404. That page reads:

> **This link isn't available.**
> Ask whoever sent it to you for a new one.

The second line is the only remedy that exists, and it is worth saying. Every other route out — retry, refresh, wait — is wrong, and a page that stops at the first line leaves a legitimate recipient to discover that by trying them. The disclosure is nil: that a dead URL was once sent by someone is not a fact about this system.

It says "whoever" and never a name. The page renders identically for a Slug that never existed, so there is no sender to name in the general case, and naming one in the cases where we could would make the page's own wording the oracle ADR-0033 closed — "ask Yalçıncan" and "ask whoever sent it" are distinguishable by anyone probing the Slug space. The generic page has to be generic in its copy, not only in its status code.

No contact affordance and no request-access form. Either would be an unauthenticated write endpoint on a public URL, reachable by anything that can guess twelve base58 characters, and both confirm the Slug resolved to something real. ADR-0024's refusal to record anything before the Gate applies with more force to a page that exists to tell strangers nothing: a "request access" button is a pre-Gate write in a friendlier costume. If an owner wants to hear from a recipient whose Link lapsed, the channel is the one that delivered the Link in the first place.

The page carries the same wordmark and column as the Gate (ADR-0044) so it reads as this system rather than a browser error, and nothing else.
