# Code sends are capped per recipient, not per attacker

A stranger can type any address into a Link's email step, so the verification code step can be turned into a mail bomb aimed at someone who has no relationship with us at all. This is the only Gate abuse with a victim outside the system, and it is the one control that may not rest on an IP key (ADR-0036).

The counter is therefore keyed on the thing being harmed: **at most 5 code sends per email address per hour, across every Link and every IP**. The key is an HMAC-SHA256 of the normalized lowercase address under a dedicated `GATE_RATELIMIT_SALT`, truncated — the same construction as ADR-0028 but explicitly **not** the same secret. Sharing the analytics salt would make a rate-limit key and an analytics identifier for the same address identical, quietly correlating two stores that ADR-0028 works to keep uncorrelated, and would make rotating the analytics salt silently reset every rate-limit bucket.

Over the cap, the server renders the same screen with the same wording and simply does not send. Telling the sender "that address is rate limited" is an oracle about who else has recently been targeted. The timing equivalence is best-effort only: a genuine send costs a round-trip to the mail transport that a suppressed one does not, and we do not pad it. A determined attacker can time-distinguish the two; what leaks is "this address has recently been sent codes", which costs the victim nothing beyond what the attacker already knew by choosing to target them.

The legitimate recipient's remedy when they hit the cap is to wait. That is a worse experience than a bypass would give them, and it is the correct trade when the alternative is being the instrument of someone else's harassment.
