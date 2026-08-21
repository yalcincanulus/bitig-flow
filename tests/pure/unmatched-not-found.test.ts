import { describe, expect, test } from "vitest";

import { unmatchedNotFoundSurface } from "#/lib/unmatched-not-found";

describe("unmatchedNotFoundSurface", () => {
  test("a Viewer path uses the Viewer terminal", () => {
    expect(unmatchedNotFoundSurface("/v")).toBe("viewer");
    expect(unmatchedNotFoundSurface("/v/")).toBe("viewer");
    expect(unmatchedNotFoundSurface("/v/missing-slug")).toBe("viewer");
  });

  test("a Dashboard path uses the Dashboard not-found", () => {
    expect(unmatchedNotFoundSurface("/dashboard")).toBe("dashboard");
    expect(unmatchedNotFoundSurface("/dashboard/")).toBe("dashboard");
    expect(unmatchedNotFoundSurface("/dashboard/documents/missing")).toBe("dashboard");
  });

  test("any other path is the public unmatched page", () => {
    expect(unmatchedNotFoundSurface("/")).toBe("public");
    expect(unmatchedNotFoundSurface("/sign-in")).toBe("public");
    expect(unmatchedNotFoundSurface("/does-not-exist")).toBe("public");
  });
});
