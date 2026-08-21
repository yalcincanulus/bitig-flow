import { expect, test } from "vitest";

import { documentReference } from "#/server/db/schema";
import type { DocumentId, LinkId } from "#/server/ids";
import { isDocumentReachableFromLink } from "#/server/viewer/reachability";

import {
  callServerFunction,
  createFixtureDocument,
  createFixtureLink,
  createFixtureUploadedDocument,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
  database,
  readUploadSample,
} from "../fixtures";

const documentsModulePath = "/src/server/functions/documents.ts";

function reachable(linkId: string, documentId: string) {
  // The gated byte route does not exist yet. Issue #48 writes this query so that
  // route adds no new table and no new query shape (ADR-0058). HTTP coverage of
  // bytes waits for that route; this is the same sanctioned-below-HTTP seam as
  // the SQL-scope check in authorization.test.ts.
  return isDocumentReachableFromLink(linkId as LinkId, documentId as DocumentId);
}

test("a Link's reachable Documents are the target, Vault members, and one hop of References", async () => {
  const fixture = await createOrganizationFixture();
  const [markdown, image, secondHop, outsider] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      content: "notes",
    }),
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
      fileName: "extra.png",
      bytes: readUploadSample("pixel.png"),
    }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      content: "unrelated",
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

  await database.insert(documentReference).values({
    sourceDocumentId: image.id,
    targetDocumentId: secondHop.id,
  });

  const link = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: markdown.id,
  });

  expect(await reachable(link.id, markdown.id)).toBe(true);
  expect(await reachable(link.id, image.id)).toBe(true);
  expect(await reachable(link.id, secondHop.id)).toBe(false);
  expect(await reachable(link.id, outsider.id)).toBe(false);
});

test("a Vault Link reaches Vault members and their References, not a second hop", async () => {
  const fixture = await createOrganizationFixture();
  const vault = await createFixtureVault({ organizationId: fixture.organization.id });
  const [memberDocument, image, secondHop, outsider] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      content: "notes",
    }),
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
      fileName: "extra.png",
      bytes: readUploadSample("pixel.png"),
    }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      content: "outside the vault",
    }),
  ]);

  await Promise.all([
    createFixtureVaultItem({ vaultId: vault.id, documentId: memberDocument.id }),
    callServerFunction(fixture.member.http, {
      modulePath: documentsModulePath,
      exportName: "updateDocument",
      method: "POST",
      data: {
        documentId: memberDocument.id,
        title: memberDocument.title,
        content: `![logo](doc/${image.id})`,
        updatedAt: memberDocument.updatedAt.toISOString(),
      },
    }),
  ]);

  await database.insert(documentReference).values({
    sourceDocumentId: image.id,
    targetDocumentId: secondHop.id,
  });

  const link = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    vaultId: vault.id,
  });

  expect(await reachable(link.id, memberDocument.id)).toBe(true);
  expect(await reachable(link.id, image.id)).toBe(true);
  expect(await reachable(link.id, secondHop.id)).toBe(false);
  expect(await reachable(link.id, outsider.id)).toBe(false);
});

test("a hidden Vault member and its References are out of reach", async () => {
  const fixture = await createOrganizationFixture();
  const vault = await createFixtureVault({ organizationId: fixture.organization.id });
  const [hiddenDocument, image] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      content: "notes",
    }),
    createFixtureUploadedDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
      contentType: "image/png",
      fileName: "logo.png",
      bytes: readUploadSample("pixel.png"),
    }),
  ]);

  await Promise.all([
    createFixtureVaultItem({
      vaultId: vault.id,
      documentId: hiddenDocument.id,
      isVisible: false,
    }),
    callServerFunction(fixture.member.http, {
      modulePath: documentsModulePath,
      exportName: "updateDocument",
      method: "POST",
      data: {
        documentId: hiddenDocument.id,
        title: hiddenDocument.title,
        content: `![logo](doc/${image.id})`,
        updatedAt: hiddenDocument.updatedAt.toISOString(),
      },
    }),
  ]);

  const link = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    vaultId: vault.id,
  });

  // Hiding withdraws bytes, not just the listing — otherwise the URL alone would still serve them.
  expect(await reachable(link.id, hiddenDocument.id)).toBe(false);
  expect(await reachable(link.id, image.id)).toBe(false);
});
