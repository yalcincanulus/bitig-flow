import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { findVisitorLink, unavailableDemoViewerPage } from "#/server/viewer/visitor-gate";
import { finishUnavailableViewerGet } from "#/server/viewer/visitor-gate-post";

function viewerSlug(pathname: string) {
  const [, surface, slug] = pathname.split("/");
  return surface === "v" && slug ? decodeURIComponent(slug) : undefined;
}

export const gateCredential = createMiddleware().server(async ({ next, request }) => {
  const slug = viewerSlug(new URL(request.url).pathname);
  const link = slug ? await findVisitorLink(slug) : null;
  const unavailable = link ? unavailableDemoViewerPage(link) : undefined;
  const pathname = new URL(request.url).pathname;
  if (
    unavailable &&
    (request.method !== "GET" || pathname.includes("/bytes/") || pathname.endsWith("/beacon"))
  ) {
    const status = unavailable.reason === "expired" ? 410 : 503;
    return new Response(null, {
      status,
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
  if (unavailable) setResponseStatus(unavailable.reason === "expired" ? 410 : 503);
  return next({
    context: {
      demoViewerEnvironmentId: link?.demo?.environmentId,
      demoViewerUnavailable: unavailable !== undefined,
    },
  });
});

export async function finishDemoViewerGet<T>(
  slug: string,
  deferred: T,
  initiallyUnavailable = false,
  initialDemoEnvironmentId?: string,
): Promise<T | Response> {
  const link = await findVisitorLink(slug);
  if (
    initialDemoEnvironmentId &&
    (!link?.demo || link.demo.environmentId !== initialDemoEnvironmentId)
  ) {
    return finishUnavailableViewerGet(deferred, 503, false);
  }
  const unavailable = link ? unavailableDemoViewerPage(link) : undefined;
  if (!unavailable) return deferred;
  const status = unavailable.reason === "expired" ? 410 : 503;
  return finishUnavailableViewerGet(deferred, status, initiallyUnavailable);
}
