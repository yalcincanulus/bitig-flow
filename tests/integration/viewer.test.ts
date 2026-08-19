import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { viewerBytesUrl } from "#/lib/document-bytes";
import { document, documentReference, link, visit, visitEvent } from "#/server/db/schema";
import { hashSharePassword } from "#/server/share-password-hash";
import { credentialGuessLimitKey } from "#/server/viewer/credential-guess-limit";
import { formSubmissionLimitKey } from "#/server/viewer/form-submission-limit";
import { gateProgressRecordKey } from "#/server/viewer/gate-progress";
import { liveVisitRecordKey } from "#/server/viewer/live-visit-record";

import {
  callServerFunction,
  createCookieClient,
  createFixtureDocument,
  createFixtureLink,
  createFixtureUploadedDocument,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
  database,
  readUploadSample,
  redis,
} from "../fixtures";
import { mailpitBaseUrl } from "./environment";
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

test("GET of a public markdown Link renders the Document and resolves images through the byte route", async () => {
  const fixture = await createOrganizationFixture();
  const [logo, gone] = await Promise.all([
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      contentType: "image/png",
      fileName: "logo.png",
      bytes: readUploadSample("pixel.png"),
    }),
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      contentType: "image/png",
      fileName: "gone.png",
      bytes: readUploadSample("pixel.png"),
    }),
  ]);
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
    content: [
      "The indemnity survives closing.",
      `![logo](doc/${logo.id})`,
      "![beacon](https://evil.example/pixel.png)",
      "![broken](doc/not-a-uuid)",
      `![gone](doc/${gone.id})`,
    ].join("\n\n"),
  });
  await database.insert(documentReference).values({
    sourceDocumentId: documentRow.id,
    targetDocumentId: logo.id,
  });
  await database.insert(documentReference).values({
    sourceDocumentId: documentRow.id,
    targetDocumentId: gone.id,
  });
  await database.delete(document).where(eq(document.id, gone.id));
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
  });

  const response = await createCookieClient().http(viewerUrl(published.slug), {
    redirect: "manual",
  });
  const html = await response.text();
  const markup = serverRenderedMarkupOf(html);

  expect(response.status).toBe(200);
  expect(textOf(markup)).toContain(`${fixture.member.user.name} at ${fixture.organization.name}`);
  expect(textOf(markup)).toContain(distinctiveTitle);
  expect(markup).toContain("<p>The indemnity survives closing.</p>");
  expect(markup).toContain(`<img src="${viewerBytesUrl(published.slug, logo.id)}" alt="logo">`);
  expect(markup).not.toContain("evil.example");
  expect(markup).not.toContain('<img src="https://');
  expect(textOf(markup)).toContain("beacon");
  expect(markup).not.toContain("doc/not-a-uuid");
  expect(textOf(markup)).toContain("broken");
  expect(markup).not.toContain(gone.id);
  expect(textOf(markup)).toContain("gone");
});

test("opening a markdown Document appends document_opened once per open, including a revisit", async () => {
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

  const events = await database
    .select({ type: visitEvent.type, documentId: visitEvent.documentId })
    .from(visitEvent)
    .innerJoin(visit, eq(visit.id, visitEvent.visitId))
    .where(eq(visit.linkId, published.id));

  expect(events).toEqual([
    { type: "document_opened", documentId: documentRow.id },
    { type: "document_opened", documentId: documentRow.id },
  ]);
});

