# The suite is serial and state is truncated between tests

**There is one server process, one test database, and one test at a time.** `fileParallelism` is off and the pool is single-threaded. Each test begins from empty state, produced by a `beforeEach` that truncates every Postgres table, flushes the Redis test database, and deletes every Mailpit message.

A transaction rolled back per test — the usual answer — is unreachable here, and it is unreachable *because* of ADR-0049. The connection pool lives inside the server process; the test holds no handle to the transaction the request runs in. This is a consequence of the seam, not an independent preference.

Given that, serial execution is not a compromise but the only coherent option: parallel test files sharing one database would truncate each other's rows mid-request, and the failures would be intermittent and unattributable. The escape hatch is recorded so nobody has to rediscover it — a database *and* a server process per worker — but it is not built, because this is a portfolio application whose suite covers a few dozen paths.

Each service is isolated in the way that service makes cheap. Postgres gets a **separate `bitig_test` database**, migrated once at startup, so a truncation can never touch development data. Redis gets a **separate logical database index**, so the same reasoning holds for a `FLUSHDB`. Mailpit is emptied through its API. **Garage gets nothing at all** — every object key is `org/<orgId>/doc/<documentId>/original` with a fresh uuid per fixture, so test objects cannot collide with each other or with anything else, and the only cost of leaving them is disk. `pnpm infra:reset` is the eraser on the day that matters.

The environment for all of this is *derived*, not declared: `globalSetup` reads `.env` and rewrites the database name and Redis index. A committed `.env.test` would be a second copy of every credential, drifting from the first, with the failure mode of a suite that quietly runs against development.
