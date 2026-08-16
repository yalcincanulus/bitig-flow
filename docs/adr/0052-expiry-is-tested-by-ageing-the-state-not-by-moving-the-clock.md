# Expiry is tested by ageing the state, not by moving the clock

**A test that needs an expired thing reaches into Postgres or Redis and makes it old, then sends the next request.** A visit is backdated past seven days, a pending gate record is deleted, a link's `expires_at` is set to the past, a rate-limit window is dropped.

Fake timers cannot work here and it is worth being clear why: the clocks that decide these outcomes are inside Redis and inside Postgres, in a different process from the test (ADR-0049). There is no timer in the test process to fake. The test process does, however, already hold direct handles to both stores in order to build fixtures (ADR-0051), so ageing state costs one write.

**Injecting a clock into the application was rejected.** An env-var-driven time offset that production code reads is a test seam on a security-relevant path — the same path that decides whether a stranger's seven-day visit is still valid. The suite is not worth a production affordance for moving time backwards.

**Shortening every TTL in a test mode and sleeping was rejected** as trading correctness for wall-clock: it tests different constants than the ones that ship, and it makes the suite slow in exchange.

The limit this leaves is real and is stated rather than discovered later: **these tests prove that the application rejects aged state, never that the TTL is seven days.** The durations themselves — seven days, fifteen minutes, the code lifetime, the one-hour limiter windows — are untested constants. That is the accepted trade. A wrong constant is a visible, one-line, easily-reviewed error; a missing expiry check is an invisible one, and the check is what the suite covers.
