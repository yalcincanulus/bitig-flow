import { createServerFn } from "@tanstack/react-start";

import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { orgMiddleware } from "#/server/auth-middleware";
import { readAnalyticsOverview } from "#/server/repositories/analytics";

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(analyticsRangeSchema)
  .handler(({ context, data }) => readAnalyticsOverview(context.orgId, data));
