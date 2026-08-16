# Testing is local and the suite never owns its infrastructure

**`pnpm test` never runs Docker.** `globalSetup` probes Postgres, Redis, garage, and Mailpit, and if any one of them is unreachable the run fails immediately, naming the service and telling the developer to run `pnpm infra:up`. A runner that starts containers itself turns a 200ms failure into a forty-second one and buries which layer actually broke; keeping the two commands separate keeps every failure legible.

**There is no CI.** No GitHub Actions, no hosted runner, no external service. The suite is a local gate, run before a commit, against the same `pnpm infra:up` stack used for development.

The reasoning matches the one that put Coolify and production deployment out of this map's scope: a CI pipeline is downstream of a working application, it changes no foundational decision here, and standing up four service containers in a workflow is a second environment to keep honest for a portfolio project with one developer. This is recorded rather than left silent so that its absence reads as a decision instead of an omission — and so that adding CI later is understood as reopening it, with the service-container work as the known cost.
