import { and, eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { documentBytesUrl } from "#/lib/document-bytes";
import { documentReference } from "#/server/db/schema";

import {
  callServerFunction,
  createFixtureDocument,
  createFixtureUploadedDocument,
  createOrganizationFixture,
  database,
  readUploadSample,
} from "../fixtures";

const documentsModulePath = "/src/server/functions/documents.ts";

test("updateDocument writes exactly the referenced edges and drops a removed one", async () => {
  const fixture = await createOrganizationFixture();
  const [logo, chart] = await Promise.all([
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
      fileName: "chart.png",
      bytes: readUploadSample("pixel.png"),
    }),
  ]);
  const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20601";

  const firstResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId,
      title: "Launch notes",
      content: `![logo](doc/${logo.id}) and ![chart](doc/${chart.id})`,
      updatedAt: "2026-08-17T12:00:00.000Z",
    },
  });
  const first = (await firstResponse.json()) as { id: string; updatedAt: string; content: string };

  expect(firstResponse.ok).toBe(true);
  expect(first.content).toBe(`![logo](doc/${logo.id}) and ![chart](doc/${chart.id})`);
  expect(first.content).not.toContain(documentBytesUrl(logo.id));
  expect(first.content).not.toContain("http");

  const firstEdges = await database
    .select()
    .from(documentReference)
    .where(eq(documentReference.sourceDocumentId, first.id));

  expect(firstEdges.map((edge) => edge.targetDocumentId).sort()).toEqual(
    [chart.id, logo.id].sort(),
  );

  const secondResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId,
      title: "Launch notes",
      content: `![logo](doc/${logo.id})`,
      updatedAt: first.updatedAt,
    },
  });

  expect(secondResponse.ok).toBe(true);

  const secondEdges = await database
    .select()
    .from(documentReference)
    .where(eq(documentReference.sourceDocumentId, first.id));

  expect(secondEdges.map((edge) => edge.targetDocumentId)).toEqual([logo.id]);
});

test("deleting a referenced Document removes its edges and the Preview becomes alt text", async () => {
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
    content: "before",
  });

  const saveResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId: document.id,
      title: document.title,
      content: `![logo](doc/${image.id})`,
      updatedAt: document.updatedAt.toISOString(),
    },
  });
  expect(saveResponse.ok).toBe(true);

  const deleteResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "deleteDocument",
    method: "POST",
    data: { documentId: image.id },
  });
  expect(deleteResponse.ok).toBe(true);

  const remainingEdges = await database
    .select()
    .from(documentReference)
    .where(
      and(
        eq(documentReference.sourceDocumentId, document.id),
        eq(documentReference.targetDocumentId, image.id),
      ),
    );
  expect(remainingEdges).toEqual([]);

  const renderResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "renderMarkdown",
    method: "GET",
    data: { documentId: document.id },
  });

  expect(renderResponse.status).toBe(200);
  expect(await renderResponse.json()).toBe("<p>logo</p>");
});

test("a remote image URL is stored as authored and renders as alt text", async () => {
  const fixture = await createOrganizationFixture();
  const response = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "updateDocument",
    method: "POST",
    data: {
      documentId: "0198b8f1-6ae4-7c39-9c3d-3cfd7af20602",
      title: "Launch notes",
      content: "![beacon](https://evil.example/pixel.png)",
      updatedAt: "2026-08-17T12:00:00.000Z",
    },
  });
  const saved = (await response.json()) as { id: string; content: string };

  expect(response.ok).toBe(true);
  expect(saved.content).toBe("![beacon](https://evil.example/pixel.png)");

  const edges = await database
    .select()
    .from(documentReference)
    .where(eq(documentReference.sourceDocumentId, saved.id));
  expect(edges).toEqual([]);

  const renderResponse = await callServerFunction(fixture.member.http, {
    modulePath: documentsModulePath,
    exportName: "renderMarkdown",
    method: "GET",
    data: { documentId: saved.id },
  });

  expect(await renderResponse.json()).toBe("<p>beacon</p>");
});
