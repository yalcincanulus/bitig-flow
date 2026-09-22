# Bitig Flow

Bitig Flow is a TanStack Start app for sharing documents. An organization writes markdown or uploads a PDF or an image, groups documents into vaults, and shares one document or one vault through a link. Each link has its own gate: public, or a password, an email address, or a verified email address. Visitors can view the shared document or vault without an account. Analytics for each link show how those visits went.

The live demo is at [bitig.ulus.uk](https://bitig.ulus.uk).

## Features

- **Documents.** Write markdown in the app, or upload a PDF or an image.
- **Vaults.** Group documents and share them together.
- **Links.** Share one document or one vault. The same document or vault can have several links, and each link has its own gate.
- **Access.** A link can be public, or it can ask for a password, an email address, or a verified email address.
- **Analytics.** Each link shows visits, time spent on a page, and downloads.
- **Organizations.** Invite people by email as an owner, an admin, or a member. Owners and admins manage invitations. Everyone in the organization can work with the documents and see the analytics. A person can belong to more than one organization.

## Surfaces

The Dashboard is the signed-in surface at `/dashboard`. An organization manages documents, vaults, links, people, and analytics there.

The Viewer is the public surface at `/v/<slug>`. The visitor passes the gate on this surface. The server records each visit from the Viewer.

Operations is the surface for the Platform Operator, at `/operations`. Operations sits outside every organization. The operator sets the Deployment Policy there.

## Requirements

1. Node.js 26
2. pnpm 11
3. Docker

## Start locally

1. Copy `.env.example` to `.env`.
2. Generate the secrets that `.env.example` names.
3. Run `pnpm install`.
4. Run `pnpm infra:up`.
5. Run `pnpm db:migrate`.
6. Run `pnpm dev`.
7. Open `http://localhost:3000`.

`pnpm infra:up` starts Postgres, Redis, Garage, and Mailpit. Mailpit shows local mail at `http://localhost:8025`.

`DATABASE_URL` must match the Postgres values in `.env`.

CAUTION: Do not change `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` after the first start. Garage stores that key in its volume. Then Garage refuses to start.

If you must rotate those keys, run `pnpm infra:reset` before the next start.

## Scheduled jobs

A deployment runs three jobs on a schedule.

1. Run `pnpm reaper` at least every 15 minutes.
2. Before the last Sweep success is 48 hours old, run `pnpm sweep`.
3. Run `pnpm summary-fold` once per day.

## Production

Bitig Flow is deployed with Coolify. The deployment uses `compose.coolify.yaml`.
