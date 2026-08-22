import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { invitation } from "#/server/db/schema";

import {
  callServerFunction,
  createCookieClient,
  createFixtureInvitation,
  createOrganizationFixture,
  database,
} from "../fixtures";

const invitationModulePath = "/src/server/functions/invitations.ts";
const organizationApi = "/api/auth/organization";

function readInvitation(invitationId: string) {
  return callServerFunction(fetch, {
    modulePath: invitationModulePath,
    exportName: "readInvitation",
    method: "GET",
    data: { invitationId },
  });
}

function invitationPageUrl(invitationId: string) {
  return new URL(`/accept-invitation/${invitationId}`, process.env.BETTER_AUTH_URL);
}

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

async function invitationPageCopy(invitationId: string) {
  const response = await createCookieClient().http(invitationPageUrl(invitationId), {
    redirect: "manual",
  });
  expect(response.status).toBe(200);
  return textOf(serverRenderedMarkupOf(await response.text()));
}

function organizationMutation(
  http: typeof fetch,
  path: "cancel-invitation" | "remove-member",
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

test("a public Invitation read names its Organization and current inviter, and nothing else", async () => {
  const fixture = await createOrganizationFixture();
  const invitationRow = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  const response = await readInvitation(invitationRow.id);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "valid",
    organizationName: fixture.organization.name,
    inviterName: fixture.owner.user.name,
  });
});

test("an expired Invitation is refused and names only its Organization", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  await database
    .update(invitation)
    .set({ expiresAt: new Date(0) })
    .where(eq(invitation.id, row.id));

  const response = await readInvitation(row.id);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "expired",
    organizationName: fixture.organization.name,
  });
});

test("a canceled Invitation and an invented id are the same silent miss", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  const canceled = await organizationMutation(fixture.owner.http, "cancel-invitation", {
    invitationId: row.id,
  });
  expect(canceled.status).toBe(200);

  const [canceledResponse, inventedResponse] = await Promise.all([
    readInvitation(row.id),
    readInvitation(randomUUID()),
  ]);

  expect(canceledResponse.status).toBe(200);
  expect(inventedResponse.status).toBe(200);
  expect(await canceledResponse.json()).toEqual({ status: "unavailable" });
  expect(await inventedResponse.json()).toEqual({ status: "unavailable" });
});

test("an Invitation whose inviter has left degrades to the Organization alone", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.admin,
  });

  const removed = await organizationMutation(fixture.owner.http, "remove-member", {
    memberIdOrEmail: fixture.admin.user.email,
    organizationId: fixture.organization.id,
  });
  expect(removed.status).toBe(200);

  const response = await readInvitation(row.id);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "valid",
    organizationName: fixture.organization.name,
    inviterName: null,
  });
});

test("a signed-out stranger sees the Sender line and nothing about the address or Role", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
    role: "admin",
  });

  const copy = await invitationPageCopy(row.id);

  expect(copy).toContain(`${fixture.owner.user.name} at ${fixture.organization.name}`);
  expect(copy).not.toContain(row.email);
  expect(copy).not.toMatch(/Admin/i);
  expect(copy).not.toMatch(/resend/i);
});

test("an expired Invitation page names the Organization, says it expired, and offers only the shared remedy", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  await database
    .update(invitation)
    .set({ expiresAt: new Date(0) })
    .where(eq(invitation.id, row.id));

  const copy = await invitationPageCopy(row.id);

  expect(copy).toContain(fixture.organization.name);
  expect(copy).toContain("This Invitation has expired.");
  expect(copy).toContain("Ask the Organization for a new Invitation.");
  expect(copy).not.toContain(row.email);
  expect(copy).not.toMatch(/resend/i);
});

test("canceled and invented Invitation pages name nobody and offer the same remedy", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  const canceled = await organizationMutation(fixture.owner.http, "cancel-invitation", {
    invitationId: row.id,
  });
  expect(canceled.status).toBe(200);

  const [canceledCopy, inventedCopy] = await Promise.all([
    invitationPageCopy(row.id),
    invitationPageCopy(randomUUID()),
  ]);

  expect(canceledCopy).toBe(inventedCopy);
  expect(canceledCopy).toContain("This Invitation isn't available.");
  expect(canceledCopy).toContain("Ask the Organization for a new Invitation.");
  expect(canceledCopy).not.toContain(fixture.organization.name);
  expect(canceledCopy).not.toContain(fixture.owner.user.name);
  expect(canceledCopy).not.toMatch(/resend/i);
});
