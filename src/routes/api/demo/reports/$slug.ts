import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { demoReportInputSchema } from "#/lib/demo-operations";
import { hashAnalyticsValue } from "#/server/analytics-hash";
import { demoReportMiddleware } from "#/server/auth-middleware";
import { getClientIp } from "#/server/client-ip";
import { recordDemoReport } from "#/server/repositories/demo-reports";
import { findDemoReportTarget } from "#/server/viewer/demo-report-target";
import { requiredEnv, trustedProxyCount } from "#/server/runtime-env";

function response(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/demo/reports/$slug")({
  server: {
    middleware: [demoReportMiddleware],
    handlers: {
      POST: async ({ request, params }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return response({ code: "INVALID_DEMO_REPORT" }, 422);
        }
        const parsed = demoReportInputSchema.safeParse(body);
        if (!parsed.success) return response({ code: "INVALID_DEMO_REPORT" }, 422);

        const target = await findDemoReportTarget(params.slug);
        if (!target) return response({ code: "DEMO_CONTENT_UNAVAILABLE" }, 404);
        const ip = getClientIp({
          headers: request.headers,
          trustedProxyCount: trustedProxyCount(),
        });
        const day = new Date().toISOString().slice(0, 10);
        const networkHash = hashAnalyticsValue(
          requiredEnv("ANALYTICS_SALT"),
          `demo-report:${day}:${ip}`,
        );
        const result = await recordDemoReport({
          ...parsed.data,
          environmentId: target.environmentId,
          linkId: target.linkId,
          networkHash,
        });
        if (result.accepted) return response(result, 201);
        if (result.reason === "duplicate") return response(result, 409);
        if (result.reason === "network_rate" || result.reason === "global_rate") {
          return response(result, 429);
        }
        return response(result, 404);
      },
    },
  },
});
