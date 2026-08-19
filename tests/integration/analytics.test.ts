import { expect, test } from "vitest";

import {
  callServerFunction,
  createFixtureDocument,
  createFixtureLink,
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