test("GET of a public pdf Link renders the title and page count, and an image Link renders the title", async () => {
  const fixture = await createOrganizationFixture();
  const [pdf, image] = await Promise.all([
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      contentType: "application/pdf",
      fileName: "term-sheet.pdf",
      bytes: readUploadSample("two-page.pdf"),
    }),
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      contentType: "image/png",
      fileName: "screenshot.png",
      bytes: readUploadSample("pixel.png"),
    }),
  ]);
  await database.update(document).set({ pageCount: 2 }).where(eq(document.id, pdf.id));
  const [pdfLink, imageLink] = await Promise.all([
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      documentId: pdf.id,
    }),
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      documentId: image.id,
    }),
  ]);

  const pdfResponse = await createCookieClient().http(viewerUrl(pdfLink.slug), {
    redirect: "manual",
  });
  const pdfMarkup = serverRenderedMarkupOf(await pdfResponse.text());
  expect(pdfResponse.status).toBe(200);
  expect(textOf(pdfMarkup)).toContain("term-sheet.pdf");
  expect(textOf(pdfMarkup)).toContain("2 pages");

  const imageResponse = await createCookieClient().http(viewerUrl(imageLink.slug), {
    redirect: "manual",
  });
  const imageMarkup = serverRenderedMarkupOf(await imageResponse.text());
  expect(imageResponse.status).toBe(200);
  expect(textOf(imageMarkup)).toContain("screenshot.png");
});

test("opening a Vault Link writes no document_opened", async () => {
  const fixture = await createOrganizationFixture();
  const vault = await createFixtureVault({
    organizationId: fixture.organization.id,
    name: distinctiveVaultName,
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    vaultId: vault.id,
  });

  expect(
    (await createCookieClient().http(viewerUrl(published.slug), { redirect: "manual" })).status,
  ).toBe(200);
  expect(
    await database
      .select({ id: visitEvent.id })
      .from(visitEvent)
      .innerJoin(visit, eq(visit.id, visitEvent.visitId))
      .where(eq(visit.linkId, published.id)),
  ).toEqual([]);
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

function emailStepCopy(html: string) {
  return textOf(serverRenderedMarkupOf(html));
}

test("capture-only email GET names the sender, promises no mail, and writes no Visit", async ({
  http,
}) => {
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
    name: distinctiveLinkName,
    requiresEmail: true,
  });

  const response = await getViewer(http, gated.slug);
  const html = await response.text();
  const copy = emailStepCopy(html);

  expect(response.status).toBe(200);
  expect(copy).toContain(`${fixture.member.user.name} at ${fixture.organization.name}`);
  expect(copy).toMatch(/wants to know who opened this/i);
  expect(copy).toMatch(/no account/i);
  expect(copy).toMatch(/no password/i);
  expect(copy).toMatch(/won'?t email you|will not email you/i);
  expect(html).not.toMatch(/type="password"/i);
  expect(copy).not.toMatch(/sign in/i);
  expect(html).not.toContain(distinctiveTitle);
  expect(html).not.toContain(distinctiveLinkName);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
});

test("verification-to-follow email GET promises a 6-digit code and writes no Visit", async ({
  http,
}) => {
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
    requiresVerification: true,
  });

  const response = await getViewer(http, gated.slug);
  const html = await response.text();
  const copy = emailStepCopy(html);

  expect(response.status).toBe(200);
  expect(copy).toContain(`${fixture.member.user.name} at ${fixture.organization.name}`);
  expect(copy).toMatch(/wants to know who opened this/i);
  expect(copy).toMatch(/6-digit code/i);
  expect(copy).not.toMatch(/won'?t email you|will not email you/i);
  expect(html).not.toMatch(/type="password"/i);
  expect(copy).not.toMatch(/sign in/i);
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

async function postPassword(
  http: typeof fetch,
  slug: string,
  password: string,
  extra: { step?: string; ip?: string } = {},
) {
  return http(viewerUrl(slug), {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(extra.ip ? { "x-forwarded-for": extra.ip } : {}),
    },
    body: new URLSearchParams({ step: extra.step ?? "password", password }),
  });
}

test("the password form POSTs to the Slug, not to a server-function URL", async ({ http }) => {
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
    passwordHash: await hashSharePassword("launch-gate"),
  });

  const html = await (await getViewer(http, gated.slug)).text();
  const markup = serverRenderedMarkupOf(html);
  expect(markup).toMatch(/<form[^>]*method="post"/i);
  expect(markup).not.toMatch(/\/_serverFn/);
});

