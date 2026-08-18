import { expect, test } from "vitest";

import {
  createCookieClient,
  createFixturePendingDocument,
  createFixtureUploadedDocument,
  createOrganizationFixture,
  readUploadSample,
} from "../fixtures";

const pixelPng = readUploadSample("pixel.png");
const twoPagePdf = readUploadSample("two-page.pdf");

function bytesUrl(documentId: string, download = false) {
  const url = new URL(`/api/documents/${documentId}/bytes`, process.env.BETTER_AUTH_URL);
  if (download) url.searchParams.set("download", "1");
  return url;
}

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
} as const;

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get("x-content-type-options")).toBe(
    securityHeaders["x-content-type-options"],
  );
  expect(response.headers.get("cache-control")).toBe(securityHeaders["cache-control"]);
}

test("a request with no session is refused the Dashboard byte route", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
    storedContentType: "application/octet-stream",
  });
  const client = createCookieClient();

  const response = await client.http(bytesUrl(uploaded.id), { redirect: "manual" });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
  expect(await response.arrayBuffer()).toHaveProperty("byteLength", 0);
});

test("a Document id from another Organization is not found on the byte route", async () => {
  const [firstOrganization, secondOrganization] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const foreign = await createFixtureUploadedDocument({
    organizationId: secondOrganization.organization.id,
    createdBy: secondOrganization.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
  });

  const response = await firstOrganization.member.http(bytesUrl(foreign.id), {
    redirect: "manual",
  });

  expect(response.status).toBe(404);
  expect(await response.arrayBuffer()).toHaveProperty("byteLength", 0);
});

test("an uploaded image is served from our origin with the sniffed type", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
    storedContentType: "application/octet-stream",
    fileName: "pixel.png",
  });

  const response = await fixture.member.http(bytesUrl(uploaded.id), { redirect: "manual" });
  const body = new Uint8Array(await response.arrayBuffer());

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("etag")).toBeNull();
  expect(response.headers.get("content-disposition")).toBe("inline");
  expectSecurityHeaders(response);
  expect(body).toEqual(pixelPng);
});

test("downloading an uploaded Document uses the filename it was uploaded with", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: twoPagePdf,
    contentType: "application/pdf",
    fileName: "launch notes.pdf",
  });

  const response = await fixture.member.http(bytesUrl(uploaded.id, true), {
    redirect: "manual",
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe(
    'attachment; filename="launch notes.pdf"',
  );
  expectSecurityHeaders(response);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(twoPagePdf);
});

test("a range request answers 206 with a Content-Range", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
  });

  const response = await fixture.member.http(bytesUrl(uploaded.id), {
    redirect: "manual",
    headers: { range: "bytes=0-3" },
  });

  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe(`bytes 0-3/${pixelPng.byteLength}`);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("etag")).toBeNull();
  expectSecurityHeaders(response);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(pixelPng.slice(0, 4));
});

test("a pending Document answers 409 on the byte route", async () => {
  const fixture = await createOrganizationFixture();
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const response = await fixture.member.http(bytesUrl(pending.id), { redirect: "manual" });

  expect(response.status).toBe(409);
  expect(response.headers.get("etag")).toBeNull();
  expectSecurityHeaders(response);
});

test("a ready Document whose object is missing answers 404", async () => {
  const fixture = await createOrganizationFixture();
  const missing = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    contentType: "image/png",
    fileName: "gone.png",
  });

  const response = await fixture.member.http(bytesUrl(missing.id), { redirect: "manual" });

  expect(response.status).toBe(404);
  expectSecurityHeaders(response);
});

test("conditional request headers do not produce an ETag or a 304", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: pixelPng,
    contentType: "image/png",
  });

  const response = await fixture.member.http(bytesUrl(uploaded.id), {
    redirect: "manual",
    headers: {
      "if-none-match": '"anything"',
      "if-modified-since": "Wed, 21 Oct 2015 07:28:00 GMT",
    },
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("etag")).toBeNull();
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(pixelPng);
});

test("the Dashboard document pane names connect-src self in its CSP", async () => {
  const fixture = await createOrganizationFixture();

  const response = await fixture.member.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const csp = response.headers.get("content-security-policy") ?? (await response.text());

  expect(response.status).toBe(200);
  expect(csp).toContain("connect-src 'self'");
});
