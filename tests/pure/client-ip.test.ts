import { expect, test } from "vitest";

import { getClientIp } from "#/server/client-ip";

test("development with no trusted proxies uses the socket address and ignores X-Forwarded-For", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.1, 198.51.100.2" });

  expect(getClientIp({ headers, trustedProxyCount: 0, socketAddress: "127.0.0.1" })).toBe(
    "127.0.0.1",
  );
});

test("one trusted proxy takes the rightmost X-Forwarded-For hop", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.1, 198.51.100.2" });

  expect(getClientIp({ headers, trustedProxyCount: 1, socketAddress: "10.0.0.1" })).toBe(
    "198.51.100.2",
  );
});

test("a missing or unparseable forwarded header in production shares the unknown bucket", () => {
  expect(getClientIp({ headers: new Headers(), trustedProxyCount: 1 })).toBe("unknown");
  expect(
    getClientIp({
      headers: new Headers({ "x-forwarded-for": "not an ip" }),
      trustedProxyCount: 1,
    }),
  ).toBe("unknown");
});
