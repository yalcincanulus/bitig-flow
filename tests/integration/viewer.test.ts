import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { document, link, visit } from "#/server/db/schema";

import {
  createFixtureDocument,
  createFixtureLink,
  createFixtureVault,
  createOrganizationFixture,
  database,
} from "../fixtures";
import { test } from "./http";

const distinctiveTitle = "Series B Term Sheet";
const distinctiveVaultName = "Q3 Data Room";
const distinctiveLinkName = "Counsel share — do not forward";

function viewerUrl(slug: string, search = "") {
  return new URL(`/v/${slug}${search}`, process.env.BETTER_AUTH_URL);
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

async function getViewer(http: typeof fetch, slug: string, search = "") {
  return http(viewerUrl(slug, search), { redirect: "manual" });
}

test("unknown, expired, deactivated, rotated, and deleted-Target Slugs return byte-identical 404 bodies", async ({
  http,
}) => {
  const fixture = await createOrganizationFixture();
  const [expiredDocument, deactivatedDocument, rotatedDocument, deletedDocument] =
    await Promise.all(
      Array.from({ length: 4 }, () =>
        createFixtureDocument({
          organizationId: fixture.organization.id,
          createdBy: fixture.member.user.id,
          title: distinctiveTitle,
        }),
      ),
    );

  const expired = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: expiredDocument.id,
    expiresAt: new Date(0),
  });
  const deactivated = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: deactivatedDocument.id,
    isActive: false,
  });
  const rotated = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: rotatedDocument.id,
  });
  const retiredSlug = rotated.slug;
  await database.update(link).set({ slug: "rotatedslug1" }).where(eq(link.id, rotated.id));

  const deletedTarget = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: deletedDocument.id,
  });
  const deletedTargetSlug = deletedTarget.slug;
  await database.delete(document).where(eq(document.id, deletedDocument.id));

  const slugs = ["unknownslug1", expired.slug, deactivated.slug, retiredSlug, deletedTargetSlug];
  const responses = await Promise.all(slugs.map((slug) => getViewer(http, slug)));
  const bodies = await Promise.all(responses.map((response) => response.text()));
  const markup = bodies.map(serverRenderedMarkupOf);

  for (const response of responses) {
    expect(response.status).toBe(404);
  }

  expect(new Set(markup).size).toBe(1);
  expect(textOf(markup[0] ?? "")).toContain(
    "This link isn't available. Ask whoever sent it to you for a new one.",
  );
  expect(markup[0]).toContain("bitig");
  for (const body of bodies) {
    expect(body).not.toContain(fixture.member.user.name);
    expect(body).not.toContain(fixture.organization.name);
    expect(body).not.toMatch(/this slug was rotated/i);
  }
  expect(markup[0]).not.toMatch(/request access/i);
  expect(markup[0]).not.toContain("og:");
  expect(markup[0]).toContain('name="robots"');
  expect(markup[0]).toContain("noindex, nofollow");

  expect(await database.select({ id: visit.id }).from(visit)).toEqual([]);
});

test("a password Gate GET never contains the Target title, a Vault name, or the Link's owner-facing name", async ({
  http,
}) => {
  const fixture = await createOrganizationFixture();
  await createFixtureVault({
    organizationId: fixture.organization.id,
    name: distinctiveVaultName,
  });
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
  });
  const gated = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
    name: distinctiveLinkName,
    passwordHash: "argon2-fixture-placeholder",
  });

  const response = await getViewer(http, gated.slug);
  const html = await response.text();
  const markup = serverRenderedMarkupOf(html);

  expect(response.status).toBe(200);
  expect(html).not.toContain(distinctiveTitle);
  expect(html).not.toContain(distinctiveVaultName);
  expect(html).not.toContain(distinctiveLinkName);
  expect(textOf(markup)).toContain(`${fixture.member.user.name} at ${fixture.organization.name}`);
  expect(markup).toContain("bitig");
  expect(markup).toContain('name="robots"');
  expect(markup).toContain("noindex, nofollow");
  expect(markup).not.toContain("og:");
  expect(markup).toMatch(/h-14/);
  const csp = response.headers.get("content-security-policy") ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).not.toContain(new URL(process.env.S3_ENDPOINT ?? "http://127.0.0.1:3900").origin);
  expect(await database.select({ id: visit.id }).from(visit)).toEqual([]);
});

test("a Gate GET names only the Organization when the creator is gone", async ({ http }) => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
  });
  const gated = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: null,
    documentId: documentRow.id,
    name: distinctiveLinkName,
    passwordHash: "argon2-fixture-placeholder",
  });

  const response = await getViewer(http, gated.slug, "?utm=1");
  const html = await response.text();
  const markup = serverRenderedMarkupOf(html);

  expect(response.status).toBe(200);
  expect(textOf(markup)).toContain(fixture.organization.name);
  expect(textOf(markup)).not.toContain(" at ");
  expect(html).not.toContain(fixture.member.user.name);
  expect(html).not.toContain(distinctiveTitle);
  expect(await database.select({ id: visit.id }).from(visit)).toEqual([]);
});
