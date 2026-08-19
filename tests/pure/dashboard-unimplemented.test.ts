import { describe, expect, test } from "vitest";

import { dashboardUnimplemented } from "#/lib/dashboard-unimplemented";

describe("dashboardUnimplemented", () => {
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
