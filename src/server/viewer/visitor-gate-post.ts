import type { VisitorGateSsr } from "#/server/viewer/submit-gate";

export function responseFromDeferred(deferred: unknown) {
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

export function finishVisitorGatePost<T>(
  outcome: Response | VisitorGateSsr,
  deferred: T,
): T | Response {
  if (outcome instanceof Response) return outcome;
  if (outcome.status === 200) return deferred;
  const current = responseFromDeferred(deferred);
  if (!current) return deferred;
  const headers = new Headers(current.headers);
  if (outcome.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(outcome.retryAfterSeconds));
  }
  return new Response(current.body, { status: outcome.status, headers });
}

export function finishUnavailableViewerGet<T>(
  deferred: T,
  status: 410 | 503,
  initiallyUnavailable: boolean,
): T | Response {
  const current = responseFromDeferred(deferred);
  if (!current) return deferred;
  if (initiallyUnavailable) {
    return new Response(current.body, { status, headers: current.headers });
  }
  const headers = new Headers(current.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Type");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(null, { status, headers });
}
