import { expect, test } from "vitest";

import { callServerFunction, createOrganizationFixture } from "../fixtures";

const analyticsModulePath = "/src/server/functions/analytics.ts";

test("Analytics is scoped to the active Organization and requested date range", async () => {
  const [first, second] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const range = { from: "2026-08-01", to: "2026-08-17" };

  const [firstResponse, secondResponse] = await Promise.all(
    [first, second].map((fixture) =>
      callServerFunction(fixture.member.http, {
        modulePath: analyticsModulePath,
        exportName: "getAnalytics",
        method: "GET",
        data: range,
      }),
    ),
  );

  expect(firstResponse.status).toBe(200);
  expect(await firstResponse.json()).toEqual({
    organizationId: first.organization.id,
    range,
    links: [],
  });
  expect(secondResponse.status).toBe(200);
  expect(await secondResponse.json()).toEqual({
    organizationId: second.organization.id,
    range,
    links: [],
  });
});
