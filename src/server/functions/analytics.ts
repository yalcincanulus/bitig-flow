import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { orgMiddleware } from "#/server/auth-middleware";
import { linkIdSchema } from "#/server/ids";
import { readAnalyticsLink, readAnalyticsOverview } from "#/server/repositories/analytics";

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(analyticsRangeSchema)
  .handler(({ context, data }) => readAnalyticsOverview(context.orgId, data));

export const getAnalyticsLink = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(analyticsRangeSchema.and(z.object({ linkId: linkIdSchema })))
  .handler(async ({ context, data }) => {
    const found = await readAnalyticsLink(context.orgId, data.linkId, data);
    if (!found) throw notFound();
    return found;
  });
