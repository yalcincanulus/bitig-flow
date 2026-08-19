import { createFileRoute } from "@tanstack/react-router";

import { ViewerGatePage } from "#/components/viewer-gate-page";
import { loadVisitorPage } from "#/server/viewer/load-visitor-page";

export const Route = createFileRoute("/v/$slug")({
  preload: false,
  staleTime: 0,
  loader: ({ params }) => loadVisitorPage({ data: { slug: params.slug } }),
  component: VisitorSlugPage,
});

function VisitorSlugPage() {
  const page = Route.useLoaderData();
  return <ViewerGatePage page={page} />;
}
