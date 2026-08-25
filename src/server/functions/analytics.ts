import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { analyticsRangeSchema } from "#/lib/dashboard-search";
import { orgMiddleware } from "#/server/auth-middleware";
import { documentIdSchema, linkIdSchema } from "#/server/ids";
import {
  countLinkVisits as countLinkVisitsInRepository,
  readAnalyticsDocument,
  readAnalyticsLink,
  readAnalyticsOverview,
} from "#/server/repositories/analytics";

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(analyticsRangeSchema)
  .handler(async ({ context, data }) => ({
    ...(await readAnalyticsOverview(context.orgId, data)),
    ...(context.demoEnvironment?.analyticsIncomplete ? { analyticsIncomplete: true as const } : {}),
  }));

export const getAnalyticsLink = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(analyticsRangeSchema.and(z.object({ linkId: linkIdSchema })))
  .handler(async ({ context, data }) => {
    const found = await readAnalyticsLink(context.orgId, data.linkId, data);
    if (!found) throw notFound();
    return {
      ...found,
      ...(context.demoEnvironment?.analyticsIncomplete
        ? { analyticsIncomplete: true as const }
        : {}),
    };
  });

export const getAnalyticsDocument = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(analyticsRangeSchema.and(z.object({ documentId: documentIdSchema })))
  .handler(async ({ context, data }) => {
    const found = await readAnalyticsDocument(context.orgId, data.documentId, data);
    if (!found) throw notFound();
    return {
      ...found,
      ...(context.demoEnvironment?.analyticsIncomplete
        ? { analyticsIncomplete: true as const }
        : {}),
    };
  });

export const countLinkVisits = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .validator(z.object({ linkId: linkIdSchema }))
  .handler(async ({ context, data }) => {
    const visits = await countLinkVisitsInRepository(context.orgId, data.linkId);
    if (visits === null) throw notFound();
    return visits;
  });
