import { createFileRoute } from "@tanstack/react-router";

import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { getAnalytics } from "#/server/functions/analytics";

export const Route = createFileRoute("/_authenticated/dashboard/analytics")({
  validateSearch: analyticsRangeSchema,
  loaderDeps: ({ search: { from, to } }) => ({ from, to }),
  loader: ({ deps }) => getAnalytics({ data: deps }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const analytics = Route.useLoaderData();

  return <p>{analytics.links.length}</p>;
}
