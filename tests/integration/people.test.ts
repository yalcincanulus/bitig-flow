import { randomUUID } from "node:crypto";

import { expect, test } from "vitest";

import {
  callServerFunction,
  createFixtureInvitation,
  createFixtureUser,
  createOrganizationFixture,
} from "../fixtures";

const peopleModulePath = "/src/server/functions/people.ts";
const organizationApi = "/api/auth/organization";

function organizationMutation(
  http: typeof fetch,
  path: "invite-member" | "cancel-invitation" | "accept-invitation",
  body: unknown,
) {
  return http(new URL(`${organizationApi}/${path}`, process.env.BETTER_AUTH_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.BETTER_AUTH_URL!,
    },
    body: JSON.stringify(body),
  });
}

function readMemberships(http: typeof fetch) {
  return http(new URL("/api/auth/organization/list-members", process.env.BETTER_AUTH_URL), {
    headers: { origin: process.env.BETTER_AUTH_URL! },
  });
}

function readOutstandingInvitations(http: typeof fetch) {
  return callServerFunction(http, {
    modulePath: peopleModulePath,
    exportName: "listOutstandingInvitations",
    method: "GET",
  });
}

test("a member can read every Membership, with each colleague's email and Role", async () => {
  const fixture = await createOrganizationFixture();

  const response = await readMemberships(fixture.member.http);
  const listing = (await response.json()) as {
    members: Array<{ role: string; user: { email: string } }>;
  };

  expect(response.status).toBe(200);
  // Everyone in the Organization, not only the person asking: `member:read` is organization-wide.
  expect(
    Object.fromEntries(
      listing.members.map((membership) => [membership.user.email, membership.role]),
    ),
  ).toEqual({
    [fixture.owner.user.email]: "owner",
    [fixture.admin.user.email]: "admin",
    [fixture.member.user.email]: "member",
  });
});

// Better Auth's own `list-invitations` gates on bare membership and consults no statement, so
// without `listOutstandingInvitations` in front of it this is the one place a member could read
// what ADR-0010's amendment reserves for owners and admins.
test("a member cannot read the outstanding Invitations an owner and an admin can", async () => {
  const fixture = await createOrganizationFixture();
  const invitation = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  const [memberResponse, adminResponse, ownerResponse] = await Promise.all([
    readOutstandingInvitations(fixture.member.http),
    readOutstandingInvitations(fixture.admin.http),
    readOutstandingInvitations(fixture.owner.http),
  ]);

  expect(memberResponse.status).toBe(403);
  expect(await memberResponse.json()).toMatchObject({ code: "FORBIDDEN" });

  expect(adminResponse.status).toBe(200);
  expect(await adminResponse.json()).toMatchObject([{ email: invitation.email }]);
  expect(ownerResponse.status).toBe(200);
  expect(await ownerResponse.json()).toMatchObject([{ email: invitation.email, role: "member" }]);
});

/**
 * The reason `listOutstandingInvitations` exists at all, pinned so it cannot rot quietly.
 *
 * ADR-0013's amendment records that Better Auth's own `list-invitations` admits any member of the
 * Organization. If this ever stops being true, our wrapper has become the second home for
 * authorization that ADR-0013 exists to prevent, and this failing test is the notice to remove it.
 */
test("Better Auth's own invitation listing still admits a member, which is why ours does not", async () => {
  const fixture = await createOrganizationFixture();
  await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  const response = await fixture.member.http(
    new URL("/api/auth/organization/list-invitations", process.env.BETTER_AUTH_URL),
    { headers: { origin: process.env.BETTER_AUTH_URL! } },
  );

  expect(response.status).toBe(200);
});

test("an outstanding Invitation belongs to its own Organization and no other", async () => {
  const [first, second] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const invitation = await createFixtureInvitation({
    organizationId: second.organization.id,
    inviter: second.owner,
  });

  const response = await readOutstandingInvitations(first.owner.http);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
  expect(invitation.organizationId).toBe(second.organization.id);
});

test("an owner can invite a colleague into every Role", async () => {
  const fixture = await createOrganizationFixture();

  for (const role of ["owner", "admin", "member"] as const) {
    const response = await organizationMutation(fixture.owner.http, "invite-member", {
      email: `${role}-${randomUUID()}@example.com`,
      role,
      organizationId: fixture.organization.id,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role });
  }
});

test("an admin can invite an admin or member, but cannot invite an owner", async () => {
  const fixture = await createOrganizationFixture();

  for (const role of ["admin", "member"] as const) {
    const response = await organizationMutation(fixture.admin.http, "invite-member", {
      email: `${role}-${randomUUID()}@example.com`,
      role,
      organizationId: fixture.organization.id,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role });
  }

  const refused = await organizationMutation(fixture.admin.http, "invite-member", {
    email: `owner-${randomUUID()}@example.com`,
    role: "owner",
    organizationId: fixture.organization.id,
  });

  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({
    code: "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
  });
});

test("a member cannot invite a colleague", async () => {
  const fixture = await createOrganizationFixture();
  const response = await organizationMutation(fixture.member.http, "invite-member", {
    email: `member-${randomUUID()}@example.com`,
    role: "member",
    organizationId: fixture.organization.id,
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    code: "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION",
  });
});

test("cancelling an outstanding Invitation revokes its emailed link", async () => {
  const [fixture, invitee] = await Promise.all([createOrganizationFixture(), createFixtureUser()]);
  const invitation = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
    email: invitee.user.email,
  });

  const canceled = await organizationMutation(fixture.owner.http, "cancel-invitation", {
    invitationId: invitation.id,
  });
  expect(canceled.status).toBe(200);
  expect(await canceled.json()).toMatchObject({ id: invitation.id, status: "canceled" });

  const accepted = await organizationMutation(invitee.http, "accept-invitation", {
    invitationId: invitation.id,
  });
  expect(accepted.status).toBe(400);
  expect(await accepted.json()).toMatchObject({ code: "INVITATION_NOT_FOUND" });
});

test("an admin cannot cancel another Organization's Invitation", async () => {
  const [first, second] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const invitation = await createFixtureInvitation({
    organizationId: second.organization.id,
    inviter: second.owner,
  });

  const response = await organizationMutation(first.admin.http, "cancel-invitation", {
    invitationId: invitation.id,
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "MEMBER_NOT_FOUND" });

  const secondOrganizationListing = await readOutstandingInvitations(second.owner.http);
  expect(await secondOrganizationListing.json()).toMatchObject([{ id: invitation.id }]);
});
