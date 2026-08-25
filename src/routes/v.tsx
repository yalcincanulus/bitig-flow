import { notFound, Outlet, createFileRoute } from "@tanstack/react-router";

import { ViewerColumn } from "#/components/viewer-column";
import { ViewerShell } from "#/components/viewer-shell";
import { ViewerTerminalPage } from "#/components/viewer-terminal-page";
import { ViewerDwell } from "#/components/viewer-dwell";
import { viewerContentSecurityPolicy } from "#/lib/content-security-policy";

export const Route = createFileRoute("/v")({
  // The /v subtree takes no search parameters (ADR-0033).
  validateSearch: () => ({}),
  beforeLoad: ({ location }) => {
    if (location.pathname === "/v" || location.pathname === "/v/") throw notFound();
  },
  headers: () => ({
    "Content-Security-Policy": viewerContentSecurityPolicy(),
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow, noarchive" }],
  }),
  notFoundComponent: ViewerTerminal,
  component: ViewerLayout,
});

function ViewerLayout() {
  return (
    <ViewerDwell>
      <Outlet />
    </ViewerDwell>
  );
}

function ViewerTerminal() {
  return (
    <ViewerShell>
      <ViewerColumn>
        <ViewerTerminalPage />
      </ViewerColumn>
    </ViewerShell>
  );
}
