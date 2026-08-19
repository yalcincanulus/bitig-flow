import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { ViewerGatePage } from "#/components/viewer-gate-page";
import { gateCredential } from "#/server/viewer/gate-credential";
import { loadVisitorPage } from "#/server/viewer/load-visitor-page";
import { submitVisitorGate } from "#/server/viewer/submit-gate";

function responseFromDeferred(deferred: unknown) {
  if (deferred instanceof Response) return deferred;
  if (!deferred || typeof deferred !== "object" || !("response" in deferred)) return undefined;
  const inner = deferred.response;
  if (inner instanceof Response) return inner;
  if (
    inner &&
    typeof inner === "object" &&
    "response" in inner &&
    inner.response instanceof Response
  ) {
    return inner.response;
  }
  return undefined;
}

export const Route = createFileRoute("/v/$slug")({
  preload: false,
  staleTime: 0,
  loader: ({ params }) => loadVisitorPage({ data: { slug: params.slug } }),
  server: {
    middleware: [gateCredential],
    handlers: {
      POST: async ({ params, next }) => {
        const outcome = await submitVisitorGate(params.slug);
        if (outcome instanceof Response) return outcome;
        const deferred = await Promise.resolve(next());
        if (outcome.status === 200) return deferred;
        const current = responseFromDeferred(deferred);
        if (!current) return deferred;
        const headers = new Headers(current.headers);
        if (outcome.retryAfterSeconds !== undefined) {
          headers.set("Retry-After", String(outcome.retryAfterSeconds));
        }
        return new Response(current.body, { status: outcome.status, headers });
      },
    },
  },
  component: VisitorSlugPage,
});

function VisitorSlugPage() {
  const page = Route.useLoaderData();
  return <ViewerGatePage page={page} />;
}
