import { and, eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { viewerBeaconUrl } from "#/lib/document-bytes";
import { createDwellAccumulator, dwellTickMs, type DwellBeaconBody } from "#/lib/dwell-accumulator";
import { visit, visitEvent } from "#/server/db/schema";

import {
  createCookieClient,
  createFixtureDocument,
  createFixtureLink,
  createFixtureUploadedDocument,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
  database,
  readUploadSample,
} from "../fixtures";

function viewerUrl(slug: string) {
  return new URL(`/v/${slug}`, process.env.BETTER_AUTH_URL);
}

function viewerMemberUrl(slug: string, documentId: string) {
  return new URL(`/v/${slug}/${documentId}`, process.env.BETTER_AUTH_URL);
}

function beaconUrl(slug: string) {
  return new URL(viewerBeaconUrl(slug), process.env.BETTER_AUTH_URL);
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
    .where(and(eq(visit.linkId, linkId), eq(visitEvent.type, "page_dwell")));
}

async function openPublicLink(http: typeof fetch, slug: string) {
  expect((await http(viewerUrl(slug), { redirect: "manual" })).status).toBe(200);
}

function dwellThroughBeacon(http: typeof fetch, slug: string) {
  let now = 0;
  const inflight: Promise<Response>[] = [];
  const accumulator = createDwellAccumulator({
    now: () => now,
    send: (body: DwellBeaconBody) => {
      inflight.push(
        http(beaconUrl(slug), {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: JSON.stringify(body),
          redirect: "manual",
        }),
      );
      return true;
    },
  });

  return {
    accumulator,
    tick() {
      now += dwellTickMs;
      accumulator.tick();
    },
    async handedOff() {
      const responses = await Promise.all(inflight);
      inflight.length = 0;
      for (const response of responses) {
        expect(response.status).toBe(204);
      }
    },
  };
}

test("reading a markdown Document produces page_dwell rows with page 1", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
  });
  const client = createCookieClient();
  await openPublicLink(client.http, published.slug);

  const dwell = dwellThroughBeacon(client.http, published.slug);
  dwell.accumulator.setCurrent(documentRow.id, 1);
  dwell.tick();
  dwell.accumulator.flush("unmount");
  await dwell.handedOff();

  expect(await eventsForLink(published.id)).toEqual([
    { type: "page_dwell", payload: { page: 1, ms: dwellTickMs }, documentId: documentRow.id },
  ]);
});

test("reading an image Document produces page_dwell rows with page 1", async () => {
  const fixture = await createOrganizationFixture();
  const documentRow = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    contentType: "image/png",
    fileName: "board-deck.png",
    bytes: readUploadSample("pixel.png"),
  });
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: documentRow.id,
  });
  const client = createCookieClient();
  await openPublicLink(client.http, published.slug);

  const dwell = dwellThroughBeacon(client.http, published.slug);
  dwell.accumulator.setCurrent(documentRow.id, 1);
  dwell.tick();
  dwell.accumulator.flush("unmount");
  await dwell.handedOff();

  expect(await eventsForLink(published.id)).toEqual([
    { type: "page_dwell", payload: { page: 1, ms: dwellTickMs }, documentId: documentRow.id },
  ]);
});

test("one accumulator instance names both Vault members in a single Beacon", async () => {
  const fixture = await createOrganizationFixture();
  const [first, second] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
  ]);
  const vault = await createFixtureVault({ organizationId: fixture.organization.id });
  await Promise.all([
    createFixtureVaultItem({ vaultId: vault.id, documentId: first.id }),
    createFixtureVaultItem({ vaultId: vault.id, documentId: second.id }),
  ]);
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    vaultId: vault.id,
  });
  const client = createCookieClient();
  await openPublicLink(client.http, published.slug);
  expect(
    (await client.http(viewerMemberUrl(published.slug, first.id), { redirect: "manual" })).status,
  ).toBe(200);
  expect(
    (await client.http(viewerMemberUrl(published.slug, second.id), { redirect: "manual" })).status,
  ).toBe(200);

  const dwell = dwellThroughBeacon(client.http, published.slug);
  dwell.accumulator.setCurrent(first.id, 1);
  dwell.tick();
  dwell.accumulator.setCurrent(second.id, 1);
  dwell.tick();
  dwell.accumulator.flush("unmount");
  await dwell.handedOff();

  const events = await eventsForLink(published.id);
  expect(events).toHaveLength(2);
  expect(events).toEqual(
    expect.arrayContaining([
      { type: "page_dwell", payload: { page: 1, ms: dwellTickMs }, documentId: first.id },
      { type: "page_dwell", payload: { page: 1, ms: dwellTickMs }, documentId: second.id },
    ]),
  );
});
