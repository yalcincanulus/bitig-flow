import { expect, test } from "vitest";

import { documentBytesUrl } from "#/lib/document-bytes";

import {
  callServerFunction,
  createFixtureDocument,
  createFixtureUploadedDocument,
  createOrganizationFixture,
  readUploadSample,
} from "../fixtures";

const documentsModulePath = "/src/server/functions/documents.ts";

test("the Document detail render returns HTML for a User's markdown", async () => {
  const fixture = await createOrganizationFixture();
  const image = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    contentType: "image/png",
    fileName: "logo.png",
    bytes: readUploadSample("pixel.png"),
  });
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    content: `# Launch notes\n\nSee [the site](https://example.com) and ![logo](doc/${image.id}).`,
  });

  const response = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "renderMarkdown",
    method: "GET",
    data: { documentId: document.id },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toBe(
    `<h1 id="launch-notes">Launch notes</h1>\n<p>See <a href="https://example.com" rel="noopener noreferrer" target="_blank">the site</a> and <img src="${documentBytesUrl(image.id)}" alt="logo">.</p>`,
  );
});

test("a missing image Reference renders as its alt text", async () => {
  const fixture = await createOrganizationFixture();
  const missingImageId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20501";
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    content: `![logo](doc/${missingImageId})`,
  });

  const response = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "renderMarkdown",
    method: "GET",
    data: { documentId: document.id },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toBe("<p>logo</p>");
});

test("a Document from another Organization is not found when rendering", async () => {
  const [firstOrganization, secondOrganization] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const secondOrganizationDocument = await createFixtureDocument({
    organizationId: secondOrganization.organization.id,
    createdBy: secondOrganization.member.user.id,
    content: "Secret notes",
  });

  const response = await callServerFunction(firstOrganization.member.http, {
    modulePath: documentsModulePath,
    exportName: "renderMarkdown",
    method: "GET",
    data: { documentId: secondOrganizationDocument.id },
  });
  const failure = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(404);
  expect(failure).toMatchObject({ isNotFound: true });
  expect(failure).not.toMatchObject({ code: "FORBIDDEN" });
});

test("rendering does not write HTML onto the Document", async () => {
  const fixture = await createOrganizationFixture();
  const markdown = "Hello <script>alert(1)</script>";
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    content: markdown,
  });

  const renderResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "renderMarkdown",
    method: "GET",
    data: { documentId: document.id },
  });
  const storedResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "getDocument",
    method: "GET",
    data: { documentId: document.id },
  });

  expect(renderResponse.ok).toBe(true);
  expect(await renderResponse.json()).toContain("&lt;script&gt;");
  expect(await storedResponse.json()).toMatchObject({ content: markdown });
});

test("an uploaded Document is not found at the markdown render", async () => {
  const fixture = await createOrganizationFixture();
  const document = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    contentType: "image/png",
    fileName: "logo.png",
    bytes: readUploadSample("pixel.png"),
  });

  const response = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "renderMarkdown",
    method: "GET",
    data: { documentId: document.id },
  });

  expect(response.status).toBe(404);
});
