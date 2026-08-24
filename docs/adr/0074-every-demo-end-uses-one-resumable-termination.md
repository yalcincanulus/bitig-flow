# Every Demo end uses one resumable termination

Explicit **End demo**, Operator termination, fixed expiry, and emergency deletion all call one idempotent termination operation. It disables Sessions and Links first, preserves a **Demo Summary** with the end reason, deletes the Organization before the Demo User, then attempts object-prefix removal with the **Sweep** as backstop.

Separate deletion paths would eventually disagree about session revocation, historical counts, or storage cleanup, and a fleet-wide reset cannot safely be one unbounded transaction. Termination therefore has a persisted state, is safe to retry, and fleet-wide deletion advances through bounded resumable batches without deleting summaries or daily aggregates.