test("a wrong password re-renders the step, does not advance the Receipt, and writes no Visit", async () => {
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
    passwordHash: await hashSharePassword("launch-gate"),
    requiresEmail: true,
  });
  const client = createCookieClient();

  const response = await postPassword(client.http, gated.slug, "wrong-password");
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(html))).toContain("Wrong password.");
  expect(html).not.toContain("Password accepted");
  expect(html).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
});

test("a right password on a password-only Link mints a Visit, sets the visit cookie, and 303s to the reveal", async () => {
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
    passwordHash: await hashSharePassword("launch-gate"),
  });
  const client = createCookieClient();

  const posted = await postPassword(client.http, gated.slug, "launch-gate");
  expect(posted.status).toBe(303);
  expect(new URL(posted.headers.get("location") ?? "", process.env.BETTER_AUTH_URL).pathname).toBe(
    `/v/${gated.slug}`,
  );

  const visitCookies = cookiesNamed(posted, "visit");
  expect(visitCookies).toHaveLength(1);
  expect(cookieAttributes(visitCookies[0] ?? "").path).toBe(`/v/${gated.slug}`);

  const revealed = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const html = await revealed.text();
  expect(revealed.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(html))).toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toHaveLength(1);
  expect(
    await database
      .select({ type: visitEvent.type, documentId: visitEvent.documentId })
      .from(visitEvent)
      .innerJoin(visit, eq(visit.id, visitEvent.visitId))
      .where(eq(visit.linkId, gated.id)),
  ).toEqual([{ type: "document_opened", documentId: documentRow.id }]);
});

test("a right password on a Link that still has Requirements sets Gate progress and the next GET shows the Receipt", async () => {
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
    passwordHash: await hashSharePassword("launch-gate"),
    requiresEmail: true,
  });
  const client = createCookieClient();

  const posted = await postPassword(client.http, gated.slug, "launch-gate");
  expect(posted.status).toBe(303);

  const gateCookies = cookiesNamed(posted, "gate");
  expect(gateCookies).toHaveLength(1);
  const attributes = cookieAttributes(gateCookies[0] ?? "");
  expect(attributes.httponly).toBe(true);
  expect(attributes.path).toBe(`/v/${gated.slug}`);
  const opaqueId = decodeURIComponent((gateCookies[0] ?? "").split("=")[1]?.split(";")[0] ?? "");
  expect(JSON.parse((await redis.get(gateProgressRecordKey(opaqueId))) ?? "null")).toEqual({
    link_id: gated.id,
    gate_version: gated.gateVersion,
    password: true,
    email: null,
    code_hash: null,
    code_attempts: 0,
    code_sent_at: null,
    code_expires_at: null,
  });

  const next = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const html = await next.text();
  expect(next.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(html))).toContain("Password accepted");
  expect(html).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
});

test("an out-of-order password POST is rejected and the current step is unchanged", async () => {
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

  const response = await postPassword(client.http, gated.slug, "launch-gate");
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).not.toContain("Password accepted");
  expect(html).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
});

test("ten wrong guesses in 15 minutes return 429 with Retry-After; a correct password deletes the credential key", async () => {
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
    passwordHash: await hashSharePassword("launch-gate"),
  });
  const attackerIp = "203.0.113.81";
  const salt = process.env.GATE_RATELIMIT_SALT!;
  const client = createCookieClient();

  for (let attempt = 0; attempt < 10; attempt++) {
    const wrong = await postPassword(client.http, gated.slug, "wrong-password", { ip: attackerIp });
    expect(wrong.status).toBe(200);
    expect(textOf(serverRenderedMarkupOf(await wrong.text()))).toContain("Wrong password.");
  }

  const limited = await postPassword(createCookieClient().http, gated.slug, "wrong-password", {
    ip: attackerIp,
  });
  const limitedHtml = await limited.text();
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toEqual(expect.any(String));
  expect(textOf(serverRenderedMarkupOf(limitedHtml))).toMatch(/too many attempts/i);
  expect(limitedHtml).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
  expect(await redis.get(credentialGuessLimitKey(gated.id, attackerIp, salt))).not.toBeNull();

  const accepted = await postPassword(createCookieClient().http, gated.slug, "launch-gate", {
    ip: attackerIp,
  });
  expect(accepted.status).toBe(303);
  expect(await redis.get(credentialGuessLimitKey(gated.id, attackerIp, salt))).toBeNull();
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toHaveLength(1);
});

