import { test as base } from "vitest";

import { createCookieClient } from "../fixtures/http";

export const test = base.extend<{ http: typeof fetch }>({
  // oxlint-disable-next-line no-empty-pattern -- Vitest requires fixture context destructuring.
  http: async ({}, use) => {
    await use(createCookieClient().http);
  },
});
