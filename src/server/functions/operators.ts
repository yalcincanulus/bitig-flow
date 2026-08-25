import { createServerFn } from "@tanstack/react-start";

import { authedMiddleware, operatorMiddleware } from "#/server/auth-middleware";
import { deploymentRuntimeCapabilities } from "#/server/deployment-capabilities";
import {
  deploymentPolicyView,
  readDeploymentPolicy,
} from "#/server/repositories/deployment-policy";
import {
  readOperationsEnvironments,
  readOperationsPortfolio,
} from "#/server/repositories/demo-operations";
import { readMaintenanceStatus } from "#/server/repositories/maintenance-runs";
import { findPlatformOperatorBindingForUser } from "#/server/repositories/platform-operator-binding";

export const platformOperatorRouteAccess = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .handler(async ({ context }) => {
    const binding = await findPlatformOperatorBindingForUser(context.userId);
    return {
      isOperator: Boolean(binding),
      twoFactorEnrolled: context.authSession.user.twoFactorEnabled === true,
    };
  });

export const operationsHeader = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async ({ context }) => ({ email: context.authSession.user.email }));

export const operationsOverview = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async ({ context }) => {
    const capability = await deploymentRuntimeCapabilities(true);
    const [portfolio, policy, reaper, sweep] = await Promise.all([
      readOperationsPortfolio(),
      deploymentPolicyView(capability),
      readMaintenanceStatus("reaper"),
      readMaintenanceStatus("sweep"),
    ]);
    return {
      ...portfolio,
      operatorEmail: context.authSession.user.email,
      policy,
      maintenance: { reaper, sweep },
    };
  });

export const operationsEnvironments = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const [environments, policy] = await Promise.all([
      readOperationsEnvironments(),
      readDeploymentPolicy(),
    ]);
    return {
      observedAt: new Date(),
      globalPauseActive: policy?.pauseAllDemoAccess === true,
      environments,
    };
  });

export const operationsPolicy = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => deploymentPolicyView(await deploymentRuntimeCapabilities(true)));
