import { createServerFn } from "@tanstack/react-start";

import { publicPortfolioAvailability } from "#/lib/public-portfolio";
import { publicMiddleware } from "#/server/auth-middleware";
import { demoSampleByteSize } from "#/server/demo-samples";
import { deploymentRuntimeCapabilities } from "#/server/deployment-capabilities";
import { readPublicDemoCapacityUsage } from "#/server/repositories/demo-environments";
import { readDeploymentPolicy } from "#/server/repositories/deployment-policy";
import { platformOperatorEnrolled } from "#/server/repositories/platform-operator-binding";

export const publicPortfolioStatus = createServerFn({ method: "GET" })
  .middleware([publicMiddleware])
  .handler(async () => {
    try {
      const [policy, usage, operatorEnrolled] = await Promise.all([
        readDeploymentPolicy(),
        readPublicDemoCapacityUsage(),
        platformOperatorEnrolled(),
      ]);
      const capability = await deploymentRuntimeCapabilities(operatorEnrolled);
      return publicPortfolioAvailability(policy, capability, usage, demoSampleByteSize);
    } catch {
      return { demo: "unavailable", signUp: false } as const;
    }
  });
