import { expect, test } from "vitest";

import {
  createFixtureDocument,
  createFixtureUser,
  createOrganizationFixture,
  pool,
} from "../fixtures";

test("a fixture User fetches their own Better Auth session over HTTP", async () => {
  const fixture = await createFixtureUser();

  const response = await fixture.http(
    new URL("/api/auth/get-session", process.env.BETTER_AUTH_URL),
  );

  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({
    user: {
      id: fixture.user.id,
      email: fixture.user.email,
      name: fixture.user.name,
    },
  });
});

test("the Organization fixture returns three jars resolving to distinct Users and Roles", async () => {
  const fixture = await createOrganizationFixture();
  const actors = [
    [fixture.owner, "owner"],
    [fixture.admin, "admin"],
    [fixture.member, "member"],
  ] as const;
  const resolvedUserIds = new Set<string>();

  for (const [actor, expectedRole] of actors) {
    const [sessionResponse, roleResponse] = await Promise.all([
      actor.http(new URL("/api/auth/get-session", process.env.BETTER_AUTH_URL)),
      actor.http(
        new URL("/api/auth/organization/get-active-member-role", process.env.BETTER_AUTH_URL),
      ),
    ]);

    expect(sessionResponse.ok).toBe(true);
    expect(roleResponse.ok).toBe(true);

    const resolvedSession = (await sessionResponse.json()) as {
      user: { id: string };
    };
    resolvedUserIds.add(resolvedSession.user.id);

    expect(resolvedSession.user.id).toBe(actor.user.id);
    expect(await roleResponse.json()).toEqual({ role: expectedRole });
  }

  expect(resolvedUserIds.size).toBe(3);
});

test("Document fixtures use fresh uuidv7 ids and return the inserted rows", async () => {
  const fixture = await createOrganizationFixture();
  const firstDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const secondDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  expect(firstDocument.id).not.toBe(secondDocument.id);
  expect(firstDocument.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  expect(firstDocument.organizationId).toBe(fixture.organization.id);
  expect(firstDocument.createdBy).toBe(fixture.member.user.id);
});

test("fixture rows do not leak past the reset between tests", async () => {
  const counts = await pool.query<{
    users: string;
    organizations: string;
    documents: string;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM "user") AS users,
      (SELECT COUNT(*) FROM organization) AS organizations,
      (SELECT COUNT(*) FROM document) AS documents`,
  );

  expect(counts.rows[0]).toEqual({ users: "0", organizations: "0", documents: "0" });
});
