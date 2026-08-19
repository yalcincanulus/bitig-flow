import { getRequest } from "@tanstack/react-start/server";

import type { VisitorPage } from "#/server/viewer/visitor-gate";

export function visitorPageRetryAfterSeconds(page: VisitorPage) {
  if (page.status === "rate_limited") return page.retryAfterSeconds;
  if (page.status === "gate" && page.retryAfterSeconds !== undefined) return page.retryAfterSeconds;
  return undefined;
}

const visitorPageByRequest = new WeakMap<Request, VisitorPage>();

export function stashVisitorPage(page: VisitorPage) {
  visitorPageByRequest.set(getRequest(), page);
}

export function stashedVisitorPage() {
  return visitorPageByRequest.get(getRequest());
}
