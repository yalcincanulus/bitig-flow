import { describe, expect, test } from "vitest";

import { dashboardBreadcrumbs, type DashboardPlace } from "#/lib/dashboard-breadcrumbs";

function labelsOf(place: DashboardPlace) {
  return dashboardBreadcrumbs(place).map((crumb) => crumb.label);
}

function currentPageOf(place: DashboardPlace) {
  return dashboardBreadcrumbs(place).filter((crumb) => crumb.link === undefined);
}

describe("dashboardBreadcrumbs", () => {
  test("names a top-level destination without inventing an Overview above it", () => {
    expect(labelsOf({ destination: "documents" })).toEqual(["Documents"]);
    expect(labelsOf({ destination: "vaults" })).toEqual(["Vaults"]);
    expect(labelsOf({ destination: "links" })).toEqual(["Links"]);
    expect(labelsOf({ destination: "analytics" })).toEqual(["Analytics"]);
    expect(labelsOf({ destination: "people" })).toEqual(["People"]);
    expect(labelsOf({ destination: "settings" })).toEqual(["Settings"]);
  });

  test("the destination a User is already on is the current page rather than a link", () => {
    expect(currentPageOf({ destination: "documents" })).toEqual([
      expect.objectContaining({ label: "Documents" }),
    ]);
  });

  test("a Preview hangs the Document's own title under Documents", () => {
    const trail = dashboardBreadcrumbs({
      destination: "documents",
      document: { id: "document-1", title: "Quarterly report" },
    });

    expect(trail.map((crumb) => crumb.label)).toEqual(["Documents", "Quarterly report"]);
    expect(trail[0]?.link).toEqual({ to: "/dashboard/documents" });
    expect(trail[1]?.link).toBeUndefined();
  });

  test("the editor keeps the Document between Documents and Edit, and the Document links to its Preview", () => {
    const trail = dashboardBreadcrumbs({
      destination: "documents",
      document: { id: "document-1", title: "Quarterly report", editing: true },
    });

    expect(trail.map((crumb) => crumb.label)).toEqual(["Documents", "Quarterly report", "Edit"]);
    expect(trail[1]?.link).toEqual({
      to: "/dashboard/documents/$documentId",
      params: { documentId: "document-1" },
    });
    expect(trail[2]?.link).toBeUndefined();
  });

  test("a Vault detail hangs the Vault's name under Vaults", () => {
    const trail = dashboardBreadcrumbs({
      destination: "vaults",
      vault: { id: "vault-1", name: "Board pack" },
    });

    expect(trail.map((crumb) => crumb.label)).toEqual(["Vaults", "Board pack"]);
    expect(trail[0]?.link).toEqual({ to: "/dashboard/vaults" });
  });

  test("a Link detail hangs the slug under Links, because a Link has no title", () => {
    const trail = dashboardBreadcrumbs({
      destination: "links",
      link: { id: "link-1", slug: "a1b2c3" },
    });

    expect(trail.map((crumb) => crumb.label)).toEqual(["Links", "a1b2c3"]);
    expect(trail[0]?.link).toEqual({ to: "/dashboard/links" });
  });

  test("an unresolved Document, Vault, or Link names its kind rather than its identifier", () => {
    expect(labelsOf({ destination: "documents", document: { id: "document-1" } })).toEqual([
      "Documents",
      "Document",
    ]);
    expect(
      labelsOf({ destination: "documents", document: { id: "document-1", editing: true } }),
    ).toEqual(["Documents", "Document", "Edit"]);
    expect(labelsOf({ destination: "vaults", vault: { id: "vault-1" } })).toEqual([
      "Vaults",
      "Vault",
    ]);
    expect(labelsOf({ destination: "links", link: { id: "link-1" } })).toEqual(["Links", "Link"]);
  });

  test("an analytics Link hangs its name under Analytics", () => {
    const trail = dashboardBreadcrumbs({
      destination: "analytics",
      link: { id: "link-1", name: "Board pack", slug: "a1b2c3" },
    });

    expect(trail.map((crumb) => crumb.label)).toEqual(["Analytics", "Board pack"]);
    expect(trail[0]?.link).toEqual({ to: "/dashboard/analytics" });
    expect(trail[1]?.link).toBeUndefined();
  });

  test("an unresolved analytics Link names its kind rather than its identifier", () => {
    expect(labelsOf({ destination: "analytics", link: { id: "link-1" } })).toEqual([
      "Analytics",
      "Link",
    ]);
  });

  test("only the crumbs carrying a Document, Vault, or Link's own words are the ones the toolbar truncates", () => {
    const trail = dashboardBreadcrumbs({
      destination: "documents",
      document: {
        id: "document-1",
        title: "A title long enough to need the toolbar's help",
        editing: true,
      },
    });

    expect(trail.map((crumb) => crumb.truncates)).toEqual([false, true, false]);
  });

  test("every crumb carries a key distinct from its siblings", () => {
    const keys = dashboardBreadcrumbs({
      destination: "documents",
      document: { id: "document-1", title: "Quarterly report", editing: true },
    }).map((crumb) => crumb.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
