# Abuse counters live in Redis and share the Gate's fate

Every Gate abuse counter is a fixed-window Redis key — `INCR` plus `EXPIRE` on first write — namespaced `gate:rl:<dimension>:<key>`. A sliding window over a sorted set is more accurate at window boundaries and is not worth its complexity here.

There is no fail-open versus fail-closed policy to decide, because ADR-0004 already puts in-progress Gate state in Redis: if Redis is unavailable the Gate cannot function at all, so "counters down but Gate up" is not a reachable state. Redis is a hard dependency of the Viewer path, not an optimization. It follows that counters need no persistence — a Redis restart resets every bucket and drops every pending Gate record together, which is a state the system already has to tolerate.

There are exactly four counters, each with a distinct reason to exist:

| Counter | Key | Limit |
| --- | --- | --- |
| Credential guesses — password submits and code verifies | `(link, ip)` | 10 per 15 min |
| Form submissions — email submits and code requests | `(link, ip)` | 20 per 15 min |
| Code sends per recipient (ADR-0039) | hashed email address, all Links | 5 per hour |
| Visit creation (ADR-0042) | `ip`, all Links | 30 per hour |

Plus the per-record 60-second resend cooldown and 5-attempt code limit already fixed by ADR-0003, which are properties of a pending Gate record rather than counters over a window.

ADR-0027 adds a fifth fixed window that is not a Gate abuse counter: 20 Beacons per Visit per 60 seconds, namespaced `beacon:rl:<key>`. It shares Redis's fate and the same `INCR` / `EXPIRE` / `TTL` shape. It is not in the table above because a tripped Beacon limiter is not a Gate event and must not share the `gate:rl:` prefix.

Splitting credential guesses from form submissions keeps a visitor who fat-fingered a password from losing code-verify attempts, and keeps the "too many attempts" wording specific to what the visitor should retry. A correct password or a correct code **deletes** the credential key — a successful proof is evidence the client is the intended recipient and the counter has done its job. The submission and per-address counters are never reset by success: they are not about proving anything, and resetting them would let an attacker who controls one address launder unlimited sends.
