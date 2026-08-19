import { expect, test } from "vitest";

import { ANALYTICS_VISIT_CAP } from "#/lib/analytics-fold";

import {
  callServerFunction,
  createFixtureDocument,
  createFixtureLink,
  createFixtureVault,
  createFixtureVaultItem,
  createFixtureVisit,
  createFixtureVisitEvent,
  createOrganizationFixture,
} from "../fixtures";

const analyticsModulePath = "/src/server/functions/analytics.ts";

function visitTimestamps(startedAt: string) {
  const started = new Date(startedAt);
  return {
    startedAt: started,
    lastSeenAt: new Date(started.getTime() + 60_000),
    expiresAt: new Date(started.getTime() + 24 * 60 * 60 * 1_000),
  };
}

async function analyticsLinkFixture(
  fixture: Awaited<ReturnType<typeof createOrganizationFixture>>,
  name: string,
) {
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.owner.user.id,
    title: `${name} Document`,
  });
  const link = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.owner.user.id,
    documentId: document.id,
    name,
  });
  return { document, link };
}

async function fixtureVisit(
  linkId: string,
  startedAt: string,
  options: { email?: string | null; visitorId?: string } = {},
) {
  return createFixtureVisit({
    linkId,
    visitorId: options.visitorId ?? `visitor-${startedAt}`,
    email: options.email ?? null,
    emailVerified: options.email !== undefined && options.email !== null,
    gateVersion: 1,
    ...visitTimestamps(startedAt),
    userAgent: "analytics fixture",
    ipHash: "analytics-fixture-ip",
  });
}

