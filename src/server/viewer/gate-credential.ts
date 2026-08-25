import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { findVisitorLink, unavailableDemoViewerPage } from "#/server/viewer/visitor-gate";
import { responseFromDeferred } from "#/server/viewer/visitor-gate-post";

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
  return next();
});

export async function finishDemoViewerGet<T>(slug: string, deferred: T): Promise<T | Response> {
  const link = await findVisitorLink(slug);
  const unavailable = link ? unavailableDemoViewerPage(link) : undefined;
  if (!unavailable) return deferred;
  const current = responseFromDeferred(deferred);
  if (!current) return deferred;
  return new Response(current.body, {
    status: unavailable.reason === "expired" ? 410 : 503,
    headers: current.headers,
  });
}
