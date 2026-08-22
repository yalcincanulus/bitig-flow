import { randomUUID } from "node:crypto";

import { expect, test } from "vitest";

import {
  addFixtureMember,
  createFixtureInvitation,
  createFixtureUser,
  createOrganizationFixture,
  createOrganizationForFixtureUser,
} from "../fixtures";
import { postAuth } from "./auth-journey";

const organizationApi = "/api/auth/organization";

async function ownFiveOrganizations(userId: string) {
  await Promise.all(Array.from({ length: 5 }, () => createOrganizationForFixtureUser(userId)));
}

test("a User who owns five Organizations cannot create another", async () => {
  const user = await createFixtureUser();
  await ownFiveOrganizations(user.user.id);

  const nonce = randomUUID();
  const response = await postAuth(user.http, "/api/auth/organization/create", {
    name: `Sixth Organization ${nonce}`,
    slug: `sixth-${nonce.slice(0, 8)}`,
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
  });
});

test("a User who owns five Organizations can still accept an Invitation", async () => {
  const [user, host] = await Promise.all([createFixtureUser(), createOrganizationFixture()]);
  await ownFiveOrganizations(user.user.id);
  const invitation = await createFixtureInvitation({
    organizationId: host.organization.id,
    inviter: host.owner,
    email: user.user.email,
  });

  const accepted = await postAuth(user.http, `${organizationApi}/accept-invitation`, {
    invitationId: invitation.id,
  });

  expect(accepted.status).toBe(200);

  const switched = await postAuth(user.http, `${organizationApi}/set-active`, {
    organizationId: host.organization.id,
  });
  expect(switched.status).toBe(200);

  const members = await user.http(
    new URL(`${organizationApi}/list-members`, process.env.BETTER_AUTH_URL),
    {
      headers: { origin: process.env.BETTER_AUTH_URL! },
    },
  );
  const listing = (await members.json()) as { members: Array<{ userId: string }> };

  expect(members.status).toBe(200);
  expect(listing.members.some((membership) => membership.userId === user.user.id)).toBe(true);
});

test("Memberships in other people's Organizations do not count against the cap", async () => {
  const user = await createFixtureUser();
  const hosts = await Promise.all(Array.from({ length: 6 }, () => createOrganizationFixture()));
  await Promise.all(
    hosts.map((host) =>
      addFixtureMember({
        organizationId: host.organization.id,
        userId: user.user.id,
      }),
    ),
  );

  const nonce = randomUUID();
  const response = await postAuth(user.http, "/api/auth/organization/create", {
    name: `Owned Organization ${nonce}`,
    slug: `owned-${nonce.slice(0, 8)}`,
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ name: `Owned Organization ${nonce}` });
});
