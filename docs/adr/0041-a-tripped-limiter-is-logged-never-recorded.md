# A tripped limiter is logged, never recorded

When a Gate limiter fires, the server emits one structured `warn` line carrying the dimension, a truncated key hash, and the Link id — never a plaintext email address and never a raw IP. There is no table, no Dashboard surface, and no alerting.

ADR-0024 forbids recording anything before the Gate, and the abuse policy keeps limiter activity out of the owner's view entirely: a wrong password is not the owner's business, and surfacing it would rebuild the gate-funnel analytics this map ruled out of scope. But that leaves the controls completely silent, which makes a working limiter indistinguishable from a broken one and a mail bomb in progress indistinguishable from a quiet week.

Operational logs resolve that without violating ADR-0024, and the distinction is worth stating so a later reader does not think it was violated: these lines never touch `visit` or `visit_event`, never reach a query the product runs, and are ephemeral container output with the lifetime of the deployment. They exist for whoever is debugging the system, not for whoever owns the Link.
