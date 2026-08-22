import { expect, test } from "vitest";

import {
  callServerFunction,
  createFixtureInvitation,
  createOrganizationFixture,
} from "../fixtures";

const peopleModulePath = "/src/server/functions/people.ts";

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
