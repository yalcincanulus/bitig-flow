# Bitig Flow

Share documents through links you control, and see what happens after you send them.

Bitig Flow is a document-sharing app built on TanStack Start. An organization writes markdown or uploads PDFs and images, groups them into vaults, and publishes them through links. Each link has its own gate (public, password, email, or verified email) and its own analytics: who opened it, what they read, how long they stayed on each page, and what they downloaded.

**Live demo:** [bitig.ulus.uk](https://bitig.ulus.uk). Select **Try the demo** to get a disposable organization with sample content. It is deleted after 24 hours.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Testing](#testing)
- [Scheduled jobs](#scheduled-jobs)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [Design documentation](#design-documentation)

## Features

**Content**

- **Documents.** Write markdown in the in-app editor, which autosaves. You can also upload a PDF or an image (PNG, JPEG, WebP, GIF, up to 25 MB). Markdown can embed image documents.
- **Vaults.** Put several documents in a vault and share them as one unit. You can hide a document from a vault's links without removing it from the vault.
- **Preview.** Owners see a document through the same renderer that visitors use.

**Sharing**

- **Links.** A link points at one document or one vault. One target can have many links, each with different rules and separate analytics.
- **Gates.** Each link can require any combination of a password, an email address, and a verified email address (one-time code). A link with no requirements is public.
- **Safe delivery.** Gated bytes go through the app's own origin. They are never cached and cannot be framed. Uploads are checked by magic bytes, SVG is rejected, and raw HTML in markdown is always off.
- **Abuse limits.** Password guesses, code sends, and form submissions have rate limits backed by Redis.

**Analytics**

- Visits, unique viewers, views per document, and downloads for each link.
- Time spent on each page, measured in the browser and sent with `sendBeacon`.
- Completion for PDFs: the share of pages that the visitor read.
- Nothing is recorded before a visitor passes the gate. Visitor identifiers are salted hashes and never grant access.

**Organizations**

- Invite people by email as an **owner**, **admin**, or **member**. All roles have full access to content. Only owners and admins manage people.
- A person can belong to several organizations and switch between them.

**Operations**

- A single **Platform Operator** (password + TOTP) manages the deployment at `/operations`.
- The **Deployment Policy** controls signup, demo admission, and demo resource limits at runtime. Readiness checks prevent it from opening a feature that the deployment cannot support.
- One-click **demo environments**: isolated, credential-free, and deleted after 24 hours.

## How it works

The app has three surfaces:

| Surface        | Path          | Who uses it           | Notes                                                                                  |
| -------------- | ------------- | --------------------- | -------------------------------------------------------------------------------------- |
| **Dashboard**  | `/dashboard`  | Signed-in users       | Manages documents, vaults, links, people, and analytics. Uses TanStack DB collections. |
| **Viewer**     | `/v/<slug>`   | Anonymous visitors    | Server-rendered. Shows the gate, then the document or vault. Records every visit.      |
| **Operations** | `/operations` | The Platform Operator | Outside every organization. Sets the Deployment Policy and manages demo environments.  |

A visit follows this path:

1. A visitor opens `/v/<slug>`. The server decides which gate step to show.
2. The visitor satisfies the requirements (for example, enters an email and then a code).
3. When the gate is satisfied, the server creates a **Visit** and sets a visit cookie.
4. The server records a `document_opened` event for each view and a `download` event for each download.
5. The browser accumulates time per page and sends `page_dwell` events with a beacon.
6. The Dashboard aggregates these events when you open the analytics pages.

## Tech stack

| Area           | Tools                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Framework      | [TanStack Start](https://tanstack.com/start), React 19, React Compiler, Vite |
| Data (client)  | TanStack Router, TanStack Query, TanStack DB, TanStack Form                  |
| UI             | Tailwind CSS 4, shadcn/ui on Base UI, lucide icons, TanStack Charts          |
| Rendering      | TanStack Markdown and Highlight, PDF.js                                      |
| Auth           | Better Auth (organizations, TOTP), Argon2 for share passwords                |
| Database       | PostgreSQL with Drizzle ORM                                                  |
| Cache / limits | Redis                                                                        |
| Storage        | S3-compatible object storage ([Garage](https://garagehq.deuxfleurs.fr/))     |
| Email          | Nodemailer over SMTP (Mailpit in development)                                |
| Tooling        | TypeScript, Vitest, oxlint, oxfmt, pnpm                                      |

## Getting started

### Requirements

- Node.js 26
- pnpm 11
- Docker with Compose

### Set up

```sh
cp .env.example .env
```

Generate the secrets in `.env`. The comments in `.env.example` give the command for each one:

```sh
openssl rand -base64 32          # BETTER_AUTH_SECRET, GARAGE_ADMIN_TOKEN
openssl rand -hex 32             # ANALYTICS_SALT, GATE_RATELIMIT_SALT (use different values)
openssl rand -hex 32             # S3_SECRET_ACCESS_KEY, GARAGE_RPC_SECRET
echo "GK$(openssl rand -hex 16)" # S3_ACCESS_KEY_ID (the GK prefix is required)
```

Then install, start the local services, and apply the migrations:

```sh
pnpm install
pnpm infra:up      # Postgres, Redis, Garage (S3), Mailpit
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Local mail (invitations, verification codes, password resets) appears in Mailpit at [http://localhost:8025](http://localhost:8025).

To make sure that the local services are reachable and configured correctly, run `pnpm infra:verify`.

### Create the Platform Operator

Signup and demo entry are closed by default. To open them, create the Platform Operator:

```sh
pnpm operator:bootstrap
```

The command asks for a name, email, and password. Sign in, enroll TOTP, and then open **Operations → Deployment Policy**.

If the operator loses access, `pnpm operator:recover` sets a new password, revokes all sessions, and requires TOTP enrollment again.

> [!CAUTION]
> Do not change `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` after the first start. Garage stores the key in its volume and refuses to start if the values change. To rotate the keys, run `pnpm infra:reset`. This command deletes all local data.

## Configuration

All configuration comes from environment variables. `.env.example` documents each one. The main groups are:

| Variables                               | Purpose                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POSTGRES_*`, `DATABASE_URL`            | Postgres container settings and the app's connection string. They must agree.                  |
| `REDIS_PASSWORD`, `REDIS_URL`           | Redis for sessions, rate limits, and gate state.                                               |
| `S3_*`, `GARAGE_*`                      | Object storage. Set `S3_PUBLIC_ENDPOINT` when browsers reach storage through a different host. |
| `SMTP_*`                                | Outgoing mail. Without SMTP, mail-dependent features stay unavailable.                         |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Auth secret and the public URL of the app.                                                     |
| `ANALYTICS_SALT`, `GATE_RATELIMIT_SALT` | Salts for visitor hashes and rate-limit keys. They must be different.                          |
| `TRUSTED_PROXY_COUNT`                   | Number of reverse proxies in front of the app. `0` locally, `1` behind Coolify's proxy.        |

## Scripts

| Command                     | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                  | Start the dev server on port 3000.                                   |
| `pnpm build`                | Build for production.                                                |
| `pnpm start`                | Serve the production build.                                          |
| `pnpm infra:up`             | Start Postgres, Redis, Garage, and Mailpit, and set up the bucket.   |
| `pnpm infra:down`           | Stop the local services.                                             |
| `pnpm infra:reset`          | Delete all local service data and start again.                       |
| `pnpm infra:logs`           | Follow the service logs.                                             |
| `pnpm infra:verify`         | Smoke-test the local services.                                       |
| `pnpm db:generate`          | Generate a migration from schema changes.                            |
| `pnpm db:migrate`           | Apply migrations.                                                    |
| `pnpm operator:bootstrap`   | Create the Platform Operator.                                        |
| `pnpm operator:recover`     | Reset the Platform Operator's password.                              |
| `pnpm reaper`               | Delete expired demo environments (`reaper:watch` runs it in a loop). |
| `pnpm sweep`                | Reconcile object storage with the database.                          |
| `pnpm summary-fold`         | Fold ended demo summaries into aggregates.                           |
| `pnpm test`                 | Run the full test suite.                                             |
| `pnpm typecheck`            | Type-check the project.                                              |
| `pnpm lint` / `pnpm fmt`    | Lint and format with oxlint and oxfmt.                               |
| `pnpm react-compiler:check` | Report components that the React Compiler cannot optimize.           |

## Testing

```sh
pnpm infra:up
pnpm test
```

The suite has two Vitest projects:

- **`pure`** (`tests/pure`) contains fast unit tests with no I/O.
- **`integration`** (`tests/integration`) starts the app and drives it over HTTP against the real Postgres, Redis, Garage, and Mailpit. Tests run one at a time, and the state is truncated between tests.

The tests do not start Docker. If a service is not reachable, the run stops and names the service. There is no CI: the suite is a local check that you run before you commit.

## Scheduled jobs

A deployment must run three maintenance jobs:

| Job                 | Schedule                     | What it does                                                       |
| ------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `pnpm reaper`       | At least every 15 minutes    | Deletes demo environments that are older than 24 hours.            |
| `pnpm sweep`        | At least once every 48 hours | Removes unconfirmed uploads and objects that have no document row. |
| `pnpm summary-fold` | Once per day                 | Folds ended demo summaries into aggregates.                        |

Operations shows when each job last succeeded. Demo entry stays closed until the Reaper and the Sweep are fresh.

## Deployment

The production deployment uses [Coolify](https://coolify.io) with `compose.coolify.yaml`. Do not use `compose.yaml` in production, because it publishes ports and includes Mailpit.

The Coolify stack contains:

- `app`: the web server. At startup, the container applies the migrations and the Garage CORS settings.
- `reaper`, `sweep`, and `summary-fold`: sidecars that use the same image to run the scheduled jobs.
- `postgres`, `redis`, `garage`, and `garage-init`.

Coolify generates the secrets.

After the first deployment:

1. Run `pnpm operator:bootstrap` in the `app` container.
2. Sign in and enroll TOTP.
3. Wait until the Reaper and the Sweep have run once.
4. Follow [`docs/demo-rollout-readiness.md`](docs/demo-rollout-readiness.md) to open demo entry and, optionally, signup.

The `Dockerfile` also works without Coolify. Give the container the same environment variables and run the three jobs on a schedule.

## Project layout

```
src/
  routes/          File-based routes
    _auth/         Sign-in, sign-up, password reset
    _authenticated/dashboard/   The Dashboard
    v/             The Viewer (public links and gates)
    operations/    The Operations surface
    api/           Server routes: auth, document bytes, demo, operations
  server/          Server-only code: auth, storage, repositories, viewer, CLI jobs
    db/            Drizzle schema and database client
    repositories/  Organization-scoped data access
    functions/     Server functions called by the Dashboard
  db-collections/  TanStack DB collections for the Dashboard
  components/      UI components (shadcn/ui in components/ui)
  lib/             Shared logic: access control, analytics folding, uploads, rendering
drizzle/           SQL migrations
infra/             Garage config, Docker entrypoint, infra smoke test
tests/             Pure and integration tests, and their fixtures
docs/              ADRs and operational guides
```
