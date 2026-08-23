import { randomUUID } from "node:crypto";

import { expect, test } from "vitest";

import {
  addFixtureMember,
  createFixtureDocument,
  createFixtureInvitation,
  createFixtureLink,
  createFixtureUser,
  createOrganizationFixture,
  createOrganizationForFixtureUser,
} from "../fixtures";
import { postAuth } from "./auth-journey";

const organizationApi = "/api/auth/organization";

function serverRenderedMarkupOf(html: string) {
  return html.replaceAll(/<script[\s\S]*?<\/script>/g, "");
}

function textOf(html: string) {
  return html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/g, " ")
    .trim();
}

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

test("an Owner renames the active Organization without changing its slug or existing Sender lines", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.owner.user.id,
  });
  const [published, invitation] = await Promise.all([
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.owner.user.id,
      documentId: documentRow.id,
      requiresEmail: true,
    }),
    createFixtureInvitation({
      organizationId: fixture.organization.id,
      inviter: fixture.owner,
    }),
  ]);
  const renamed = `Renamed Organization ${randomUUID()}`;

  const update = await postAuth(fixture.owner.http, `${organizationApi}/update`, {
    organizationId: fixture.organization.id,
    data: { name: renamed },
  });

  expect(update.status).toBe(200);
  expect(await update.json()).toMatchObject({
    id: fixture.organization.id,
    name: renamed,
    slug: fixture.organization.slug,
  });

  const [dashboard, linkPage, invitationPage] = await Promise.all([
    fixture.owner.http(new URL("/dashboard/settings", process.env.BETTER_AUTH_URL), {
      redirect: "manual",
    }),
    fetch(new URL(`/v/${published.slug}`, process.env.BETTER_AUTH_URL), { redirect: "manual" }),
    fetch(new URL(`/accept-invitation/${invitation.id}`, process.env.BETTER_AUTH_URL), {
      redirect: "manual",
    }),
  ]);
  const [dashboardHtml, linkHtml, invitationHtml] = await Promise.all([
    dashboard.text(),
    linkPage.text(),
    invitationPage.text(),
  ]);

  expect(dashboard.status).toBe(200);
  expect(serverRenderedMarkupOf(dashboardHtml)).toContain(renamed);
  expect(linkPage.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(linkHtml))).toContain(
    `${fixture.owner.user.name} at ${renamed}`,
  );
  expect(invitationPage.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(invitationHtml))).toContain(
    `${fixture.owner.user.name} at ${renamed}`,
  );
  expect(`${dashboardHtml}${linkHtml}${invitationHtml}`).not.toContain(fixture.organization.name);
});
