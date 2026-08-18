import { createFileRoute } from "@tanstack/react-router";

import { UnimplementedDashboardPage } from "#/components/unimplemented-dashboard-page";

// Organization administration is Better Auth's surface; this route is where it will be framed.
export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return <UnimplementedDashboardPage destination="settings" />;
}
