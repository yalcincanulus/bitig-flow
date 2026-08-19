import { describe, expect, test } from "vitest";

import { isLinkSlug, mintLinkSlug } from "#/lib/link-slug";
import { sharePasswordRefusal } from "#/lib/share-password";

describe("mintLinkSlug", () => {
  test("mints twelve Bitcoin-base58 characters from random bytes", () => {
    const bytes = Uint8Array.from({ length: 12 }, (_, index) => index);
    expect(mintLinkSlug(bytes)).toBe("123456789ABC");
    expect(isLinkSlug(mintLinkSlug(bytes))).toBe(true);
  });

  test("rejects a slug that uses 0, O, I, or l", () => {
    expect(isLinkSlug("000000000000")).toBe(false);
    expect(isLinkSlug("OOOOOOOOOOOO")).toBe(false);
    expect(isLinkSlug("IIIIIIIIIIII")).toBe(false);
    expect(isLinkSlug("llllllllllll")).toBe(false);
    expect(isLinkSlug("123456789ABC")).toBe(true);
  });
});

describe("sharePasswordRefusal", () => {
  test("refuses short, Organization-named, and deny-listed passwords", () => {
    expect(sharePasswordRefusal("short", "Acme")).toBe("too_short");
    expect(sharePasswordRefusal("Acme Corp", "Acme Corp")).toBe("organization_name");
    expect(sharePasswordRefusal("password", "Acme")).toBe("denied");
    expect(sharePasswordRefusal("launch-gate", "Acme")).toBeUndefined();
  });
});
