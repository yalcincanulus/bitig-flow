import { expect, test } from "vitest";

import { resolveStorageEndpoints, trimStorageEndpoint } from "#/lib/storage-endpoints";

test("trims a trailing slash so the SDK host stays stable", () => {
  expect(trimStorageEndpoint("https://s3.example.com/")).toBe("https://s3.example.com");
});

test("the public endpoint defaults to the in-cluster endpoint", () => {
  expect(resolveStorageEndpoints({ S3_ENDPOINT: "http://garage:3900" })).toEqual({
    endpoint: "http://garage:3900",
    publicEndpoint: "http://garage:3900",
  });
});

test("a public endpoint is what browsers PUT to, not the in-cluster host", () => {
  expect(
    resolveStorageEndpoints({
      S3_ENDPOINT: "http://garage:3900/",
      S3_PUBLIC_ENDPOINT: "https://s3.example.com/",
    }),
  ).toEqual({
    endpoint: "http://garage:3900",
    publicEndpoint: "https://s3.example.com",
  });
});

test("S3_ENDPOINT is required", () => {
  expect(() => resolveStorageEndpoints({})).toThrow("S3_ENDPOINT is required");
});