async function postEmail(
  http: typeof fetch,
  slug: string,
  email: string,
  extra: { step?: string; ip?: string } = {},
) {
  return http(viewerUrl(slug), {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(extra.ip ? { "x-forwarded-for": extra.ip } : {}),
    },
    body: new URLSearchParams({ step: extra.step ?? "email", email }),
  });
}

test("the email form POSTs to the Slug, not to a server-function URL", async ({ http }) => {
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

  const html = await (await getViewer(http, gated.slug)).text();
  const markup = serverRenderedMarkupOf(html);
  expect(markup).toMatch(/<form[^>]*method="post"/i);
  expect(markup).toMatch(/name="email"/i);
  expect(markup).not.toMatch(/\/_serverFn/);
});

test("capture-only submit mints a Visit with the normalized address and email_verified false", async () => {
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

  const posted = await postEmail(client.http, gated.slug, "  Alex.Visitor@Example.COM  ");
  expect(posted.status).toBe(303);
  expect(new URL(posted.headers.get("location") ?? "", process.env.BETTER_AUTH_URL).pathname).toBe(
    `/v/${gated.slug}`,
  );

  const visitCookies = cookiesNamed(posted, "visit");
  expect(visitCookies).toHaveLength(1);

  const revealed = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  expect(revealed.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(await revealed.text()))).toContain(distinctiveTitle);

  const visits = await database.select().from(visit).where(eq(visit.linkId, gated.id));
  expect(visits).toHaveLength(1);
  expect(visits[0]?.email).toBe("alex.visitor@example.com");
  expect(visits[0]?.emailVerified).toBe(false);
});

test("a password Receipt is listed on the email step, and capture-only still mints the Visit", async () => {
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
    passwordHash: await hashSharePassword("launch-gate"),
    requiresEmail: true,
  });
  const client = createCookieClient();

  expect((await postPassword(client.http, gated.slug, "launch-gate")).status).toBe(303);
  const emailStep = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const emailHtml = await emailStep.text();
  expect(textOf(serverRenderedMarkupOf(emailHtml))).toContain("Password accepted");
  expect(emailHtml).toMatch(/wants to know who opened this/i);
  expect(emailHtml).not.toContain(distinctiveTitle);

  expect((await postEmail(client.http, gated.slug, "visitor@example.com")).status).toBe(303);
  const visits = await database.select().from(visit).where(eq(visit.linkId, gated.id));
  expect(visits).toHaveLength(1);
  expect(visits[0]?.email).toBe("visitor@example.com");
  expect(visits[0]?.emailVerified).toBe(false);
});

async function waitForShareAccessCode(email: string) {
  const mailpitUrl = mailpitBaseUrl(process.env);
  const query = `to:${email}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    const searchResponse = await fetch(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(query)}`,
    );
    if (searchResponse.ok) {
      const { messages } = (await searchResponse.json()) as {
        messages: Array<{ ID: string; Subject: string }>;
      };
      const shareCode = messages.find((message) => message.Subject.includes("share access code"));
      expect(messages.some((message) => message.Subject.includes("verification code"))).toBe(false);
      if (shareCode) {
        const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${shareCode.ID}`);
        const message = (await messageResponse.json()) as { Subject: string; Text: string };
        const match = /Your share access code is (\d{6})/.exec(message.Text);
        if (match?.[1]) return { code: match[1], subject: message.Subject };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No share access code arrived for ${email}`);
}

