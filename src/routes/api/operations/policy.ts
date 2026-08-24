import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { deploymentPolicySchema } from "#/lib/deployment-policy";
import { operatorMiddleware } from "#/server/auth-middleware";
import { deploymentRuntimeCapabilities } from "#/server/deployment-capabilities";
import {
  deploymentPolicyImpact,
  deploymentPolicyView,
  updateDeploymentPolicy,
} from "#/server/repositories/deployment-policy";

const noStoreHeaders = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/operations/policy")({
  server: {
    middleware: [operatorMiddleware],
    handlers: {
      GET: async () =>
        Response.json(await deploymentPolicyView(await deploymentRuntimeCapabilities(true)), {
          headers: noStoreHeaders,
        }),
      PUT: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { error: "Policy must be valid JSON" },
            { status: 400, headers: noStoreHeaders },
          );
        }
        const parsed = deploymentPolicySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Deployment Policy is invalid", issues: parsed.error.issues },
            { status: 422, headers: noStoreHeaders },
          );
        }
        return Response.json(
          { impact: await deploymentPolicyImpact(parsed.data) },
          { headers: noStoreHeaders },
        );
      },
      POST: async ({ request, context }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { error: "Policy must be valid JSON" },
            { status: 400, headers: noStoreHeaders },
          );
        }

        const parsed = deploymentPolicySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Deployment Policy is invalid", issues: parsed.error.issues },
            { status: 422, headers: noStoreHeaders },
          );
        }

        const capability = await deploymentRuntimeCapabilities(true);
        if (parsed.data.signUpEnabled && (!capability.mail || !capability.recovery)) {
          return Response.json(
            { error: "Signup requires healthy mail and recovery capability" },
            { status: 422, headers: noStoreHeaders },
          );
        }

        await updateDeploymentPolicy(context.operatorUserId, parsed.data);
        return Response.json(await deploymentPolicyView(capability), {
          headers: noStoreHeaders,
        });
      },
    },
  },
});
