import { randomUUID } from "node:crypto";

import { visit, visitEvent } from "#/server/db/schema";

import { database } from "./services";

type VisitFixtureOptions = Pick<
  typeof visit.$inferInsert,
  | "linkId"
  | "visitorId"
  | "email"
  | "emailVerified"
  | "gateVersion"
  | "startedAt"
  | "lastSeenAt"
  | "expiresAt"
  | "userAgent"
  | "ipHash"
>;

type VisitEventFixtureOptions = Pick<
  typeof visitEvent.$inferInsert,
  "visitId" | "documentId" | "type" | "payload" | "occurredAt"
>;

export async function createFixtureVisit(options: VisitFixtureOptions) {
  // The Gate always stamps now. This fixture writes the table directly so range tests can use
  // explicit historical timestamps without changing the production clock.
  const [created] = await database
    .insert(visit)
    .values({ id: randomUUID(), ...options })
    .returning();

  if (!created) throw new Error("Visit fixture insert returned no row");
  return created;
}

export async function createFixtureVisitEvent(options: VisitEventFixtureOptions) {
  // Event timestamps are explicit for the same reason as Visit timestamps above.
  const [created] = await database
    .insert(visitEvent)
    .values({ id: randomUUID(), ...options })
    .returning();

  if (!created) throw new Error("Visit Event fixture insert returned no row");
  return created;
}
