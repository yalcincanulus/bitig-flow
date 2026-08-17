import { and, eq } from "drizzle-orm";
import { expect } from "vitest";

import { member as membershipTable } from "#/server/db/schema";

import {
  createFixtureDocument,
  createFixtureUser,
  createOrganizationForFixtureUser,
  createOrganizationFixture,
  database,
} from "../fixtures";
import { callServerFunction } from "../fixtures/http";
import { test } from "./http";

async function expectSignInRedirect(response: Response) {
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
  expect(await response.text()).toBe("");
}

test("an anonymous Dashboard document request redirects to sign in before rendering", async ({
  http,
}) => {
  const response = await http(new URL("/dashboard/documents", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  await expectSignInRedirect(response);
});

test("an Organization member receives server-rendered Chrome but no Document pane data", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const response = await fixture.member.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const html = await response.text();
  const serverRenderedMarkup = html.replaceAll(/<script[\s\S]*?<\/script>/g, "");

  expect(response.status).toBe(200);
  expect(serverRenderedMarkup).toContain('data-slot="sidebar"');
  expect(serverRenderedMarkup).toContain('data-slot="skeleton"');
  expect(serverRenderedMarkup).toContain('aria-label="Loading Dashboard"');
  expect(serverRenderedMarkup).toContain(fixture.member.user.name);
  expect(serverRenderedMarkup).toContain(fixture.organization.name);
  expect(serverRenderedMarkup).not.toContain(">Documents</h1>");
  expect(html).not.toContain(fixtureDocument.title);
});

test("the Dashboard index redirects to Documents before rendering", async () => {
  const fixture = await createOrganizationFixture();

  const response = await fixture.member.http(new URL("/dashboard", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/dashboard/documents");
  expect(await response.text()).toBe("");
});

test("an authenticated User can list every Organization they belong to", async () => {
  const fixture = await createOrganizationFixture();
  const otherOrganization = await createOrganizationForFixtureUser(fixture.member.user.id);

  const response = await callServerFunction(fixture.member.http, {
    modulePath: "/src/server/functions/auth.ts",
    exportName: "listOrganizations",
    method: "GET",
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: fixture.organization.id, name: fixture.organization.name }),
      expect.objectContaining({ id: otherOrganization.id, name: otherOrganization.name }),
    ]),
  );
});

test("no memberships and eviction send Dashboard requests to onboarding", async () => {
  const userWithoutMemberships = await createFixtureUser();
  const organizationFixture = await createOrganizationFixture();

  await database
    .delete(membershipTable)
    .where(
      and(
        eq(membershipTable.userId, organizationFixture.member.user.id),
        eq(membershipTable.organizationId, organizationFixture.organization.id),
      ),
    );

  const responses = await Promise.all(
    [userWithoutMemberships.http, organizationFixture.member.http].map((http) =>
      http(new URL("/dashboard/documents", process.env.BETTER_AUTH_URL), {
        redirect: "manual",
      }),
    ),
  );

  for (const response of responses) {
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/onboarding");
    expect(await response.text()).toBe("");
  }
});

test("a User with memberships and no active Organization still reaches the Dashboard", async () => {
  const fixture = await createFixtureUser();
  const organization = await createOrganizationForFixtureUser(fixture.user.id);

  const response = await fixture.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain(organization.name);
  expect(html).toContain(">Sign out</");
});
