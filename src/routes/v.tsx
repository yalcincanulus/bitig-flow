import { notFound, Outlet, createFileRoute } from "@tanstack/react-router";

import { ViewerColumn } from "#/components/viewer-column";
import { ViewerTerminalPage } from "#/components/viewer-terminal-page";
import { viewerContentSecurityPolicy } from "#/lib/content-security-policy";

export const Route = createFileRoute("/v")({
  // The /v subtree takes no search parameters (ADR-0033).
  validateSearch: () => ({}),
  beforeLoad: ({ location }) => {
    if (location.pathname === "/v" || location.pathname === "/v/") throw notFound();
  },
  headers: () => ({
    "Content-Security-Policy": viewerContentSecurityPolicy(),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  notFoundComponent: ViewerTerminal,
  component: ViewerLayout,
});

function ViewerLayout() {
  return (
    <ViewerColumn>
      <Outlet />
    </ViewerColumn>
  );
}

function ViewerTerminal() {
  return (
    <ViewerColumn>
      <ViewerTerminalPage />
    </ViewerColumn>
  );
}