test("verification-to-follow submit stores the address on Gate progress and writes no Visit", async () => {
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
    requiresVerification: true,
  });
  const client = createCookieClient();

  const posted = await postEmail(client.http, gated.slug, "  Visitor@Example.COM ");
  expect(posted.status).toBe(303);

  const mailed = await waitForShareAccessCode("visitor@example.com");
  expect(mailed.subject).not.toMatch(/verification code/i);

  const gateCookies = cookiesNamed(posted, "gate");
  expect(gateCookies).toHaveLength(1);
  const opaqueId = decodeURIComponent((gateCookies[0] ?? "").split("=")[1]?.split(";")[0] ?? "");
  const progress = JSON.parse((await redis.get(gateProgressRecordKey(opaqueId))) ?? "null") as {
    link_id: string;
    gate_version: number;
    password: boolean;
    email: string;
    code_hash: string | null;
  };
  expect(progress).toMatchObject({
    link_id: gated.id,
    gate_version: gated.gateVersion,
    password: false,
    email: "visitor@example.com",
  });
  expect(progress.code_hash).toEqual(expect.any(String));
  expect(progress.code_hash).not.toContain(mailed.code);

  const next = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const html = await next.text();
  const copy = textOf(serverRenderedMarkupOf(html));
  expect(next.status).toBe(200);
  expect(copy).toContain("visitor@example.com");
  expect(copy).toContain("v*****r@example.com");
  expect(html).toMatch(/name="code"/i);
  expect(html).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
});

test("twenty email submissions in 15 minutes return 429; success does not reset that key", async () => {
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
    requiresVerification: true,
  });
  const attackerIp = "203.0.113.82";
  const salt = process.env.GATE_RATELIMIT_SALT!;

  const first = await postEmail(createCookieClient().http, gated.slug, "one@example.com", {
    ip: attackerIp,
  });
  expect(first.status).toBe(303);
  expect(await redis.get(formSubmissionLimitKey(gated.id, attackerIp, salt))).not.toBeNull();

  for (let attempt = 1; attempt < 20; attempt++) {
    const submitted = await postEmail(
      createCookieClient().http,
      gated.slug,
      `visitor-${attempt}@example.com`,
      { ip: attackerIp },
    );
    expect(submitted.status).toBe(303);
  }

  const limited = await postEmail(createCookieClient().http, gated.slug, "too-many@example.com", {
    ip: attackerIp,
  });
  const limitedHtml = await limited.text();
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toEqual(expect.any(String));
  expect(textOf(serverRenderedMarkupOf(limitedHtml))).toMatch(/too many attempts/i);
  expect(limitedHtml).not.toContain(distinctiveTitle);
  expect(await redis.get(formSubmissionLimitKey(gated.id, attackerIp, salt))).not.toBeNull();
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);
});

async function postCode(
  http: typeof fetch,
  slug: string,
  code: string,
  extra: { ip?: string } = {},
) {
  return http(viewerUrl(slug), {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(extra.ip ? { "x-forwarded-for": extra.ip } : {}),
    },
    body: new URLSearchParams({ step: "code", code }),
  });
}

async function postResend(http: typeof fetch, slug: string) {
  return http(viewerUrl(slug), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ step: "resend" }),
  });
}

async function gateCookieValue(client: ReturnType<typeof createCookieClient>, slug: string) {
  const cookies = await client.jar.getCookies(viewerUrl(slug).toString());
  return cookies.find((cookie) => cookie.key === "gate")?.value ?? "";
}

async function ageGateProgress(opaqueId: string, patch: Record<string, unknown>) {
  const key = gateProgressRecordKey(opaqueId);
  const current = JSON.parse((await redis.get(key)) ?? "null") as Record<string, unknown>;
  await redis.set(key, JSON.stringify({ ...current, ...patch }));
}

async function shareAccessCodeCount(email: string) {
  const mailpitUrl = mailpitBaseUrl(process.env);
  const searchResponse = await fetch(
    `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  );
  const { messages } = (await searchResponse.json()) as {
    messages: Array<{ Subject: string }>;
  };
  return messages.filter((message) => message.Subject.includes("share access code")).length;
}

async function waitForShareAccessCodeCount(email: string, count: number) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await shareAccessCodeCount(email)) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Expected ${count} share access codes for ${email}`);
}

