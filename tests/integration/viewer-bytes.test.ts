import { eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { visit, visitEvent } from "#/server/db/schema";

import {
  callServerFunction,
  createCookieClient,
  createFixtureDocument,
  createFixtureLink,
  createFixturePendingDocument,
  createFixtureUploadedDocument,
  createOrganizationFixture,
  database,
  readUploadSample,
} from "../fixtures";

const pixelPng = readUploadSample("pixel.png");

function viewerBytesUrl(slug: string, documentId: string, search = "") {
  return new URL(`/v/${slug}/bytes/${documentId}${search}`, process.env.BETTER_AUTH_URL);
}

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

async function eventsForLink(linkId: string) {
  return database
    .select({
      type: visitEvent.type,
      payload: visitEvent.payload,
      documentId: visitEvent.documentId,
    })
    .from(visitEvent)
    .innerJoin(visit, eq(visit.id, visitEvent.visitId))
    .where(eq(visit.linkId, linkId));
}

async function openPublicLink(slug: string) {
  const client = createCookieClient();
  expect(
    (
      await client.http(new URL(`/v/${slug}`, process.env.BETTER_AUTH_URL), {
        redirect: "manual",
      })
    ).status,
  ).toBe(200);
  return client;
}

const linksModulePath = "/src/server/functions/links.ts";
const documentsModulePath = "/src/server/functions/documents.ts";

async function bumpGateVersion(http: typeof fetch, linkRow: { id: string; name: string | null }) {
  return callServerFunction(http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId: linkRow.id,
      name: linkRow.name,
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
      isActive: true,
      password: "rotated-gate",
    },
  });
}

test("a valid Visit cookie receives the Document's bytes inline and writes no Event", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
    storedContentType: "application/octet-stream",
    fileName: "pixel.png",
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: uploaded.id,
  });
  const client = createCookieClient();

  expect(
    (
      await client.http(new URL(`/v/${published.slug}`, process.env.BETTER_AUTH_URL), {
        redirect: "manual",
      })
    ).status,
  ).toBe(200);

  const response = await client.http(viewerBytesUrl(published.slug, uploaded.id), {
    redirect: "manual",
  });
  const body = new Uint8Array(await response.arrayBuffer());

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("content-disposition")).toBe("inline");
  expect(response.headers.get("accept-ranges")).toBeNull();
  expectSecurityHeaders(response);
  expect(body).toEqual(pixelPng);
  expect(await eventsForLink(published.id)).toEqual([]);
});

test("a request with no Visit cookie, a cookie for a different Link, or a moved gate_version is refused", async () => {
  const fixture = await createOrganizationFixture();
  const [firstDocument, secondDocument] = await Promise.all([
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      bytes: pixelPng,
      contentType: "image/png",
    }),
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      bytes: pixelPng,
      contentType: "image/png",
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
  const firstVisitor = await openPublicLink(firstLink.slug);
  const secondVisitor = await openPublicLink(secondLink.slug);
  const firstVisitCookie = await firstVisitor.jar.getCookieString(
    viewerBytesUrl(firstLink.slug, firstDocument.id).href,
  );

  const withoutCookie = await createCookieClient().http(
    viewerBytesUrl(firstLink.slug, firstDocument.id),
    { redirect: "manual" },
  );
  const otherLinkCookie = await fetch(viewerBytesUrl(secondLink.slug, secondDocument.id), {
    redirect: "manual",
    headers: { cookie: firstVisitCookie },
  });

  expect(withoutCookie.status).toBe(404);
  expect(await withoutCookie.arrayBuffer()).toHaveProperty("byteLength", 0);
  expectSecurityHeaders(withoutCookie);

  expect(otherLinkCookie.status).toBe(404);
  expect(await otherLinkCookie.arrayBuffer()).toHaveProperty("byteLength", 0);
  expectSecurityHeaders(otherLinkCookie);

  expect((await bumpGateVersion(fixture.member.http, firstLink)).ok).toBe(true);
  const staleGate = await firstVisitor.http(viewerBytesUrl(firstLink.slug, firstDocument.id), {
    redirect: "manual",
  });
  expect(staleGate.status).toBe(404);
  expect(await staleGate.arrayBuffer()).toHaveProperty("byteLength", 0);
  expectSecurityHeaders(staleGate);

  const stillValid = await secondVisitor.http(viewerBytesUrl(secondLink.slug, secondDocument.id), {
    redirect: "manual",
  });
  expect(stillValid.status).toBe(200);
});

test("a Document that is not Reachable from the Link's Target is refused, including one in the same Organization", async () => {
  const fixture = await createOrganizationFixture();
  const [target, outsider] = await Promise.all([
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      bytes: pixelPng,
      contentType: "image/png",
    }),
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      bytes: pixelPng,
      contentType: "image/png",
    }),
  ]);
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: target.id,
  });
  const client = await openPublicLink(published.slug);

  const response = await client.http(viewerBytesUrl(published.slug, outsider.id), {
    redirect: "manual",
  });

  expect(response.status).toBe(404);
  expect(await response.arrayBuffer()).toHaveProperty("byteLength", 0);
  expectSecurityHeaders(response);
  expect(await eventsForLink(published.id)).toEqual([]);
});