test("Analytics is scoped to the active Organization and includes the whole boundary day", async () => {
  const [first, second] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const [{ document, link }, zeroVisit, secondOrganization] = await Promise.all([
    analyticsLinkFixture(first, "Measured Link"),
    analyticsLinkFixture(first, "Zero Visit Link"),
    analyticsLinkFixture(second, "Other Organization Link"),
  ]);

  const [beforeRange, startBoundary, endBoundary, afterRange, otherOrganization] =
    await Promise.all([
      fixtureVisit(link.id, "2026-07-31T23:59:59.999Z"),
      fixtureVisit(link.id, "2026-08-01T00:00:00.000Z", {
        email: "captured@example.com",
      }),
      fixtureVisit(link.id, "2026-08-17T23:59:59.999Z"),
      fixtureVisit(link.id, "2026-08-18T00:00:00.000Z"),
      fixtureVisit(secondOrganization.link.id, "2026-08-10T12:00:00.000Z"),
    ]);

  await Promise.all([
    createFixtureVisitEvent({
      visitId: startBoundary.id,
      documentId: document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 1_500 },
      occurredAt: new Date("2026-08-01T00:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: endBoundary.id,
      documentId: document.id,
      type: "download",
      payload: { via: "button" },
      occurredAt: new Date("2026-08-18T00:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: beforeRange.id,
      documentId: document.id,
      type: "download",
      payload: { via: "button" },
      occurredAt: new Date("2026-08-01T00:00:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: afterRange.id,
      documentId: document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 9_999 },
      occurredAt: new Date("2026-08-18T00:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: otherOrganization.id,
      documentId: secondOrganization.document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 8_888 },
      occurredAt: new Date("2026-08-10T12:01:00.000Z"),
    }),
  ]);

  const response = await callServerFunction(first.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalytics",
    method: "GET",
    data: { from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual({
    range: { from: "2026-08-01", to: "2026-08-17" },
    allTimeVisits: 4,
    links: expect.arrayContaining([
      {
        linkId: link.id,
        visits: 2,
        viewerIdentities: 2,
        emails: 1,
        totalMs: 1_500,
        downloads: 1,
      },
      {
        linkId: zeroVisit.link.id,
        visits: 0,
        viewerIdentities: 0,
        emails: 0,
        totalMs: 0,
        downloads: 0,
      },
    ]),
  });
  expect(payload.links).toHaveLength(2);
  expect(JSON.stringify(payload)).not.toContain("Measured Link");
  expect(JSON.stringify(payload)).not.toContain("Other Organization Link");
});

test("Analytics applies the last 30 UTC dates when no range is given", async () => {
  const fixture = await createOrganizationFixture();
  const { link } = await analyticsLinkFixture(fixture, "Default Range Link");
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const withinDefault = new Date(todayUtc.getTime() - 29 * 24 * 60 * 60 * 1_000);
  const beforeDefault = new Date(todayUtc.getTime() - 30 * 24 * 60 * 60 * 1_000);

  await Promise.all([
    fixtureVisit(link.id, withinDefault.toISOString()),
    fixtureVisit(link.id, beforeDefault.toISOString()),
  ]);

  const response = await callServerFunction(fixture.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalytics",
    method: "GET",
    data: {},
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    range: {
      from: withinDefault.toISOString().slice(0, 10),
      to: todayUtc.toISOString().slice(0, 10),
    },
    allTimeVisits: 2,
    links: [
      {
        linkId: link.id,
        visits: 1,
        viewerIdentities: 1,
        emails: 0,
        totalMs: 0,
        downloads: 0,
      },
    ],
  });
});

test("a Link's analytics totals match the seeded Visit and Event rows", async () => {
  const [first, second] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const [{ document, link }, otherOrganization] = await Promise.all([
    analyticsLinkFixture(first, "Detail Link"),
    analyticsLinkFixture(second, "Other Organization Link"),
  ]);

  const [startBoundary, endBoundary, , otherOrganizationVisit] = await Promise.all([
    fixtureVisit(link.id, "2026-08-01T00:00:00.000Z", { email: "captured@example.com" }),
    fixtureVisit(link.id, "2026-08-17T23:59:59.999Z"),
    fixtureVisit(link.id, "2026-07-31T23:59:59.999Z"),
    fixtureVisit(otherOrganization.link.id, "2026-08-10T12:00:00.000Z"),
  ]);

  await Promise.all([
    createFixtureVisitEvent({
      visitId: startBoundary.id,
      documentId: document.id,
      type: "document_opened",
      payload: null,
      occurredAt: new Date("2026-08-01T00:00:30.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: startBoundary.id,
      documentId: document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 1_500 },
      occurredAt: new Date("2026-08-01T00:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: startBoundary.id,
      documentId: document.id,
      type: "page_dwell",
      payload: { page: 7, ms: 4_000 },
      occurredAt: new Date("2026-08-01T00:02:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: endBoundary.id,
      documentId: document.id,
      type: "download",
      payload: { via: "button" },
      occurredAt: new Date("2026-08-18T00:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: otherOrganizationVisit.id,
      documentId: otherOrganization.document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 8_888 },
      occurredAt: new Date("2026-08-10T12:01:00.000Z"),
    }),
  ]);

  const response = await callServerFunction(first.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalyticsLink",
    method: "GET",
    data: { linkId: link.id, from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual({
    range: { from: "2026-08-01", to: "2026-08-17" },
    truncated: false,
    lastSeenAt: endBoundary.lastSeenAt.toISOString(),
    totals: {
      visits: 2,
      viewerIdentities: 2,
      emails: 1,
      totalMs: 5_500,
      downloads: 1,
    },
    pages: [
      { page: 1, ms: 1_500 },
      { page: 7, ms: 4_000 },
    ],
    documents: [
      {
        documentId: document.id,
        views: 1,
        totalMs: 5_500,
        downloads: 1,
        pages: [
          { page: 1, ms: 1_500 },
          { page: 7, ms: 4_000 },
        ],
      },
    ],
    identities: [
      {
        email: null,
        visitorId: endBoundary.visitorId,
        visitCount: 1,
        visits: [
          {
            visitId: endBoundary.id,
            linkId: link.id,
            startedAt: endBoundary.startedAt.toISOString(),
            lastSeenAt: endBoundary.lastSeenAt.toISOString(),
            viewerIdentity: { email: null, visitorId: endBoundary.visitorId },
            documents: [],
          },
        ],
      },
      {
        email: "captured@example.com",
        visitorId: startBoundary.visitorId,
        visitCount: 1,
        visits: [
          {
            visitId: startBoundary.id,
            linkId: link.id,
            startedAt: startBoundary.startedAt.toISOString(),
            lastSeenAt: startBoundary.lastSeenAt.toISOString(),
            viewerIdentity: {
              email: "captured@example.com",
              visitorId: startBoundary.visitorId,
            },
            documents: [
              {
                documentId: document.id,
                views: 1,
                totalMs: 5_500,
                pagesRead: 2,
                downloads: 0,
                pages: [
                  { page: 1, ms: 1_500 },
                  { page: 7, ms: 4_000 },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(JSON.stringify(payload)).not.toContain("Detail Link");
});

test("a Link's Visit timeline groups Viewer identities and keeps each Document opened", async () => {
  const fixture = await createOrganizationFixture();
  const { document, link } = await analyticsLinkFixture(fixture, "Timeline Link");
  const visitorId = "visitor-abcdefghijklmnop";

  const [returningEmail, emptyVisit, identifiedEarlier, anonymous] = await Promise.all([
    fixtureVisit(link.id, "2026-08-17T12:00:00.000Z", { email: "lead@example.com" }),
    fixtureVisit(link.id, "2026-08-16T12:00:00.000Z", { email: "lead@example.com" }),
    fixtureVisit(link.id, "2026-08-15T12:00:00.000Z", {
      email: "lead@example.com",
      visitorId: "other-cookie",
    }),
    fixtureVisit(link.id, "2026-08-14T12:00:00.000Z", { visitorId }),
  ]);

  await Promise.all([
    createFixtureVisitEvent({
      visitId: returningEmail.id,
      documentId: document.id,
      type: "document_opened",
      payload: null,
      occurredAt: new Date("2026-08-17T12:00:10.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: returningEmail.id,
      documentId: document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 1_000 },
      occurredAt: new Date("2026-08-17T12:00:20.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: returningEmail.id,
      documentId: document.id,
      type: "document_opened",
      payload: null,
      occurredAt: new Date("2026-08-17T12:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: returningEmail.id,
      documentId: document.id,
      type: "download",
      payload: { via: "button" },
      occurredAt: new Date("2026-08-17T12:01:10.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: anonymous.id,
      documentId: document.id,
      type: "document_opened",
      payload: null,
      occurredAt: new Date("2026-08-14T12:00:10.000Z"),
    }),
  ]);

  const response = await callServerFunction(fixture.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalyticsLink",
    method: "GET",
    data: { linkId: link.id, from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.identities).toEqual([
    {
      email: "lead@example.com",
      visitorId: returningEmail.visitorId,
      visitCount: 3,
      visits: [
        {
          visitId: returningEmail.id,
          linkId: link.id,
          startedAt: returningEmail.startedAt.toISOString(),
          lastSeenAt: returningEmail.lastSeenAt.toISOString(),
          viewerIdentity: { email: "lead@example.com", visitorId: returningEmail.visitorId },
          documents: [
            {
              documentId: document.id,
              views: 1,
              totalMs: 1_000,
              pagesRead: 1,
              downloads: 0,
              pages: [{ page: 1, ms: 1_000 }],
            },
            {
              documentId: document.id,
              views: 1,
              totalMs: 0,
              pagesRead: 0,
              downloads: 1,
              pages: [],
            },
          ],
        },
        {
          visitId: emptyVisit.id,
          linkId: link.id,
          startedAt: emptyVisit.startedAt.toISOString(),
          lastSeenAt: emptyVisit.lastSeenAt.toISOString(),
          viewerIdentity: { email: "lead@example.com", visitorId: emptyVisit.visitorId },
          documents: [],
        },
        {
          visitId: identifiedEarlier.id,
          linkId: link.id,
          startedAt: identifiedEarlier.startedAt.toISOString(),
          lastSeenAt: identifiedEarlier.lastSeenAt.toISOString(),
          viewerIdentity: { email: "lead@example.com", visitorId: "other-cookie" },
          documents: [],
        },
      ],
    },
    {
      email: null,
      visitorId,
      visitCount: 1,
      visits: [
        {
          visitId: anonymous.id,
          linkId: link.id,
          startedAt: anonymous.startedAt.toISOString(),
          lastSeenAt: anonymous.lastSeenAt.toISOString(),
          viewerIdentity: { email: null, visitorId },
          documents: [
            {
              documentId: document.id,
              views: 1,
              totalMs: 0,
              pagesRead: 0,
              downloads: 0,
              pages: [],
            },
          ],
        },
      ],
    },
  ]);
  expect(JSON.stringify(payload)).toContain("lead@example.com");
  expect(JSON.stringify(payload)).not.toContain("l**d@example.com");
});

test("Analytics distinguishes an Organization that has never received a Visit", async () => {
  const fixture = await createOrganizationFixture();
  const { link } = await analyticsLinkFixture(fixture, "Unvisited Link");

  const response = await callServerFunction(fixture.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalytics",
    method: "GET",
    data: { from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    range: { from: "2026-08-01", to: "2026-08-17" },
    allTimeVisits: 0,
    links: [
      {
        linkId: link.id,
        visits: 0,
        viewerIdentities: 0,
        emails: 0,
        totalMs: 0,
        downloads: 0,
      },
    ],
  });
});

test("a Link's analytics flags the Visit cap instead of presenting a truncated total", async () => {
  const fixture = await createOrganizationFixture();
  const { document, link } = await analyticsLinkFixture(fixture, "Capped Link");
  const rangeStart = new Date("2026-08-01T00:00:00.000Z");
  const visits = await Promise.all(
    Array.from({ length: ANALYTICS_VISIT_CAP + 1 }, (_, index) =>
      fixtureVisit(link.id, new Date(rangeStart.getTime() + index * 60_000).toISOString(), {
        visitorId: `capped-visitor-${index}`,
      }),
    ),
  );
  const oldest = visits[0]!;
  const newest = visits[ANALYTICS_VISIT_CAP]!;

  await Promise.all([
    createFixtureVisitEvent({
      visitId: oldest.id,
      documentId: document.id,
      type: "download",
      payload: { via: "button" },
      occurredAt: new Date("2026-08-01T00:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: newest.id,
      documentId: document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 1_000 },
      occurredAt: new Date("2026-08-01T08:21:00.000Z"),
    }),
  ]);

  const response = await callServerFunction(fixture.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalyticsLink",
    method: "GET",
    data: { linkId: link.id, from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    expect.objectContaining({
      truncated: true,
      totals: {
        visits: ANALYTICS_VISIT_CAP,
        viewerIdentities: ANALYTICS_VISIT_CAP,
        emails: 0,
        totalMs: 1_000,
        downloads: 0,
      },
    }),
  );
});

test("a Link's analytics is not-found for another Organization", async () => {
  const [viewer, owner] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const { link } = await analyticsLinkFixture(owner, "Secret Link");

  const response = await callServerFunction(viewer.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalyticsLink",
    method: "GET",
    data: { linkId: link.id, from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(404);
});

test("a Document's analytics is one row per reaching Link and has no combined total", async () => {
  const [first, second] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const document = await createFixtureDocument({
    organizationId: first.organization.id,
    createdBy: first.owner.user.id,
    title: "Shared Document",
  });
  const otherDocument = await createFixtureDocument({
    organizationId: first.organization.id,
    createdBy: first.owner.user.id,
    title: "Other Document",
  });
  const vault = await createFixtureVault({ organizationId: first.organization.id });
  await createFixtureVaultItem({ vaultId: vault.id, documentId: document.id });

  const [direct, vaultLink, unrelated, otherOrganization] = await Promise.all([
    createFixtureLink({
      organizationId: first.organization.id,
      createdBy: first.owner.user.id,
      documentId: document.id,
      name: "Direct Link",
    }),
    createFixtureLink({
      organizationId: first.organization.id,
      createdBy: first.owner.user.id,
      vaultId: vault.id,
      name: "Vault Link",
    }),
    createFixtureLink({
      organizationId: first.organization.id,
      createdBy: first.owner.user.id,
      documentId: otherDocument.id,
      name: "Unrelated Link",
    }),
    analyticsLinkFixture(second, "Other Organization Link"),
  ]);

  const [directVisit, vaultVisit, otherDocumentVisit, unrelatedVisit, otherOrganizationVisit] =
    await Promise.all([
      fixtureVisit(direct.id, "2026-08-01T12:00:00.000Z", { email: "captured@example.com" }),
      fixtureVisit(vaultLink.id, "2026-08-02T12:00:00.000Z"),
      fixtureVisit(vaultLink.id, "2026-08-03T12:00:00.000Z"),
      fixtureVisit(unrelated.id, "2026-08-04T12:00:00.000Z"),
      fixtureVisit(otherOrganization.link.id, "2026-08-10T12:00:00.000Z"),
    ]);

  await Promise.all([
    createFixtureVisitEvent({
      visitId: directVisit.id,
      documentId: document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 1_500 },
      occurredAt: new Date("2026-08-01T12:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: vaultVisit.id,
      documentId: document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 2_000 },
      occurredAt: new Date("2026-08-02T12:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: vaultVisit.id,
      documentId: document.id,
      type: "download",
      payload: { via: "button" },
      occurredAt: new Date("2026-08-02T12:02:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: otherDocumentVisit.id,
      documentId: otherDocument.id,
      type: "page_dwell",
      payload: { page: 1, ms: 9_999 },
      occurredAt: new Date("2026-08-03T12:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: unrelatedVisit.id,
      documentId: otherDocument.id,
      type: "page_dwell",
      payload: { page: 1, ms: 8_888 },
      occurredAt: new Date("2026-08-04T12:01:00.000Z"),
    }),
    createFixtureVisitEvent({
      visitId: otherOrganizationVisit.id,
      documentId: otherOrganization.document.id,
      type: "page_dwell",
      payload: { page: 1, ms: 7_777 },
      occurredAt: new Date("2026-08-10T12:01:00.000Z"),
    }),
  ]);

  const response = await callServerFunction(first.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalyticsDocument",
    method: "GET",
    data: { documentId: document.id, from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual({
    range: { from: "2026-08-01", to: "2026-08-17" },
    links: expect.arrayContaining([
      {
        linkId: direct.id,
        visits: 1,
        viewerIdentities: 1,
        emails: 1,
        totalMs: 1_500,
        downloads: 0,
      },
      {
        linkId: vaultLink.id,
        visits: 1,
        viewerIdentities: 1,
        emails: 0,
        totalMs: 2_000,
        downloads: 1,
      },
    ]),
  });
  expect(payload.links).toHaveLength(2);
  expect(payload).not.toHaveProperty("totals");
  expect(payload).not.toHaveProperty("allTimeVisits");
  expect(JSON.stringify(payload)).not.toContain("Direct Link");
  expect(JSON.stringify(payload)).not.toContain(unrelated.id);
});

test("a Document in no Links returns an empty Link list", async () => {
  const fixture = await createOrganizationFixture();
  const document = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.owner.user.id,
    title: "Unshared Document",
  });

  const response = await callServerFunction(fixture.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalyticsDocument",
    method: "GET",
    data: { documentId: document.id, from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    range: { from: "2026-08-01", to: "2026-08-17" },
    links: [],
  });
});

test("a Document's analytics is not-found for another Organization", async () => {
  const [viewer, owner] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const document = await createFixtureDocument({
    organizationId: owner.organization.id,
    createdBy: owner.owner.user.id,
    title: "Secret Document",
  });

  const response = await callServerFunction(viewer.member.http, {
    modulePath: analyticsModulePath,
    exportName: "getAnalyticsDocument",
    method: "GET",
    data: { documentId: document.id, from: "2026-08-01", to: "2026-08-17" },
  });

  expect(response.status).toBe(404);
});
