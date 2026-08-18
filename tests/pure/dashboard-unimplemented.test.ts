import { describe, expect, test } from "vitest";

import { dashboardUnimplemented } from "#/lib/dashboard-unimplemented";

describe("dashboardUnimplemented", () => {
  test("Links names the destination and says the page is not implemented yet", () => {
    expect(dashboardUnimplemented("links")).toEqual({
      title: "Links",
      description: "Share a Document or a Vault through a Link that carries its own Gate.",
      emptyTitle: "Not implemented yet",
      emptyDescription:
        "This destination is part of the Dashboard. Its features are not built yet.",
    });
  });

  test("Analytics names the destination and says the page is not implemented yet", () => {
    expect(dashboardUnimplemented("analytics")).toEqual({
      title: "Analytics",
      description: "The analytics stream each Link produces.",
      emptyTitle: "Not implemented yet",
      emptyDescription:
        "This destination is part of the Dashboard. Its features are not built yet.",
    });
  });

  test("Settings names the destination and says the page is not implemented yet", () => {
    expect(dashboardUnimplemented("settings")).toEqual({
      title: "Settings",
      description:
        "Organization administration will live here. Membership is Better Auth's surface today.",
      emptyTitle: "Not implemented yet",
      emptyDescription:
        "This destination is part of the Dashboard. Its features are not built yet.",
    });
  });
});