test("a Document Reachable only by Reference is served and writes no Event", async () => {
  const fixture = await createOrganizationFixture();
  const [markdown, image] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      content: "notes",
    }),
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      bytes: pixelPng,
      contentType: "image/png",
      fileName: "logo.png",
    }),
  ]);
  const saveResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId: markdown.id,
      title: markdown.title,
      content: `![logo](doc/${image.id})`,
      updatedAt: markdown.updatedAt.toISOString(),
    },
  });
  expect(saveResponse.ok).toBe(true);

  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: markdown.id,
  });
  const client = await openPublicLink(published.slug);

  const response = await client.http(viewerBytesUrl(published.slug, image.id), {
    redirect: "manual",
  });

  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(pixelPng);
  expect(response.headers.get("content-disposition")).toBe("inline");
  expect(await eventsForLink(published.id)).toEqual([]);
});

test("download=button appends one download Event and serves an attachment under the original file name", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
    fileName: "launch notes.png",
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: uploaded.id,
    allowDownload: true,
  });
  const client = await openPublicLink(published.slug);

  const response = await client.http(
    viewerBytesUrl(published.slug, uploaded.id, "?download=button"),
    { redirect: "manual" },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toBe(
    'attachment; filename="launch notes.png"',
  );
  expect(response.headers.get("content-type")).toBe("image/png");
  expectSecurityHeaders(response);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(pixelPng);
  expect(await eventsForLink(published.id)).toEqual([
    { type: "download", payload: { via: "button" }, documentId: uploaded.id },
  ]);
});

test("the Dashboard download parameter does not attach or write a download Event", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
    fileName: "pixel.png",
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: uploaded.id,
    allowDownload: true,
  });
  const client = await openPublicLink(published.slug);

  const response = await client.http(viewerBytesUrl(published.slug, uploaded.id, "?download=1"), {
    redirect: "manual",
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toBe("inline");
  expect(await eventsForLink(published.id)).toEqual([]);
});

test("download=button returns 403 and appends nothing when the Link refuses downloads", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: uploaded.id,
    allowDownload: false,
  });
  const client = await openPublicLink(published.slug);

  const response = await client.http(
    viewerBytesUrl(published.slug, uploaded.id, "?download=button"),
    { redirect: "manual" },
  );

  expect(response.status).toBe(403);
  expect(await response.arrayBuffer()).toHaveProperty("byteLength", 0);
  expectSecurityHeaders(response);
  expect(await eventsForLink(published.id)).toEqual([]);
});

test("a pending Document returns 409 and a missing object returns 404, and neither appends an Event", async () => {
  const fixture = await createOrganizationFixture();
  const [pending, missing] = await Promise.all([
    createFixturePendingDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      kind: "image",
      fileName: "uploading.png",
    }),
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      contentType: "image/png",
      fileName: "gone.png",
    }),
  ]);
  const [pendingLink, missingLink] = await Promise.all([
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      documentId: pending.id,
      allowDownload: true,
    }),
    createFixtureLink({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      documentId: missing.id,
      allowDownload: true,
    }),
  ]);
  const pendingVisitor = await openPublicLink(pendingLink.slug);
  const missingVisitor = await openPublicLink(missingLink.slug);

  const pendingResponse = await pendingVisitor.http(
    viewerBytesUrl(pendingLink.slug, pending.id, "?download=button"),
    { redirect: "manual" },
  );
  const missingResponse = await missingVisitor.http(
    viewerBytesUrl(missingLink.slug, missing.id, "?download=button"),
    { redirect: "manual" },
  );

  expect(pendingResponse.status).toBe(409);
  expectSecurityHeaders(pendingResponse);
  expect(missingResponse.status).toBe(404);
  expectSecurityHeaders(missingResponse);
  expect(await eventsForLink(pendingLink.id)).toEqual([]);
  expect(await eventsForLink(missingLink.id)).toEqual([]);
});

test("a forwarded Range still yields 206 with Content-Range and never Accept-Ranges", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: uploaded.id,
  });
  const client = await openPublicLink(published.slug);

  const response = await client.http(viewerBytesUrl(published.slug, uploaded.id), {
    redirect: "manual",
    headers: { range: "bytes=0-3" },
  });

  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe(`bytes 0-3/${pixelPng.byteLength}`);
  expect(response.headers.get("accept-ranges")).toBeNull();
  expect(response.headers.get("content-type")).toBe("image/png");
  expectSecurityHeaders(response);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(pixelPng.slice(0, 4));
  expect(await eventsForLink(published.id)).toEqual([]);
});
