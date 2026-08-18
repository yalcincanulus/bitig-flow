import { expect, test } from "vitest";

import {
  createFixtureDocument,
  createFixtureLink,
  createFixturePendingDocument,
  createFixtureUser,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
  fixtureObjectExists,
  pool,
  readUploadSample,
} from "../fixtures";
import { storageKeyForDocument, storageKeyPrefix } from "#/lib/upload";

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

test("a pending PDF fixture can place real bytes at a Storage key", async () => {
  const fixture = await createOrganizationFixture();
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: readUploadSample("one-page.pdf"),
  });

  expect(pending.status).toBe("pending");
  expect(pending.kind).toBe("pdf");
  expect(pending.storageKey).toBe(
    storageKeyForDocument(fixture.organization.id, pending.id, storageKeyPrefix()),
  );
  expect(await fixtureObjectExists(pending.storageKey!)).toBe(true);
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

test("Vault, Vault membership, and Link fixtures return the rows they inserted", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const fixtureVault = await createFixtureVault({ organizationId: fixture.organization.id });
  const [membership, documentLink, vaultLink] = await Promise.all([
    createFixtureVaultItem({ vaultId: fixtureVault.id, documentId: fixtureDocument.id }),
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      documentId: fixtureDocument.id,
    }),
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      vaultId: fixtureVault.id,
    }),
  ]);

  expect(fixtureVault.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  expect(fixtureVault.organizationId).toBe(fixture.organization.id);
  expect(membership).toMatchObject({
    vaultId: fixtureVault.id,
    documentId: fixtureDocument.id,
  });
  expect(documentLink).toMatchObject({
    organizationId: fixture.organization.id,
    documentId: fixtureDocument.id,
    vaultId: null,
  });
  expect(vaultLink).toMatchObject({ vaultId: fixtureVault.id, documentId: null });
  expect(documentLink.slug).not.toBe(vaultLink.slug);
});

test("fixture rows do not leak past the reset between tests", async () => {
  const counts = await pool.query<{
    users: string;
    organizations: string;
    documents: string;
    vaults: string;
    vaultItems: string;
    links: string;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM "user") AS users,
      (SELECT COUNT(*) FROM organization) AS organizations,
      (SELECT COUNT(*) FROM document) AS documents,
      (SELECT COUNT(*) FROM vault) AS vaults,
      (SELECT COUNT(*) FROM vault_item) AS "vaultItems",
      (SELECT COUNT(*) FROM link) AS links`,
  );

  expect(counts.rows[0]).toEqual({
    users: "0",
    organizations: "0",
    documents: "0",
    vaults: "0",
    vaultItems: "0",
    links: "0",
  });
});
