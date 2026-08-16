# Fixtures are built by the component of record, and never by a repository

**A fixture is an independent oracle, or it is worthless.** The rule that decides how each row is created: use the component that *owns* the table, unless that component is the thing under test.

Users, sessions, and organization membership are created by calling **better-auth's server-side API in the test process**, against the test database. better-auth owns those tables, hashes those passwords, and shapes those session rows; a hand-written SQL insert would be a reimplementation of its scrypt parameters and its column semantics, and it would break on an upgrade in a way that looks like an application bug. The returned session token goes into the HTTP cookie jar, so the request that follows carries a session better-auth itself issued.

Documents, vaults, links, and visits are created by **direct Drizzle inserts in `tests/fixtures/`**, deliberately bypassing `src/server/repositories/`. Those repositories are the thing under test — specifically, that they scope every query to an organization (ADR-0011). A fixture that seeded through a repository would inherit the repository's scoping bug and produce a green test for a broken application. The duplication between fixture inserts and repository writes is the price of having two independent statements of the same shape, and it is the point rather than an oversight.

Note the asymmetry this creates and keep it: the test process holds its *own* database and Redis handles, while the application under test holds its own. That is what makes ADR-0052's approach to time possible.

**Ids are random uuidv7 per fixture, returned to the caller.** Client-generated ids (ADR-0014's `generateId: false` posture) make deterministic ids cheap, but cheap is not a reason. Truncation between tests (ADR-0050) means there is no collision to design around, and a fixed id's only real effect is to tempt a test into asserting on a constant instead of on the value the fixture handed it.