test("a wrong code shows remaining tries, five failures lock, and an expired code says so", async () => {
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
    requiresVerification: true,
  });
  const client = createCookieClient();

  expect((await postEmail(client.http, gated.slug, "visitor@example.com")).status).toBe(303);
  await waitForShareAccessCode("visitor@example.com");

  const firstWrong = await postCode(client.http, gated.slug, "000000");
  expect(textOf(serverRenderedMarkupOf(await firstWrong.text()))).toContain(
    "Wrong code. 4 tries left.",
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    const wrong = await postCode(client.http, gated.slug, "000000");
    expect(textOf(serverRenderedMarkupOf(await wrong.text()))).toMatch(/Wrong code/);
  }

  const locked = await postCode(client.http, gated.slug, "000000");
  expect(textOf(serverRenderedMarkupOf(await locked.text()))).toMatch(/Too many tries/i);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toEqual([]);

  const expiredClient = createCookieClient();
  expect((await postEmail(expiredClient.http, gated.slug, "aged@example.com")).status).toBe(303);
  await waitForShareAccessCode("aged@example.com");
  await ageGateProgress(await gateCookieValue(expiredClient, gated.slug), { code_expires_at: 1 });
  const expired = await postCode(expiredClient.http, gated.slug, "123456");
  expect(textOf(serverRenderedMarkupOf(await expired.text()))).toMatch(/expired/i);
}, 15_000);

test("resend is disabled for 60 seconds on the same Gate-progress record, and clearing cookies starts over", async () => {
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
    requiresVerification: true,
  });
  const client = createCookieClient();

  const first = await postEmail(client.http, gated.slug, "visitor@example.com");
  expect(first.status).toBe(303);
  const opaqueId = await gateCookieValue(client, gated.slug);
  await waitForShareAccessCode("visitor@example.com");

  const codeStep = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  expect(await codeStep.text()).toMatch(/<button[^>]*disabled[^>]*>\s*Resend code/i);

  const blocked = await postResend(client.http, gated.slug);
  expect(blocked.status).toBe(200);
  expect(await shareAccessCodeCount("visitor@example.com")).toBe(1);
  expect(await gateCookieValue(client, gated.slug)).toBe(opaqueId);

  await ageGateProgress(opaqueId, { code_sent_at: 1 });
  const resent = await postResend(client.http, gated.slug);
  expect(resent.status).toBe(303);
  expect(await gateCookieValue(client, gated.slug)).toBe(opaqueId);
  await waitForShareAccessCodeCount("visitor@example.com", 2);

  const fresh = createCookieClient();
  const restart = await fresh.http(viewerUrl(gated.slug), { redirect: "manual" });
  const restartHtml = await restart.text();
  expect(textOf(serverRenderedMarkupOf(restartHtml))).toMatch(/wants to know who opened this/i);
  expect(restartHtml).not.toMatch(/name="code"/i);
}, 15_000);

test("the sixth code send to one address in an hour keeps the screen and sends no mail", async () => {
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
    requiresVerification: true,
  });
  const address = "capped@example.com";

  for (let send = 0; send < 5; send++) {
    expect((await postEmail(createCookieClient().http, gated.slug, address)).status).toBe(303);
  }
  await waitForShareAccessCodeCount(address, 5);
  expect(await shareAccessCodeCount(address)).toBe(5);

  const sixth = createCookieClient();
  const posted = await postEmail(sixth.http, gated.slug, address);
  expect(posted.status).toBe(303);
  const next = await sixth.http(viewerUrl(gated.slug), { redirect: "manual" });
  const html = await next.text();
  expect(next.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(html))).toMatch(/6-digit code/i);
  expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Resend code/i);
  expect(html).not.toContain(distinctiveTitle);
  expect(await shareAccessCodeCount(address)).toBe(5);

  const guessed = await postCode(sixth.http, gated.slug, "000000");
  const guessedCopy = textOf(serverRenderedMarkupOf(await guessed.text()));
  expect(guessedCopy).toContain("Wrong code. 4 tries left.");
  expect(guessedCopy).not.toMatch(/expired/i);
}, 20_000);

