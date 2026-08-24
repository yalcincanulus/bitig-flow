import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, test } from "vitest";

import {
  document as documentTable,
  invitation as invitationTable,
  link as linkTable,
  member as membershipTable,
  vault as vaultTable,
  visit as visitTable,
  visitEvent as visitEventTable,
} from "#/server/db/schema";

import {
  addFixtureMember,
  callServerFunction,
  createFixtureDocument,
  createFixtureInvitation,
  createFixtureLink,
  createFixtureVault,
  createFixtureVisit,
  createFixtureVisitEvent,
  createFixtureUser,
  createOrganizationFixture,
  createOrganizationForFixtureUser,
  database,
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

test("leaving recovers to the case-insensitive first Organization with id as the tie-breaker", async () => {
  const fixture = await createOrganizationFixture();
  await createOrganizationForFixtureUser(fixture.member.user.id, "Zulu Organization");
  const sameName = await Promise.all([
    createOrganizationForFixtureUser(fixture.member.user.id, "alpha Organization"),
    createOrganizationForFixtureUser(fixture.member.user.id, "alpha Organization"),
  ]);

  const left = await postAuth(fixture.member.http, `${organizationApi}/leave`, {
    organizationId: fixture.organization.id,
  });
  expect(left.status).toBe(200);

  const recovered = await callServerFunction(fixture.member.http, {
    modulePath: "/src/server/functions/dashboard.ts",
    exportName: "getDashboardContext",
    method: "GET",
  });
  const expected = [...sameName].sort((left, right) => left.id.localeCompare(right.id))[0]!;

  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toMatchObject({ organization: { id: expected.id } });
});

test("leaving removes only the caller's Membership and degrades retained Sender lines", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.admin.user.id,
  });
  const vaultRow = await createFixtureVault({ organizationId: fixture.organization.id });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.admin.user.id,
    documentId: documentRow.id,
  });
  const outstanding = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.admin,
  });
  const now = new Date();
  const visitRow = await createFixtureVisit({
    linkId: published.id,
    visitorId: `visitor-${randomUUID()}`,
    email: null,
    emailVerified: false,
    gateVersion: published.gateVersion,
    startedAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    userAgent: "leave fixture",
    ipHash: "leave-fixture-ip",
  });
  const eventRow = await createFixtureVisitEvent({
    visitId: visitRow.id,
    documentId: documentRow.id,
    type: "document_opened",
    payload: null,
    occurredAt: now,
  });

  const left = await postAuth(fixture.admin.http, `${organizationApi}/leave`, {
    organizationId: fixture.organization.id,
  });
  expect(left.status).toBe(200);

  const dashboard = await fixture.admin.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(dashboard.status).toBe(307);
  expect(dashboard.headers.get("location")).toBe("/onboarding");

  const retainedRows = await Promise.all([
    database.select().from(documentTable).where(eq(documentTable.id, documentRow.id)),
    database.select().from(vaultTable).where(eq(vaultTable.id, vaultRow.id)),
    database.select().from(linkTable).where(eq(linkTable.id, published.id)),
    database.select().from(visitTable).where(eq(visitTable.id, visitRow.id)),
    database.select().from(visitEventTable).where(eq(visitEventTable.id, eventRow.id)),
    database.select().from(invitationTable).where(eq(invitationTable.id, outstanding.id)),
  ]);
  for (const rows of retainedRows) expect(rows).toHaveLength(1);
  expect(retainedRows[5]?.[0]).toMatchObject({ status: "pending" });

  const memberships = await database
    .select({ userId: membershipTable.userId })
    .from(membershipTable)
    .where(eq(membershipTable.organizationId, fixture.organization.id));
  expect(memberships).toEqual(
    expect.arrayContaining([{ userId: fixture.owner.user.id }, { userId: fixture.member.user.id }]),
  );
  expect(memberships).toHaveLength(2);

  const linkPage = await fetch(new URL(`/v/${published.slug}`, process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  const linkCopy = textOf(serverRenderedMarkupOf(await linkPage.text()));
  expect(linkPage.status).toBe(200);
  expect(linkCopy).toContain(fixture.organization.name);
  expect(linkCopy).not.toContain(fixture.admin.user.name);
  expect(linkCopy).not.toContain(" at ");

  const invitationPage = await fetch(
    new URL(`/accept-invitation/${outstanding.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const invitationCopy = textOf(serverRenderedMarkupOf(await invitationPage.text()));
  expect(invitationPage.status).toBe(200);
  expect(invitationCopy).toContain(fixture.organization.name);
  expect(invitationCopy).not.toContain(fixture.admin.user.name);
});

test("a co-Owner can leave while Better Auth refuses the sole Owner", async () => {
  const fixture = await createOrganizationFixture();
  const coOwner = await createFixtureUser();
  await addFixtureMember({
    organizationId: fixture.organization.id,
    userId: coOwner.user.id,
    role: "owner",
  });
  const activated = await postAuth(coOwner.http, `${organizationApi}/set-active`, {
    organizationId: fixture.organization.id,
  });
  expect(activated.status).toBe(200);

  const left = await postAuth(coOwner.http, `${organizationApi}/leave`, {
    organizationId: fixture.organization.id,
  });
  expect(left.status).toBe(200);

  const soleOwner = await createFixtureUser();
  const soleOwnerOrganization = await createOrganizationForFixtureUser(soleOwner.user.id);
  const soleOwnerActivated = await postAuth(soleOwner.http, `${organizationApi}/set-active`, {
    organizationId: soleOwnerOrganization.id,
  });
  expect(soleOwnerActivated.status).toBe(200);

  const refused = await postAuth(soleOwner.http, `${organizationApi}/leave`, {
    organizationId: soleOwnerOrganization.id,
  });
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({
    code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
  });
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
