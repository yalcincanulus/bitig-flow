import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { ViewerPage } from "#/components/viewer-page";
import { finishDemoViewerGet, gateCredential } from "#/server/viewer/gate-credential";
import { loadVisitorPage } from "#/server/viewer/load-visitor-page";
import { submitVisitorGate } from "#/server/viewer/submit-gate";
import { finishVisitorGatePost } from "#/server/viewer/visitor-gate-post";

export const Route = createFileRoute("/v/$slug/")({
  preload: false,
  staleTime: 0,
  loader: ({ params }) => loadVisitorPage({ data: { slug: params.slug } }),
  server: {
    middleware: [gateCredential],
    handlers: {
      GET: async ({ params, next, context }) =>
        finishDemoViewerGet(
          params.slug,
          await Promise.resolve(next()),
          context.demoViewerUnavailable,
          context.demoViewerEnvironmentId,
        ),
      POST: async ({ params, next }) =>
        finishVisitorGatePost(await submitVisitorGate(params.slug), await Promise.resolve(next())),
    },
  },
  component: VisitorSlugPage,
});

function VisitorSlugPage() {
  return <ViewerPage page={Route.useLoaderData()} />;
}
