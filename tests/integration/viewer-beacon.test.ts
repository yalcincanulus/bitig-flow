import { and, eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { visit, visitEvent } from "#/server/db/schema";
import { beaconLimit } from "#/server/viewer/beacon-limit";

import {
  callServerFunction,
  createCookieClient,
  createFixtureDocument,
  createFixtureLink,
  createFixtureVault,
  createFixtureVaultItem,
  createOrganizationFixture,
  database,
} from "../fixtures";

const linksModulePath = "/src/server/functions/links.ts";

function beaconUrl(slug: string) {
  return new URL(`/v/${slug}/beacon`, process.env.BETTER_AUTH_URL);
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

async function postBeacon(
  http: typeof fetch,
  slug: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return http(beaconUrl(slug), {
    method: "POST",
    headers: { "content-type": "text/plain", ...extraHeaders },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

async function expectEmpty204(response: Response) {
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
}

test("POST /v/$slug/beacon appends page_dwell rows for a valid Visit cookie", async () => {
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
  const client = await openPublicLink(published.slug);

  const response = await postBeacon(client.http, published.slug, {
    documents: { [documentRow.id]: { "1": 1500 } },
    seq: 1,
    nonce: "load-a",
  });

  await expectEmpty204(response);
  expect(await eventsForLink(published.id)).toEqual([
    { type: "page_dwell", payload: { page: 1, ms: 1500 }, documentId: documentRow.id },
  ]);
});

test("a body naming two Documents appends rows for both under one seq", async () => {
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
  const client = await openPublicLink(published.slug);

  await expectEmpty204(
    await postBeacon(client.http, published.slug, {
      documents: {
        [first.id]: { "1": 1000 },
        [second.id]: { "1": 2000 },
      },
      seq: 1,
      nonce: "load-a",
    }),
  );

  const events = await eventsForLink(published.id);
  expect(events).toHaveLength(2);
  expect(events).toEqual(
    expect.arrayContaining([
      { type: "page_dwell", payload: { page: 1, ms: 1000 }, documentId: first.id },
      { type: "page_dwell", payload: { page: 1, ms: 2000 }, documentId: second.id },
    ]),
  );
});

test("visit identity comes from the cookie; body and path identifiers are ignored", async () => {
  const fixture = await createOrganizationFixture();
  const [firstDocument, secondDocument] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
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
  const client = await openPublicLink(firstLink.slug);
  const cookie = await client.jar.getCookieString(beaconUrl(firstLink.slug).href);

  await expectEmpty204(
    await postBeacon(
      fetch,
      secondLink.slug,
      {
        documents: { [firstDocument.id]: { "1": 1500 } },
        seq: 1,
        nonce: "load-a",
        visit_id: secondLink.id,
        link_id: secondLink.id,
      },
      { cookie },
    ),
  );

  expect(await eventsForLink(firstLink.id)).toEqual([
    { type: "page_dwell", payload: { page: 1, ms: 1500 }, documentId: firstDocument.id },
  ]);
  expect(await eventsForLink(secondLink.id)).toEqual([]);
});

test("a repeat of the same nonce and seq appends nothing", async () => {
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
  const client = await openPublicLink(published.slug);
  const body = {
    documents: { [documentRow.id]: { "1": 1500 } },
    seq: 1,
    nonce: "load-a",
  };

  await expectEmpty204(await postBeacon(client.http, published.slug, body));
  await expectEmpty204(await postBeacon(client.http, published.slug, body));

  expect(await eventsForLink(published.id)).toEqual([
    { type: "page_dwell", payload: { page: 1, ms: 1500 }, documentId: documentRow.id },
  ]);
});

test("the same seq under a different nonce appends rows", async () => {
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
  const client = await openPublicLink(published.slug);

  await expectEmpty204(
    await postBeacon(client.http, published.slug, {
      documents: { [documentRow.id]: { "1": 1500 } },
      seq: 1,
      nonce: "load-a",
    }),
  );
  await expectEmpty204(
    await postBeacon(client.http, published.slug, {
      documents: { [documentRow.id]: { "1": 1500 } },
      seq: 1,
      nonce: "load-b",
    }),
  );

  expect(await eventsForLink(published.id)).toEqual([
    { type: "page_dwell", payload: { page: 1, ms: 1500 }, documentId: documentRow.id },
    { type: "page_dwell", payload: { page: 1, ms: 1500 }, documentId: documentRow.id },
  ]);
});

test("accumulated dwell for one visit, document, and page never exceeds thirty minutes", async () => {
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
  const client = await openPublicLink(published.slug);

  await expectEmpty204(
    await postBeacon(client.http, published.slug, {
      documents: { [documentRow.id]: { "1": 2_400_000 } },
      seq: 1,
      nonce: "load-a",
    }),
  );
  expect(await eventsForLink(published.id)).toEqual([
    { type: "page_dwell", payload: { page: 1, ms: 1_800_000 }, documentId: documentRow.id },
  ]);

  const second = await createOrganizationFixture();
  const secondDocument = await createFixtureDocument({
    organizationId: second.organization.id,
    createdBy: second.member.user.id,
  });
  const secondLink = await createFixtureLink({
    organizationId: second.organization.id,
    createdBy: second.member.user.id,
    documentId: secondDocument.id,
  });
  const secondClient = await openPublicLink(secondLink.slug);

  await expectEmpty204(
    await postBeacon(secondClient.http, secondLink.slug, {
      documents: { [secondDocument.id]: { "1": 1_200_000 } },
      seq: 1,
      nonce: "load-a",
    }),
  );
  await expectEmpty204(
    await postBeacon(secondClient.http, secondLink.slug, {
      documents: { [secondDocument.id]: { "1": 1_200_000 } },
      seq: 2,
      nonce: "load-a",
    }),
  );

  expect(await eventsForLink(secondLink.id)).toEqual([
    { type: "page_dwell", payload: { page: 1, ms: 1_200_000 }, documentId: secondDocument.id },
    { type: "page_dwell", payload: { page: 1, ms: 600_000 }, documentId: secondDocument.id },
  ]);
});

test("a documentId not Reachable from the Link's Target appends nothing", async () => {
  const fixture = await createOrganizationFixture();
  const [target, outsider] = await Promise.all([
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
    createFixtureDocument({
      organizationId: fixture.organization.id,
      createdBy: fixture.member.user.id,
    }),
  ]);
  const published = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: target.id,
  });
  const client = await openPublicLink(published.slug);
  await database
    .update(visit)
    .set({ lastSeenAt: new Date("2020-01-01T00:00:00.000Z") })
    .where(eq(visit.linkId, published.id));

  await expectEmpty204(
    await postBeacon(client.http, published.slug, {
      documents: { [outsider.id]: { "1": 1500 } },
      seq: 1,
      nonce: "load-a",
    }),
  );
  expect(await eventsForLink(published.id)).toEqual([]);
  const [untouched] = await database
    .select({ lastSeenAt: visit.lastSeenAt })
    .from(visit)
    .where(eq(visit.linkId, published.id));
  expect(untouched?.lastSeenAt.toISOString()).toBe("2020-01-01T00:00:00.000Z");
});

test("visit.last_seen_at moves on every accepted Beacon", async () => {
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
  const client = await openPublicLink(published.slug);
  await database
    .update(visit)
    .set({ lastSeenAt: new Date("2020-01-01T00:00:00.000Z") })
    .where(eq(visit.linkId, published.id));

  await expectEmpty204(
    await postBeacon(client.http, published.slug, {
      documents: { [documentRow.id]: { "1": 1500 } },
      seq: 1,
      nonce: "load-a",
    }),
  );

  const [row] = await database
    .select({ lastSeenAt: visit.lastSeenAt })
    .from(visit)
    .where(eq(visit.linkId, published.id));

  expect(row?.lastSeenAt.getTime()).toBeGreaterThan(new Date("2020-01-01T00:00:00.000Z").getTime());
});

test("the twenty-first Beacon in a minute is dropped", async () => {
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
  const client = await openPublicLink(published.slug);

  for (let seq = 1; seq <= beaconLimit; seq++) {
    await expectEmpty204(
      await postBeacon(client.http, published.slug, {
        documents: { [documentRow.id]: { "1": 10 } },
        seq,
        nonce: "load-a",
      }),
    );
  }

  await expectEmpty204(
    await postBeacon(client.http, published.slug, {
      documents: { [documentRow.id]: { "1": 10 } },
      seq: beaconLimit + 1,
      nonce: "load-a",
    }),
  );

  expect(await eventsForLink(published.id)).toHaveLength(beaconLimit);
});

test("the response is 204 with an empty body for a write, a forged Beacon, a duplicate, a rate-limited Beacon, and an invalidated Visit", async () => {
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
  const client = await openPublicLink(published.slug);
  const body = {
    documents: { [documentRow.id]: { "1": 1500 } },
    seq: 1,
    nonce: "load-a",
  };

  const written = await postBeacon(client.http, published.slug, body);
  const duplicate = await postBeacon(client.http, published.slug, body);
  const forged = await postBeacon(createCookieClient().http, published.slug, body);

  for (let seq = 2; seq < beaconLimit; seq++) {
    await postBeacon(client.http, published.slug, {
      documents: { [documentRow.id]: { "1": 10 } },
      seq,
      nonce: "load-a",
    });
  }
  const rateLimited = await postBeacon(client.http, published.slug, {
    documents: { [documentRow.id]: { "1": 10 } },
    seq: beaconLimit,
    nonce: "load-a",
  });

  await callServerFunction(fixture.owner.http, {
    modulePath: linksModulePath,
    exportName: "updateLink",
    method: "POST",
    data: {
      linkId: published.id,
      name: published.name,
      requiresEmail: false,
      requiresVerification: false,
      allowDownload: false,
      expiresAt: null,
      isActive: true,
      password: "rotated-gate",
    },
  });
  const invalidated = await postBeacon(client.http, published.slug, {
    documents: { [documentRow.id]: { "1": 1500 } },
    seq: 99,
    nonce: "load-b",
  });

  const snapshots = await Promise.all(
    [written, forged, duplicate, rateLimited, invalidated].map(async (response) => ({
      status: response.status,
      body: Buffer.from(await response.arrayBuffer()),
    })),
  );

  for (const snapshot of snapshots) {
    expect(snapshot).toEqual({ status: 204, body: Buffer.alloc(0) });
  }
});
