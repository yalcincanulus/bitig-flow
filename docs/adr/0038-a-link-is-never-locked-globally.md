# A Link is never locked globally

Password brute force is limited per `(link, ip)` only — 10 credential guesses per 15 minutes (ADR-0037). There is deliberately no global per-Link ceiling of the "after 100 wrong passwords this Link locks" kind.

A global lockout is a denial-of-service handed to the attacker: it is cheap to trigger from anywhere, it locks out the legitimate recipient rather than the attacker, and the owner has no way to notice it happened. The cost of refusing it is real and stated plainly — a distributed attacker gets effectively unlimited guesses at a share password.

So the actual defence is pushed upstream to Link creation: a share password must be at least 8 characters and is rejected if it is an obvious choice (the organization's name, `password`, and a small embedded list of the like). The per-IP limit and the creation-time rule only make sense together — the limit buys time, the strength rule is what that time is worth. Wiring the rule into the creation form is ordinary implementation work and needs no separate decision.

On exceeding the limit the Visitor sees a plain "too many attempts, try again in a few minutes". Unlike a login form there is no account to enumerate and no user to protect, so an honest message leaks nothing that the Slug itself did not already reveal.
