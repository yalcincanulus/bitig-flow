import { createServerFn } from "@tanstack/react-start";

import { userHasReachedOwnedOrganizationLimit } from "#/server/auth";
import { orgMiddleware } from "#/server/auth-middleware";
import {
  findDemoEnvironmentForUser,
  findDemoSampleResourceIds,
} from "#/server/repositories/demo-lifecycle";
import { readDeploymentPolicy } from "#/server/repositories/deployment-policy";

export const getDashboardContext = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(async ({ context }) => {
    const demo = context.authSession.user.isAnonymous
      ? await findDemoEnvironmentForUser(context.authSession.user.id)
      : undefined;
    const demoContext = demo
      ? await Promise.all([readDeploymentPolicy(), findDemoSampleResourceIds(demo.id)]).then(
          ([policy, samples]) => ({
            expiresAt: demo.expiresAt,
            confirmedBytes: demo.confirmedBytes,
            storageLimit: policy?.environmentConfirmedBytes,
            usage: {
              documents: demo.documentCount,
              vaults: demo.vaultCount,
              links: demo.linkCount,
            },
            limits: policy
              ? {
                  documents: policy.documentCount,
                  vaults: policy.vaultCount,
                  links: policy.linkCount,
                }
              : undefined,
            samples,
          }),
        )
      : undefined;
    return {
      session: context.authSession,
      organization: context.organization,
      role: context.role,
      demo: demoContext,
      atOwnedOrganizationLimit: await userHasReachedOwnedOrganizationLimit(
        context.authSession.user.id,
      ),
    };
  });
