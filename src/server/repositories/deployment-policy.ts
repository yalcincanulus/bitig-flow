import { eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { deploymentPolicy } from "#/server/db/schema";
import { mailCapabilityAvailable } from "#/server/email-config";
import { effectiveSignUpAvailability } from "#/server/sign-up-availability";

export async function deploymentPolicyAllowsSignUp() {
  const [policy] = await db
    .select({ signUpEnabled: deploymentPolicy.signUpEnabled })
    .from(deploymentPolicy)
    .where(eq(deploymentPolicy.id, "deployment"))
    .limit(1);

  return policy?.signUpEnabled === true;
}

export async function signUpAvailable() {
  const mailAvailable = mailCapabilityAvailable();
  return effectiveSignUpAvailability({
    policyAllowsSignUp: await deploymentPolicyAllowsSignUp(),
    mailAvailable,
    // Recovery is configured through Better Auth whenever mail can carry its reset link.
    recoveryReady: mailAvailable,
  });
}