test("password then email then code mints a verified Visit and the next GET is the reveal", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    title: distinctiveTitle,
    content: "Fixture document content.",
  });
  const gated = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
    passwordHash: await hashSharePassword("launch-gate"),
    requiresEmail: true,
    requiresVerification: true,
  });
  const client = createCookieClient();

  expect((await postPassword(client.http, gated.slug, "launch-gate")).status).toBe(303);
  expect((await postEmail(client.http, gated.slug, "journey@example.com")).status).toBe(303);
  const mailed = await waitForShareAccessCode("journey@example.com");

  const posted = await postCode(client.http, gated.slug, mailed.code);
  expect(posted.status).toBe(303);
  expect(new URL(posted.headers.get("location") ?? "", process.env.BETTER_AUTH_URL).pathname).toBe(
    `/v/${gated.slug}`,
  );
  const visitCookies = cookiesNamed(posted, "visit");
  expect(visitCookies).toHaveLength(1);
  expect(cookieAttributes(visitCookies[0] ?? "").path).toBe(`/v/${gated.slug}`);

  const revealed = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const html = await revealed.text();
  const copy = textOf(serverRenderedMarkupOf(html));
  expect(revealed.status).toBe(200);
  expect(copy).toContain(`${fixture.member.user.name} at ${fixture.organization.name}`);
  expect(copy).toContain(distinctiveTitle);
  expect(copy).toContain("Fixture document content.");

  const visits = await database.select().from(visit).where(eq(visit.linkId, gated.id));
  expect(visits).toHaveLength(1);
  expect(visits[0]?.email).toBe("journey@example.com");
  expect(visits[0]?.emailVerified).toBe(true);
}, 15_000);

const linksModulePath = "/src/server/functions/links.ts";

async function updateOwnedLink(
  http: typeof fetch,
  linkRow: { id: string; name: string | null },
  patch: {
    password?: string | null;
    requiresEmail?: boolean;
    requiresVerification?: boolean;
    allowDownload?: boolean;
    expiresAt?: string | null;
    isActive?: boolean;
  },
) {
  return callServerFunction(http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId: linkRow.id,
      name: linkRow.name,
      requiresEmail: patch.requiresEmail ?? false,
      requiresVerification: patch.requiresVerification ?? false,
      allowDownload: patch.allowDownload ?? false,
      expiresAt: patch.expiresAt ?? null,
      isActive: patch.isActive ?? true,
      ...(patch.password !== undefined ? { password: patch.password } : {}),
    },
  });
}

async function grantPasswordVisit(slug: string) {
  const client = createCookieClient();
  expect((await postPassword(client.http, slug, "launch-gate")).status).toBe(303);
  const revealed = await client.http(viewerUrl(slug), { redirect: "manual" });
  expect(revealed.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(await revealed.text()))).toContain(distinctiveTitle);
  expect(await client.jar.getCookieString(process.env.BETTER_AUTH_URL!)).toMatch(/visitor_id=/);
  return client;
}

test("replacing a password or flipping a Requirement after a Visit makes the next GET the Gate", async () => {
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
    passwordHash: await hashSharePassword("launch-gate"),
  });
  const client = await grantPasswordVisit(gated.slug);

  expect(
    (await updateOwnedLink(fixture.member.http, gated, { password: "launch-gate-2" })).ok,
  ).toBe(true);

  const reGated = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const reGatedHtml = await reGated.text();
  expect(reGated.status).toBe(200);
  expect(serverRenderedMarkupOf(reGatedHtml)).toMatch(/password/i);
  expect(reGatedHtml).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toHaveLength(1);

  expect((await postPassword(client.http, gated.slug, "launch-gate-2")).status).toBe(303);
  expect((await client.http(viewerUrl(gated.slug), { redirect: "manual" })).status).toBe(200);

  expect(
    (
      await updateOwnedLink(fixture.member.http, gated, {
        password: "launch-gate-2",
        requiresEmail: true,
      })
    ).ok,
  ).toBe(true);

  const flipped = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const flippedHtml = await flipped.text();
  expect(flipped.status).toBe(200);
  expect(serverRenderedMarkupOf(flippedHtml)).toMatch(/password/i);
  expect(flippedHtml).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toHaveLength(2);
});

