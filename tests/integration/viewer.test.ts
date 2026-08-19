import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { document, link, visit } from "#/server/db/schema";
import { liveVisitRecordKey } from "#/server/viewer/live-visit-record";

import {
  createCookieClient,
  createFixtureDocument,
  createFixtureLink,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
  database,
  redis,
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

function cookieAttributes(setCookie: string) {
  return Object.fromEntries(
    setCookie
      .split(";")
      .slice(1)
      .map((part) => {
        const [name, ...rest] = part.trim().split("=");
        return [name?.toLowerCase(), rest.join("=") || true] as const;
      }),
  );
}

function cookiesNamed(response: Response, name: string) {
  return response.headers.getSetCookie().filter((header) => header.startsWith(`${name}=`));
}

test("GET of a public Link writes one Visit and reveals the sender plus the Target title", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
    name: distinctiveLinkName,
  });
  const client = createCookieClient();

  const response = await client.http(viewerUrl(published.slug), { redirect: "manual" });
  const html = await response.text();
  const markup = serverRenderedMarkupOf(html);

  expect(response.status).toBe(200);
  expect(textOf(markup)).toContain(`${fixture.member.user.name} at ${fixture.organization.name}`);
  expect(textOf(markup)).toContain(distinctiveTitle);
  expect(html).not.toContain(distinctiveLinkName);

  const visits = await database.select().from(visit).where(eq(visit.linkId, published.id));
  expect(visits).toHaveLength(1);
  expect(visits[0]?.visitorId).toEqual(expect.any(String));
  expect(visits[0]?.gateVersion).toBe(published.gateVersion);

  const opaqueId = (cookiesNamed(response, "visit")[0] ?? "").split("=")[1]?.split(";")[0] ?? "";
  expect(JSON.parse((await redis.get(liveVisitRecordKey(opaqueId))) ?? "null")).toEqual({
    visit_id: visits[0]?.id,
    link_id: published.id,
    gate_version: published.gateVersion,
  });
});

test("the same jar GET of a public Link does not write a second Visit", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
  });
  const client = createCookieClient();

  expect((await client.http(viewerUrl(published.slug), { redirect: "manual" })).status).toBe(200);
  expect((await client.http(viewerUrl(published.slug), { redirect: "manual" })).status).toBe(200);

  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, published.id)),
  ).toHaveLength(1);
});

test("the Visit cookie is HttpOnly, Path-scoped to the Slug, and is not sent to another Slug or Dashboard bytes", async () => {
  const fixture = await createOrganizationFixture();
  const [firstDocument, secondDocument] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      title: distinctiveTitle,
    }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      title: "Other Target",
    }),
  ]);
  const [firstLink, secondLink] = await Promise.all([
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      documentId: firstDocument.id,
    }),
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      documentId: secondDocument.id,
    }),
  ]);
  const client = createCookieClient();

  const response = await client.http(viewerUrl(firstLink.slug), { redirect: "manual" });
  const visitCookies = cookiesNamed(response, "visit");
  expect(visitCookies).toHaveLength(1);
  const attributes = cookieAttributes(visitCookies[0] ?? "");
  expect(attributes.httponly).toBe(true);
  expect(attributes.path).toBe(`/v/${firstLink.slug}`);
  expect(String(attributes.samesite).toLowerCase()).toBe("lax");

  const other = await client.http(viewerUrl(secondLink.slug), { redirect: "manual" });
  expect(other.status).toBe(200);
  expect(await database.select({ id: visit.id }).from(visit)).toHaveLength(2);

  const dashboardBytes = await client.http(
    new URL(`/api/documents/${firstDocument.id}/bytes`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  expect(dashboardBytes.status).toBe(307);
  expect(dashboardBytes.headers.get("location")).toBe("/sign-in");
});

