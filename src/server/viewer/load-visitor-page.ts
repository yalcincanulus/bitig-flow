import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";

import { getRedis } from "#/server/redis";
import { matchingGateProgress, readGateProgress } from "#/server/viewer/gate-progress";
import { liveVisitForLink, mintVisitorVisit } from "#/server/viewer/mint-visit";
import { gateProgressCookieName } from "#/server/viewer/visit-cookies";
import {
  stashedVisitorPage,
  visitorPageRetryAfterSeconds,
} from "#/server/viewer/visitor-page-stash";
import { loadVisitorContent } from "#/server/viewer/load-visitor-content";
import { visitIdSchema } from "#/server/ids";
import {
  currentGateRequirement,
  findVisitorLink,
  gatePage,
  type VisitorPage,
} from "#/server/viewer/visitor-gate";

function applyLimitHeaders(page: VisitorPage) {
  const retryAfterSeconds = visitorPageRetryAfterSeconds(page);
  if (retryAfterSeconds === undefined) return page;
  setResponseStatus(429);
  setResponseHeader("Retry-After", String(retryAfterSeconds));
  return page;
}

export const loadVisitorPage = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<VisitorPage> => {
    const stashed = stashedVisitorPage();
    if (stashed) return applyLimitHeaders(stashed);

    const link = await findVisitorLink(data.slug);
    if (!link) throw notFound();

    const live = await liveVisitForLink(link);
    if (live) return loadVisitorContent(link, visitIdSchema.parse(live.visitId));

    if (link.isPublic) {
      const minted = await mintVisitorVisit(link);
      if (minted.status === "rate_limited") return applyLimitHeaders(minted);
      return loadVisitorContent(link, minted.visitId);
    }

    const redis = await getRedis();
    const progress = matchingGateProgress(
      link,
      await readGateProgress(redis, getCookie(gateProgressCookieName)),
    );
    const current = currentGateRequirement(link, progress);
    if (current === "satisfied") return gatePage(link, "email", progress);
    return gatePage(link, current, progress);
  });
