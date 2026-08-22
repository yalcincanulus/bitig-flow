# Org administration is better-auth's; app resources are ours

**Organization, member, and invitation mutations go through `authClient` to the better-auth catch-all route.** Inviting, removing, changing a role, renaming or deleting an organization, and setting the active organization are all better-auth endpoints that already enforce the very access-control statements we configure. Wrapping them in our own `createServerFn` would add a hop and, worse, a second place for the authorization to be got wrong. Our server-function surface owns the app resources — **Document**, **Vault**, **Link**, and analytics — and nothing else. This is not a breach of the rule that everything goes through `createServerFn`: the catch-all was already that rule's sanctioned exception.

**Three middleware tiers, and which one a server function uses is a one-line statement of what it assumes.**

- `authedMiddleware` — resolves the session, returns `{ userId }`, throws the sign-in redirect when there is none.
- `orgMiddleware` — extends it with the active organization and the caller's role, returning `{ userId, orgId, role }`.
- `permission({ ... })` — a factory over `orgMiddleware` that calls `roles[role].authorize(request)`.

The session-only tier is not ceremony. Creating your first organization, listing the organizations you belong to, and accepting an **Invitation** all happen when no active organization exists, so they cannot sit behind `orgMiddleware`.

**The role is read fresh on every request.** `session.activeOrganizationId` lives on the session but the role lives on the `member` row, and we look it up rather than denormalizing it into the session. One indexed `(userId, organizationId)` hit is nothing at this application's traffic, and it means a demotion or a removal takes effect on the offender's very next request instead of whenever their session happens to roll. It also handles eviction for free: an `activeOrganizationId` that returns no `member` row means the user was removed from that organization, and the middleware treats it identically to having no active organization.

**A new user picks an organization name; we do not invent one.** After verification, a user with no memberships routes to onboarding and creates their first organization explicitly. An auto-created "Yalçıncan's Organization" gives a name nobody wants and a semi-public slug, and one screen with one field is not meaningful friction — for a portfolio application, making the tenancy model visible on first run is a feature. A user who signed up by accepting an invitation already has a membership and skips it. The same screen serves the evicted-from-organization case.

**Client-side checks are cosmetic and are never the enforcement point.** `src/lib/access-control.ts` holds the access-control instance and role objects, imported by both the server `auth.ts` and the browser `auth-client.ts`, and a `usePermission()` hook over the synchronous, network-free `checkRolePermission` hides and disables UI. Sharing the identical statement object across the boundary is exactly what makes it tempting to forget that the browser's copy decides nothing.

## Amendment: one read Better Auth declines to serve is ours

**The rule is about mutations, and it holds without exception.** Inviting, canceling, accepting, removing, changing a role, renaming, deleting, and setting the active organization all still go through `authClient`.

Reads were never the point, and one of them cannot go there. `getInvitation` requires a session whose email already matches the invitation, so the public invitation page — whose entire job is telling a signed-out stranger which organization invited them — cannot use it. That page reads through a `createServerFn` of ours that returns the organization and inviter names and nothing else, declaring an `invitationRecipient` tier so it stays visible to the audit sweep. ADR-0066 records the decision in full.

The **People** surface reads through Better Auth as the rule intends: `authClient.organization.listMembers` from a route loader, with `router.invalidate()` after each mutation. A `createServerFn` wrapper around `auth.api.listMembers` was specifically refused, because it is the extra hop and the second home for authorization that this ADR exists to prevent.

## Amendment: the outstanding **Invitations** read is ours, because nothing was guarding it

ADR-0010's amendment says pending **Invitations** are for owners and admins, and that this needs no new statement because `invitation: ["create", "cancel"]` is already exclusive to those two. That reasoning holds only if something consults the matrix on the read path, and on this one endpoint nothing does. Better Auth's `list-invitations` checks that the caller holds *any* **Membership** in the organization and stops there — no `hasPermission` call, unlike `createInvitation` and `cancelInvitation`, which both make one. Verified in the installed 1.6.28 source, and pinned by an HTTP test that fails the day it changes.

**So this read is a `createServerFn` of ours, behind `permission({ invitation: ["create"] })`.** The paragraph above refused exactly this shape for `listMembers`, and the difference is the whole argument: there the objection was a *second* home for authorization, and here there is no first one. The endpoint still does the reading — we call `auth.api.listInvitations` rather than reimplementing it — so what the wrapper adds is the grant, not a parallel rule that could drift from Better Auth's.

**The same argument deliberately stops at **Memberships**, and what stops it is the matrix rather than the missing check.** `list-members` is unguarded in precisely the same way, and it stays on `authClient` with no wrapper, because all three **Roles** hold `member: ["read"]` — there is no check to apply and nothing an unguarded read discloses to anybody not already entitled to it. ADR-0010 keeps that grant for what it says rather than for what it enforces, exactly as it keeps the vacuous `document:read`; its amendment's claim that "our own read path asserts it" is the sentence this one qualifies, because asserting a grant every Role holds would be theatre in the browser and a redundant hop on the server. `invitation: ["create"]` is the opposite kind of grant: exclusive to two **Roles**, so leaving its read ungated is a disclosure and not a formality. **The wrapper follows the exclusivity, not the absent check.**

Declaring the tier is also what keeps the rule auditable. `permission(...)` is a name `tests/pure/tier-coverage.test.ts` already sweeps for, which a `before` hook buried in the plugin configuration would not be; ADR-0066 made the same trade for the opposite case, where a read Better Auth *declines* to serve became ours under a declared `invitationRecipient` tier.

Two consequences worth stating. Filtering to what is genuinely outstanding is ours too, because the listing returns spent rows alongside live ones and never transitions a lapsed **Invitation** out of `pending`. And the People surface does not ask for the section a member cannot have: hiding it is the cosmetic half this ADR describes, and the refusal behind it is real.