test("toggling allow_download after a Visit keeps the Visitor on the reveal", async () => {
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
    passwordHash: await hashSharePassword("launch-gate"),
  });
  const client = await grantPasswordVisit(gated.slug);

  expect((await updateOwnedLink(fixture.member.http, gated, { allowDownload: true })).ok).toBe(
    true,
  );

  const stillRevealed = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const html = await stillRevealed.text();
  expect(stillRevealed.status).toBe(200);
  expect(textOf(serverRenderedMarkupOf(html))).toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toHaveLength(1);
});

test("an aged Visit re-gates on the next GET", async () => {
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
    passwordHash: await hashSharePassword("launch-gate"),
  });
  const client = await grantPasswordVisit(gated.slug);
  const [row] = await database
    .select({ id: visit.id })
    .from(visit)
    .where(eq(visit.linkId, gated.id));
  expect(row).toBeDefined();
  await database
    .update(visit)
    .set({ expiresAt: new Date(0) })
    .where(eq(visit.id, row.id));

  const reGated = await client.http(viewerUrl(gated.slug), { redirect: "manual" });
  const html = await reGated.text();
  expect(reGated.status).toBe(200);
  expect(serverRenderedMarkupOf(html)).toMatch(/password/i);
  expect(html).not.toContain(distinctiveTitle);
  expect(
    await database.select({ id: visit.id }).from(visit).where(eq(visit.linkId, gated.id)),
  ).toHaveLength(1);
});

test("a deactivated or expired Link with a live Visit cookie is the terminal 404", async () => {
  const fixture = await createOrganizationFixture();
  const [deactivatedDocument, expiredDocument] = await Promise.all(
    Array.from({ length: 2 }, () =>
      createFixtureDocument({
        organizationId: fixture.organization.id,
        createdBy: fixture.member.user.id,
        title: distinctiveTitle,
      }),
    ),
  );
  const toDeactivate = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: deactivatedDocument.id,
  });
  const toExpire = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: expiredDocument.id,
  });
  const deactivatedClient = createCookieClient();
  const expiredClient = createCookieClient();
  expect(
    (await deactivatedClient.http(viewerUrl(toDeactivate.slug), { redirect: "manual" })).status,
  ).toBe(200);
  expect((await expiredClient.http(viewerUrl(toExpire.slug), { redirect: "manual" })).status).toBe(
    200,
  );

  expect((await updateOwnedLink(fixture.member.http, toDeactivate, { isActive: false })).ok).toBe(
    true,
  );
  expect(
    (await updateOwnedLink(fixture.member.http, toExpire, { expiresAt: new Date(0).toISOString() }))
      .ok,
  ).toBe(true);

  const unknown = await getViewer(createCookieClient().http, "unknownslug2");
  const deactivated = await deactivatedClient.http(viewerUrl(toDeactivate.slug), {
    redirect: "manual",
  });
  const expired = await expiredClient.http(viewerUrl(toExpire.slug), { redirect: "manual" });
  const bodies = await Promise.all(
    [unknown, deactivated, expired].map((response) => response.text()),
  );
  const markup = bodies.map(serverRenderedMarkupOf);

  for (const response of [unknown, deactivated, expired]) {
    expect(response.status).toBe(404);
  }
  expect(new Set(markup).size).toBe(1);
  expect(textOf(markup[0] ?? "")).toContain(
    "This link isn't available. Ask whoever sent it to you for a new one.",
  );
});