test("visitor_id is minted when absent, stored on the Visit, and does not skip a password Requirement", async () => {
  const fixture = await createOrganizationFixture();
  const [publicDocument, gatedDocument] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      title: distinctiveTitle,
    }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      title: "Gated Target",
    }),
  ]);
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: publicDocument.id,
  });
  const gated = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: gatedDocument.id,
    passwordHash: "argon2-fixture-placeholder",
  });
  const client = createCookieClient();

  const response = await client.http(viewerUrl(published.slug), { redirect: "manual" });
  const visitorCookies = cookiesNamed(response, "visitor_id");
  expect(visitorCookies).toHaveLength(1);
  const attributes = cookieAttributes(visitorCookies[0] ?? "");
  expect(attributes.path).toBe("/");
  expect(attributes.httponly).toBe(true);

  const [row] = await database.select().from(visit).where(eq(visit.linkId, published.id));
  const visitorId = decodeURIComponent(
    (visitorCookies[0] ?? "").split("=")[1]?.split(";")[0] ?? "",
  );
  expect(row?.visitorId).toBe(visitorId);

  const gatedResponse = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const gatedHtml = await gatedResponse.text();
  expect(gatedResponse.status).toBe(200);
  expect(serverRenderedMarkupOf(gatedHtml)).toMatch(/password/i);
  expect(gatedHtml).not.toContain("Gated Target");
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
});

test("visitor_id does not skip an email Requirement", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
  });
  const gated = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
    requiresEmail: true,
  });
  const client = createCookieClient();
  await client.jar.setCookie(`visitor_id=returning-visitor; Path=/`, process.env.BETTER_AUTH_URL!);

  const response = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
});

test("an empty Vault shows the empty-state line and a non-empty Vault does not list members", async () => {
  const fixture = await createOrganizationFixture();
  const emptyVault = await createFixtureVault({
    organizationId: fixture.organization.id,
    name: distinctiveVaultName,
  });
  const filledVault = await createFixtureVault({
    organizationId: fixture.organization.id,
    name: "Filled Data Room",
  });
  const memberDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
  });
  await createFixtureVaultItem({ vaultId: filledVault.id, documentId: memberDocument.id });
  const [emptyLink, filledLink] = await Promise.all([
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      vaultId: emptyVault.id,
    }),
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      vaultId: filledVault.id,
    }),
  ]);

  const emptyResponse = await createCookieClient().http(viewerUrl(emptyLink.slug), {
    redirect: "manual",
  });
  const emptyHtml = await emptyResponse.text();
  expect(emptyResponse.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(emptyHtml))).toContain("There's nothing in here yet.");
  expect(emptyHtml).toContain(distinctiveVaultName);

  const filledResponse = await createCookieClient().http(viewerUrl(filledLink.slug), {
    redirect: "manual",
  });
  const filledHtml = await filledResponse.text();
  expect(filledResponse.status).toBe(200);
  expect(filledHtml).toContain("Filled Data Room");
  expect(filledHtml).not.toContain(distinctiveTitle);
  expect(textOf(serverRenderedMarkupOf(filledHtml))).not.toContain("There's nothing in here yet.");
});

test("visit.ip_hash uses ANALYTICS_SALT, not GATE_RATELIMIT_SALT", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
  });
  const ip = "203.0.113.10";

  const response = await createCookieClient().http(viewerUrl(published.slug), {
    redirect: "manual",
    headers: { "x-forwarded-for": ip },
  });
  expect(response.status).toBe(200);

  const [row] = await database.select().from(visit).where(eq(visit.linkId, published.id));
  const analyticsHash = createHash("sha256")
    .update(`${process.env.ANALYTICS_SALT}${ip}`)
    .digest("hex");
  const rateLimitHash = createHash("sha256")
    .update(`${process.env.GATE_RATELIMIT_SALT}${ip}`)
    .digest("hex");

  expect(row?.ipHash).toBe(analyticsHash);
  expect(row?.ipHash).not.toBe(rateLimitHash);
});

test("the visit-creation limiter returns a typed limit on the page once the bucket is full", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
  });
  const ip = "203.0.113.80";

  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await createCookieClient().http(viewerUrl(published.slug), {
      redirect: "manual",
      headers: { "x-forwarded-for": ip },
    });
    expect(response.status).toBe(200);
  }

  const limited = await createCookieClient().http(viewerUrl(published.slug), {
    redirect: "manual",
    headers: { "x-forwarded-for": ip },
  });
  const html = await limited.text();

  expect(limited.headers.get("retry-after")).toEqual(expect.any(String));
  expect(textOf(serverRenderedMarkupOf(html))).toMatch(/too many attempts/i);
  expect(html).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, published.id)),
  ).toHaveLength(30);
});
