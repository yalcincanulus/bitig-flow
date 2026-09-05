import { describe, expect, test } from "vitest";

import { dashboardNotFound } from "#/lib/dashboard-not-found";

describe("dashboardNotFound", () => {
  test("a missing Document route recovers to Documents, including the editor", () => {
    const expected = {
      title: "This document isn't here",
      description: "It may have been removed, or it is not in this organization.",
      recovery: { label: "Back to documents", link: { to: "/dashboard/documents" } },
    };

    expect(dashboardNotFound("/dashboard/documents/document-1")).toEqual(expected);
    expect(dashboardNotFound("/dashboard/documents/document-1/edit")).toEqual(expected);
  });

  test("a missing Vault route recovers to Vaults", () => {
    expect(dashboardNotFound("/dashboard/vaults/vault-1")).toEqual({
      title: "This vault isn't here",
      description: "It may have been removed, or it is not in this organization.",
      recovery: { label: "Back to vaults", link: { to: "/dashboard/vaults" } },
    });
  });

  test("a missing Link route recovers to Links", () => {
    expect(dashboardNotFound("/dashboard/links/link-1")).toEqual({
      title: "This link isn't here",
      description: "It may have been removed, or it is not in this organization.",
      recovery: { label: "Back to links", link: { to: "/dashboard/links" } },
    });
  });

  test("a missing analytics Link recovers to Analytics", () => {
    expect(dashboardNotFound("/dashboard/analytics/link-1")).toEqual({
      title: "This link isn't here",
      description: "It may have been removed, or it is not in this organization.",
      recovery: { label: "Back to analytics", link: { to: "/dashboard/analytics" } },
    });
  });

  test("the Analytics destination itself is not treated as a missing Link", () => {
    expect(dashboardNotFound("/dashboard/analytics")).toEqual({
      title: "This page isn't here",
      description: "No page exists at this address.",
    });
  });

  test("an unmatched Dashboard path stays a fuzzy not-found without inventing a list destination", () => {
    expect(dashboardNotFound("/dashboard/does-not-exist")).toEqual({
      title: "This page isn't here",
      description: "No page exists at this address.",
    });
    expect(dashboardNotFound("/dashboard/documents")).toEqual({
      title: "This page isn't here",
      description: "No page exists at this address.",
    });
  });
});
