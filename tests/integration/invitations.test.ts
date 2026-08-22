import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { invitation, member } from "#/server/db/schema";

import {
  callServerFunction,
  createCookieClient,
  createFixtureInvitation,
  createFixtureUser,
  createOrganizationFixture,
  createOrganizationForFixtureUser,
  database,
} from "../fixtures";
import { postAuth, waitForVerificationOtp } from "./auth-journey";

const invitationModulePath = "/src/server/functions/invitations.ts";
const organizationApi = "/api/auth/organization";

test("the Invitation middleware client transform does not import the database", async () => {
  const response = await fetch(
    new URL("/src/server/viewer/invitation-recipient.ts", process.env.BETTER_AUTH_URL),
  );
  const clientModule = await response.text();

  expect(response.status).toBe(200);
  expect(clientModule).not.toContain("/src/server/db/client.ts");
});

function readInvitation(invitationId: string) {
  return callServerFunction(fetch, {
    modulePath: invitationModulePath,
    exportName: "readInvitation",
    method: "GET",
    data: { invitationId },
  });
}

function prepareInvitationAcceptance(http: typeof fetch, invitationId: string) {
  return callServerFunction(http, {
    modulePath: invitationModulePath,
    exportName: "prepareInvitationAcceptance",
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

async function invitationPageCopy(
  invitationId: string,
  http: typeof fetch = createCookieClient().http,
) {
  const response = await http(invitationPageUrl(invitationId), {
    redirect: "manual",
  });
  expect(response.status).toBe(200);
  return textOf(serverRenderedMarkupOf(await response.text()));
}

function organizationMutation(
  http: typeof fetch,
  path: "accept-invitation" | "cancel-invitation" | "remove-member" | "set-active",
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

function listOrganizationMembers(http: typeof fetch) {
  return http(new URL(`${organizationApi}/list-members`, process.env.BETTER_AUTH_URL), {
    headers: { origin: process.env.BETTER_AUTH_URL! },
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

test("a signed-out recipient can sign in or sign up and return to the Invitation", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  const response = await createCookieClient().http(invitationPageUrl(row.id), {
    redirect: "manual",
  });
  const html = await response.text();
  const redirect = encodeURIComponent(`/accept-invitation/${row.id}`);

  expect(response.status).toBe(200);
  expect(html).toContain(`href="/sign-in?redirect=${redirect}"`);
  expect(html).toContain(`href="/sign-up?redirect=${redirect}"`);
});

test("Better Auth refuses an Invitation when the signed-in email does not match", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  const response = await organizationMutation(fixture.member.http, "accept-invitation", {
    invitationId: row.id,
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
  });
});

test("a signed-in recipient accepts and reaches the inviting Organization", async () => {
  const [fixture, recipient] = await Promise.all([
    createOrganizationFixture(),
    createFixtureUser(),
  ]);
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
    email: recipient.user.email.toUpperCase(),
  });

  const accepted = await organizationMutation(recipient.http, "accept-invitation", {
    invitationId: row.id,
  });
  expect(accepted.status).toBe(200);

  const dashboard = await recipient.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(dashboard.status).toBe(200);
  expect(await dashboard.text()).toContain(fixture.organization.name);
});

test("a stranger signs up, verifies, accepts, and never receives onboarding", async () => {
  const fixture = await createOrganizationFixture();
  const nonce = randomUUID();
  const email = `invitation-recipient-${nonce}@example.com`;
  const password = `invitation-password-${nonce}`;
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
    email,
  });
  const http = createCookieClient().http;

  const signedUp = await postAuth(http, "/api/auth/sign-up/email", {
    name: `Invitation Recipient ${nonce}`,
    email,
    password,
  });
  expect(signedUp.status).toBe(200);

  const otp = await waitForVerificationOtp(email);
  const verified = await postAuth(http, "/api/auth/email-otp/verify-email", { email, otp });
  expect(verified.status).toBe(200);

  const signedIn = await postAuth(http, "/api/auth/sign-in/email", { email, password });
  expect(signedIn.status).toBe(200);

  const prepared = await prepareInvitationAcceptance(http, row.id);
  expect(prepared.status).toBe(200);
  expect(await prepared.json()).toEqual({
    status: "ready",
    organizationId: fixture.organization.id,
    alreadyMember: false,
  });

  const accepted = await organizationMutation(http, "accept-invitation", {
    invitationId: row.id,
  });
  expect(accepted.status).toBe(200);

  const onboarding = await http(new URL("/onboarding", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(onboarding.status).toBe(307);
  expect(onboarding.headers.get("location")).toBe("/dashboard/documents");

  const dashboard = await http(new URL("/dashboard/documents", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });
  expect(dashboard.status).toBe(200);
  expect(await dashboard.text()).toContain(fixture.organization.name);
});

test("an Invitation no longer needed lands in the Organization without a second Membership", async () => {
  const [fixture, recipient] = await Promise.all([
    createOrganizationFixture(),
    createFixtureUser(),
  ]);
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
    email: recipient.user.email,
  });
  const otherOrganization = await createOrganizationForFixtureUser(recipient.user.id);

  const firstAcceptance = await organizationMutation(recipient.http, "accept-invitation", {
    invitationId: row.id,
  });
  expect(firstAcceptance.status).toBe(200);

  const switchedAway = await organizationMutation(recipient.http, "set-active", {
    organizationId: otherOrganization.id,
  });
  expect(switchedAway.status).toBe(200);

  const page = await recipient.http(invitationPageUrl(row.id), { redirect: "manual" });
  expect(page.status).toBe(200);

  const prepared = await prepareInvitationAcceptance(recipient.http, row.id);
  expect(prepared.status).toBe(200);
  expect(await prepared.json()).toEqual({
    status: "ready",
    organizationId: fixture.organization.id,
    alreadyMember: true,
  });

  const active = await organizationMutation(recipient.http, "set-active", {
    organizationId: fixture.organization.id,
  });
  expect(active.status).toBe(200);

  const dashboard = await recipient.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(dashboard.status).toBe(200);
  expect(await dashboard.text()).toContain(fixture.organization.name);

  const membershipsResponse = await listOrganizationMembers(recipient.http);
  const listing = (await membershipsResponse.json()) as {
    members: Array<{ userId: string }>;
  };
  expect(
    listing.members.filter((membership) => membership.userId === recipient.user.id),
  ).toHaveLength(1);
});

test("the database refuses a second Membership for one User in one Organization", async () => {
  const fixture = await createOrganizationFixture();

  // Sanctioned ADR-0053 exception: reaching below HTTP only to prove the Membership constraint is
  // in SQL; the public accept flow pre-checks this state and cannot exercise its race backstop.
  let failure: unknown;
  try {
    await database.insert(member).values({
      organizationId: fixture.organization.id,
      userId: fixture.member.user.id,
      role: "member",
      createdAt: new Date(),
    });
  } catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({
    cause: { constraint: "member_organization_id_user_id_uidx" },
  });
});

test("a signed-in User with the wrong address sees their account and a way out", async () => {
  const fixture = await createOrganizationFixture();
  const row = await createFixtureInvitation({
    organizationId: fixture.organization.id,
    inviter: fixture.owner,
  });

  const copy = await invitationPageCopy(row.id, fixture.member.http);

  expect(copy).toContain("This account cannot accept the Invitation.");
  expect(copy).toContain(fixture.member.user.email);
  expect(copy).toContain("Sign out");
  expect(copy).not.toContain(row.email);
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
