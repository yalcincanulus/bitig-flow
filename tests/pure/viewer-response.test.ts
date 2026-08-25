import { describe, expect, it } from "vitest";

import { finishUnavailableViewerGet } from "#/server/viewer/visitor-gate-post";

describe("Viewer refusal response", () => {
  it("discards a body when availability changes after rendering", async () => {
    const response = finishUnavailableViewerGet(
      new Response("private rendered content", {
        headers: { "content-length": "24", "content-type": "text/html" },
      }),
      503,
      false,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
    expect((response as Response).headers.get("content-length")).toBeNull();
    expect((response as Response).headers.get("content-type")).toBeNull();
    expect(await (response as Response).text()).toBe("");
  });

  it("preserves the safe body when the request began unavailable", async () => {
    const response = finishUnavailableViewerGet(
      new Response("This temporary content is being removed."),
      503,
      true,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
    expect(await (response as Response).text()).toContain("being removed");
  });
});
