import { expect, test } from "vitest";

import {
  callServerFunction,
  createCookieClient,
  createFixturePendingDocument,
  createOrganizationFixture,
  fixtureObjectExists,
  readUploadSample,
} from "../fixtures";
import { uploadMaxBytes } from "#/lib/upload";

const documentsModulePath = "/src/server/functions/documents.ts";

const twoPagePdf = readUploadSample("two-page.pdf");
const pixelPng = readUploadSample("pixel.png");
const scriptSvg = readUploadSample("script.svg");
const unparseablePdf = readUploadSample("unparseable.pdf");

type UploadCreated = {
  document: {
    id: string;
    status: string;
    kind: string;
    fileName: string | null;
    storageKey: string | null;
    title: string;
  };
  uploadUrl: string;
};

async function createUpload(
  http: typeof fetch,
  data: { documentId: string; fileName: string; contentType: string },
) {
  return callServerFunction(http, {
    modulePath: documentsModulePath,
    exportName: "createUpload",
    method: "POST",
    data,
  });
}

async function confirmUpload(
  http: typeof fetch,
  documentId: string,
  contentType = "application/pdf",
) {
  return callServerFunction(http, {
    modulePath: documentsModulePath,
    exportName: "confirmUpload",
    method: "POST",
    data: { documentId, contentType },
  });
}

test("a User can upload a PDF and see the row as pending before the bytes land", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20401";

  const createResponse = await createUpload(fixture.member.http, {
    documentId,
    fileName: "launch notes.pdf",
    contentType: "application/pdf",
  });
  const created = (await createResponse.json()) as UploadCreated;

  expect(createResponse.ok).toBe(true);
  expect(created.document).toMatchObject({
    id: documentId,
    organizationId: fixture.organization.id,
    title: "launch notes.pdf",
    kind: "pdf",
    status: "pending",
    fileName: "launch notes.pdf",
    storageKey: `org/${fixture.organization.id}/doc/${documentId}/original`,
    mimeType: null,
    byteSize: null,
    checksum: null,
    pageCount: null,
  });
  expect(created.uploadUrl).toEqual(expect.stringContaining("http"));
  expect(new URL(created.uploadUrl).searchParams.get("X-Amz-SignedHeaders")).not.toContain(
    "x-amz-checksum",
  );

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });
  expect(await listResponse.json()).toEqual([
    expect.objectContaining({ id: documentId, status: "pending", kind: "pdf" }),
  ]);
});

test("a browser-shaped PUT with Content-Type still confirms to ready", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af2040a";
  const created = (await (
    await createUpload(fixture.member.http, {
      documentId,
      fileName: "resume.pdf",
      contentType: "application/pdf",
    })
  ).json()) as UploadCreated;

  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"] as const) {
    const preflight = await fetch(created.uploadUrl, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(preflight.status).toBeLessThan(400);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(preflight.headers.get("access-control-allow-methods")?.toUpperCase()).toContain("PUT");
  }

  const putResponse = await fetch(created.uploadUrl, {
    method: "PUT",
    body: twoPagePdf,
    headers: { Origin: "http://127.0.0.1:3000", "Content-Type": "application/pdf" },
  });
  expect(putResponse.status).toBeLessThan(400);

  const confirmResponse = await confirmUpload(fixture.member.http, documentId);
  expect(confirmResponse.ok).toBe(true);
  expect(await confirmResponse.json()).toMatchObject({
    id: documentId,
    status: "ready",
    mimeType: "application/pdf",
  });
});

test("confirmation records sniffed type, size, checksum, and PDF page count after a direct PUT", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20402";

  const created = (await (
    await createUpload(fixture.member.http, {
      documentId,
      fileName: "deck.pdf",
      contentType: "application/pdf",
    })
  ).json()) as UploadCreated;

  const putResponse = await fetch(created.uploadUrl, { method: "PUT", body: twoPagePdf });
  expect(putResponse.ok).toBe(true);

  const confirmResponse = await confirmUpload(fixture.member.http, documentId);
  expect(confirmResponse.ok).toBe(true);
  expect(await confirmResponse.json()).toMatchObject({
    id: documentId,
    status: "ready",
    kind: "pdf",
    mimeType: "application/pdf",
    byteSize: 416,
    checksum: "1f1f2b01dbf48ad458410b8ce139334d32719b9af7cd7de4a618f1d7a2a5ccaa",
    pageCount: 2,
  });
});

test("a PNG upload records image kind and no page count", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20403";
  const created = (await (
    await createUpload(fixture.member.http, {
      documentId,
      fileName: "pixel.png",
      contentType: "image/png",
    })
  ).json()) as UploadCreated;

  expect((await fetch(created.uploadUrl, { method: "PUT", body: pixelPng })).ok).toBe(true);

  const confirmResponse = await confirmUpload(fixture.member.http, documentId, "image/png");
  expect(await confirmResponse.json()).toMatchObject({
    status: "ready",
    kind: "image",
    mimeType: "image/png",
    byteSize: 67,
    checksum: "ebf4f635a17d10d6eb46ba680b70142419aa3220f228001a036d311a22ee9d2a",
    pageCount: null,
  });
});

test("a page count that cannot be parsed is left unknown", async () => {
  const fixture = await createOrganizationFixture();
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: unparseablePdf,
    contentType: "application/pdf",
  });

  const confirmResponse = await confirmUpload(fixture.member.http, pending.id);
  expect(confirmResponse.ok).toBe(true);
  expect(await confirmResponse.json()).toMatchObject({
    id: pending.id,
    status: "ready",
    mimeType: "application/pdf",
    pageCount: null,
  });
});

