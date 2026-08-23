import { and, eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { member as membershipTable } from "#/server/db/schema";
import type { DocumentId, OrganizationId } from "#/server/ids";
import { findDocument } from "#/server/repositories/documents";

import {
  callServerFunction,
  createCookieClient,
  createFixtureDocument,
  createFixtureUser,
  createOrganizationFixture,
  database,
} from "../fixtures";

const documentsModulePath = "/src/server/functions/documents.ts";

function expectSignInRedirect(response: Response) {
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
}

test("a request with no session is redirected to sign in", async () => {
  const client = createCookieClient();
  const request = callServerFunction(client.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });

  const response = await request;

  expectSignInRedirect(response);
  expect(await response.text()).toBe("");
});

test("no memberships and eviction both redirect listDocuments to onboarding", async () => {
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

  const [noMembershipsResponse, evictedResponse] = await Promise.all([
    callServerFunction(userWithoutMemberships.http, {
      modulePath: documentsModulePath,
      exportName: "listDocuments",
      method: "GET",
    }),
    callServerFunction(organizationFixture.member.http, {
      modulePath: documentsModulePath,
      exportName: "listDocuments",
      method: "GET",
    }),
  ]);

  expect(noMembershipsResponse.status).toBe(307);
  expect(noMembershipsResponse.headers.get("location")).toBe("/onboarding");
  expect(evictedResponse.status).toBe(307);
  expect(evictedResponse.headers.get("location")).toBe("/onboarding");
});

test("Better Auth refuses Organization updates for a member and allows an admin", async () => {
  const fixture = await createOrganizationFixture();
  const endpoint = new URL("/api/auth/organization/update", process.env.BETTER_AUTH_URL);
  const update = (http: typeof fetch, name: string) =>
    http(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: process.env.BETTER_AUTH_URL!,
      },
      body: JSON.stringify({
        organizationId: fixture.organization.id,
        data: { name },
      }),
    });

  const memberResponse = await update(fixture.member.http, "Member update");
  const adminResponse = await update(fixture.admin.http, "Admin update");

  expect(memberResponse.status).toBe(403);
  expect(await memberResponse.json()).toMatchObject({
    code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION",
  });
  expect(adminResponse.status).toBe(200);
  expect(await adminResponse.json()).toMatchObject({
    name: "Admin update",
    slug: fixture.organization.slug,
  });
});

test("a Document from another Organization is not found and not forbidden over HTTP", async () => {
  const [firstOrganization, secondOrganization] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const secondOrganizationDocument = await createFixtureDocument({
    organizationId: secondOrganization.organization.id,
    createdBy: secondOrganization.member.user.id,
  });

  const response = await callServerFunction(firstOrganization.member.http, {
    modulePath: documentsModulePath,
    exportName: "getDocument",
    method: "GET",
    data: { documentId: secondOrganizationDocument.id },
  });
  const failure = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(404);
  expect(failure).toMatchObject({ isNotFound: true });
  expect(failure).not.toMatchObject({ code: "FORBIDDEN" });
});

test("a member fetches their Organization's Document and a corrupt fresh Role throws", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const successResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "getDocument",
    method: "GET",
    data: { documentId: fixtureDocument.id },
  });

  expect(successResponse.ok).toBe(true);
  expect(await successResponse.json()).toMatchObject({
    id: fixtureDocument.id,
    organizationId: fixture.organization.id,
    title: fixtureDocument.title,
  });

  await database
    .update(membershipTable)
    .set({ role: "corrupt-role" })
    .where(
      and(
        eq(membershipTable.userId, fixture.member.user.id),
        eq(membershipTable.organizationId, fixture.organization.id),
      ),
    );

  const corruptRoleResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "getDocument",
    method: "GET",
    data: { documentId: fixtureDocument.id },
  });

  expect(corruptRoleResponse.status).toBe(500);
});

test("a Document from another Organization is invisible at the repository seam", async () => {
  const [firstOrganization, secondOrganization] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const secondOrganizationDocument = await createFixtureDocument({
    organizationId: secondOrganization.organization.id,
    createdBy: secondOrganization.member.user.id,
  });

  // Sanctioned ADR-0053 exception: this test reaches below HTTP only to prove the scope is in SQL.
  const found = await findDocument(
    firstOrganization.organization.id as OrganizationId,
    secondOrganizationDocument.id as DocumentId,
  );

  expect(found).toBeUndefined();
});
