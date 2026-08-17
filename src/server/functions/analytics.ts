import { createServerFn } from "@tanstack/react-start";

import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { orgMiddleware } from "#/server/auth-middleware";

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(analyticsRangeSchema)
  .handler(({ context, data }) => ({
    organizationId: context.orgId,
    range: data,
    links: [],
  }));