test("confirming before the bytes land is retryable and leaves the row pending", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20404";
  await createUpload(fixture.member.http, {
    documentId,
    fileName: "deck.pdf",
    contentType: "application/pdf",
  });

  const confirmResponse = await confirmUpload(fixture.member.http, documentId);
  expect(confirmResponse.status).toBe(409);
  expect(await confirmResponse.json()).toMatchObject({
    code: "UPLOAD_INCOMPLETE",
    retryable: true,
  });

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });
  expect(await listResponse.json()).toEqual([
    expect.objectContaining({ id: documentId, status: "pending" }),
  ]);
});

test("SVG bytes are refused and leave no ready Document and no object", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20405";
  const created = (await (
    await createUpload(fixture.member.http, {
      documentId,
      fileName: "pixel.png",
      contentType: "image/png",
    })
  ).json()) as UploadCreated;

  expect((await fetch(created.uploadUrl, { method: "PUT", body: scriptSvg })).ok).toBe(true);

  const confirmResponse = await confirmUpload(fixture.member.http, documentId, "image/png");
  expect(confirmResponse.status).toBe(422);
  expect(await confirmResponse.json()).toMatchObject({
    code: "UPLOAD_CONFIRMATION",
    check: "type",
    retryable: false,
  });

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });
  expect(await listResponse.json()).toEqual([]);
  expect(await fixtureObjectExists(created.document.storageKey!)).toBe(false);
});

test("bytes that contradict the declared kind are refused", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20406";
  const created = (await (
    await createUpload(fixture.member.http, {
      documentId,
      fileName: "deck.pdf",
      contentType: "application/pdf",
    })
  ).json()) as UploadCreated;

  await fetch(created.uploadUrl, { method: "PUT", body: pixelPng });
  const confirmResponse = await confirmUpload(fixture.member.http, documentId);

  expect(confirmResponse.status).toBe(422);
  expect(await confirmResponse.json()).toMatchObject({ check: "type" });
  expect(await fixtureObjectExists(created.document.storageKey!)).toBe(false);
});

test("an object over 25 MB is refused at Confirmation", async () => {
  const fixture = await createOrganizationFixture();
  const oversized = new Uint8Array(uploadMaxBytes + 1);
  oversized.set(twoPagePdf, 0);
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: oversized,
    contentType: "application/pdf",
  });

  const confirmResponse = await confirmUpload(fixture.member.http, pending.id);
  expect(confirmResponse.status).toBe(422);
  expect(await confirmResponse.json()).toMatchObject({ check: "size" });
  expect(await fixtureObjectExists(pending.storageKey!)).toBe(false);

  const listResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "listDocuments",
    method: "GET",
  });
  expect(await listResponse.json()).toEqual([]);
});

test("confirming an already-ready Document is a no-op that returns the row", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20407";
  const created = (await (
    await createUpload(fixture.member.http, {
      documentId,
      fileName: "deck.pdf",
      contentType: "application/pdf",
    })
  ).json()) as UploadCreated;
  await fetch(created.uploadUrl, { method: "PUT", body: twoPagePdf });
  const first = await confirmUpload(fixture.member.http, documentId);
  const firstBody = (await first.json()) as { updatedAt: string; checksum: string };

  const second = await confirmUpload(fixture.member.http, documentId);
  expect(second.ok).toBe(true);
  expect(await second.json()).toMatchObject({
    id: documentId,
    status: "ready",
    checksum: firstBody.checksum,
    updatedAt: firstBody.updatedAt,
  });
});

test("the original filename is stored sanitized", async () => {
  const fixture = await createOrganizationFixture();
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20408";
  const createResponse = await createUpload(fixture.member.http, {
    documentId,
    fileName: "../evil\u0000name.pdf",
    contentType: "application/pdf",
  });

  expect(await createResponse.json()).toMatchObject({
    document: { fileName: "..evilname.pdf", title: "..evilname.pdf" },
  });
});

test("deleting an uploaded Document removes its object after the row", async () => {
  const fixture = await createOrganizationFixture();
  const pending = await createFixturePendingDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    bytes: twoPagePdf,
  });
  await confirmUpload(fixture.member.http, pending.id);
  expect(await fixtureObjectExists(pending.storageKey!)).toBe(true);

  const deleteResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "deleteDocument",
    method: "POST",
    data: { documentId: pending.id },
  });
  expect(deleteResponse.ok).toBe(true);
  expect(await fixtureObjectExists(pending.storageKey!)).toBe(false);
});

test("upload writes redirect to sign in without a session", async () => {
  const client = createCookieClient();
  const createResponse = await createUpload(client.http, {
    documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20409",
    fileName: "deck.pdf",
    contentType: "application/pdf",
  });
  const confirmResponse = await confirmUpload(client.http, "0198b8f1-6ae4-7c39-9c3d-3cfd7af20409");

  expect(createResponse.status).toBe(307);
  expect(createResponse.headers.get("location")).toBe("/sign-in");
  expect(confirmResponse.status).toBe(307);
  expect(confirmResponse.headers.get("location")).toBe("/sign-in");
});

test("a Document id from another Organization is not found on confirm", async () => {
  const [firstOrganization, secondOrganization] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const foreign = await createFixturePendingDocument({
    organizationId: secondOrganization.organization.id,
    createdBy: secondOrganization.member.user.id,
    bytes: twoPagePdf,
  });

  const response = await confirmUpload(firstOrganization.member.http, foreign.id);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ isNotFound: true });
});
