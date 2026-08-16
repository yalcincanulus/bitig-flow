import makeFetchCookie from "fetch-cookie";
import { test as base } from "vitest";

export const test = base.extend<{ http: typeof fetch }>({
  // oxlint-disable-next-line no-empty-pattern -- Vitest requires fixture context destructuring.
  http: async ({}, use) => {
    await use(makeFetchCookie(fetch));
  },
});
