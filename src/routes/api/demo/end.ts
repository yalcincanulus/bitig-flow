import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { auth } from "#/server/auth";
import { orgMiddleware } from "#/server/auth-middleware";
import {
  findDemoEnvironmentForUser,
  terminateDemoEnvironment,
} from "#/server/repositories/demo-lifecycle";

export const Route = createFileRoute("/api/demo/end")({
  server: {
    middleware: [orgMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        const environment = await findDemoEnvironmentForUser(context.userId);
        if (!environment || environment.organizationId !== context.orgId) {
          return Response.json(
            { error: "Demo Environment not found" },
            { status: 404, headers: { "Cache-Control": "no-store" } },
          );
        }

        const signedOut = await (async () => {
          try {
            return await auth.api.signOut({
              headers: request.headers,
              returnHeaders: true,
            });
          } finally {
            // Persisted termination must start even if Better Auth cannot clear the browser cookie.
            await terminateDemoEnvironment(environment.id, "ended_by_demo_user");
          }
        })();

        const headers = new Headers({ "Cache-Control": "no-store" });
        for (const cookie of signedOut.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
        return Response.json({ ended: true }, { headers });
      },
    },
  },
});
