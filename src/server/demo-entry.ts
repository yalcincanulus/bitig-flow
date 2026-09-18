import { randomBytes } from "node:crypto";

import { makeSignature } from "better-auth/crypto";

import { effectiveDeploymentAvailability } from "#/lib/deployment-policy";
import { auth } from "#/server/auth";
import {
  DemoEntryInProgressError,
  demoAdmissionKey,
  demoEntryRecoveryMs,
  hashDemoEntryKey,
  reserveDemoAdmission,
  runIdempotentDemoEntry,
} from "#/server/demo-admission";
import { deploymentRuntimeCapabilities } from "#/server/deployment-capabilities";
import {
  activateDemoEnvironment,
  beginDemoProvisioningAttempt,
  createProvisioningDemoEnvironment,
  DemoStorageCapacityError,
  discardDemoProvisioningAttempt,
  findDemoEnvironmentForUser,
  findDemoProvisioningAttemptByEntryKeyHash,
  findReadyDemoEnvironmentByEntryKeyHash,
  markDemoProvisioningReady,
  recordDemoProvisioningAdmission,
  recordDemoProvisioningIdentity,
  releaseTrackedDemoProvisioningAdmission,
  removeUntrackedDemoIdentity,
  storeDemoSampleObjects,
  terminateDemoEnvironment,
} from "#/server/repositories/demo-lifecycle";
import {
  releaseGlobalDemoEnvironment,
  reserveGlobalDemoEnvironment,
} from "#/server/repositories/demo-environments";
import { readDeploymentPolicy } from "#/server/repositories/deployment-policy";
import { platformOperatorEnrolled } from "#/server/repositories/platform-operator-binding";
import { requiredEnv } from "#/server/runtime-env";

export class DemoEntryError extends Error {
  override readonly name = "DemoEntryError";

  constructor(
    readonly reason:
      | "unavailable"
      | "capacity"
      | "ipDailyLimit"
      | "durableSession"
      | "environmentUnavailable",
  ) {
    super("Demo entry is unavailable");
  }
}

function cookieHeader(setCookies: ReadonlyArray<string>) {
  return setCookies
    .map((cookie) => {
      const attributeStart = cookie.indexOf(";");
      return attributeStart === -1 ? cookie : cookie.slice(0, attributeStart);
    })
    .join("; ");
}

function demoSessionCookieName() {
  return new URL(requiredEnv("BETTER_AUTH_URL")).protocol === "https:"
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
}

async function demoSessionCookie(sessionToken: string, expiresAt: Date) {
  const signature = await makeSignature(sessionToken, requiredEnv("BETTER_AUTH_SECRET"));
  const maximumAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
  const secure = new URL(requiredEnv("BETTER_AUTH_URL")).protocol === "https:" ? "; Secure" : "";
  return `${demoSessionCookieName()}=${sessionToken}.${signature}; Max-Age=${maximumAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

async function provisionNewDemo(request: Request, entryKeyHash: string) {
  const policy = await readDeploymentPolicy();
  const capability = await deploymentRuntimeCapabilities(await platformOperatorEnrolled());
  if (!effectiveDeploymentAvailability(policy, capability).demos) {
    throw new DemoEntryError("unavailable");
  }

  const begun = await beginDemoProvisioningAttempt(
    entryKeyHash,
    new Date(Date.now() + demoEntryRecoveryMs),
  );
  if (!begun.created) {
    const recoverable = await findReadyDemoEnvironmentByEntryKeyHash(entryKeyHash);
    if (recoverable) {
      return {
        status: 200,
        body: {
          resumed: true,
          redirectTo: "/dashboard",
          expiresAt: recoverable.environment.expiresAt,
        },
        setCookies: [
          await demoSessionCookie(recoverable.sessionToken, recoverable.environment.expiresAt),
        ],
      };
    }
    throw new DemoEntryError("environmentUnavailable");
  }
  const attemptId = begun.attempt.id;
  const admissionKey = demoAdmissionKey(request.headers);

  let globalReserved = false;
  let createdUserId: string | undefined;
  let createdOrganizationId: string | undefined;
  let createdEnvironmentId: string | undefined;
  try {
    await recordDemoProvisioningAdmission(attemptId, admissionKey);
    const admission = await reserveDemoAdmission(admissionKey, attemptId);
    if (!admission.accepted) throw new DemoEntryError(admission.reason);

    const capacity = await reserveGlobalDemoEnvironment(attemptId);
    if (!capacity.accepted) throw new DemoEntryError("capacity");
    globalReserved = true;

    const signedIn = await auth.api.signInAnonymous({ returnHeaders: true });
    createdUserId = signedIn.response.user.id;
    await recordDemoProvisioningIdentity(attemptId, { userId: createdUserId });
    const setCookies = signedIn.headers.getSetCookie();
    const headers = new Headers({ cookie: cookieHeader(setCookies) });

    const createdOrganization = await auth.api.createOrganization({
      body: {
        name: "bitig-flow Demo",
        slug: `demo-${randomBytes(9).toString("base64url")}`,
        userId: createdUserId,
      },
    });
    if (!createdOrganization) throw new Error("Demo Organization was not created");
    createdOrganizationId = createdOrganization.id;
    await recordDemoProvisioningIdentity(attemptId, {
      userId: createdUserId,
      organizationId: createdOrganizationId,
    });

    const provisioned = await createProvisioningDemoEnvironment(
      createdUserId,
      createdOrganizationId,
      entryKeyHash,
      attemptId,
    );
    const { environment } = provisioned;
    createdEnvironmentId = environment.id;
    await storeDemoSampleObjects(provisioned.sampleObjects);
    await auth.api.setActiveOrganization({
      body: { organizationId: createdOrganizationId },
      headers,
    });
    const active = await activateDemoEnvironment(environment.id);
    await markDemoProvisioningReady(attemptId);

    return {
      status: 201,
      body: {
        resumed: false,
        redirectTo: "/dashboard",
        expiresAt: active.expiresAt,
      },
      setCookies,
    };
  } catch (error) {
    const cleanupFailures: unknown[] = [];
    try {
      await releaseTrackedDemoProvisioningAdmission(attemptId);
    } catch (cleanupError) {
      cleanupFailures.push(cleanupError);
    }
    if (createdEnvironmentId) {
      globalReserved = false;
      try {
        await terminateDemoEnvironment(createdEnvironmentId, "provisioning_failed");
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    } else if (createdUserId) {
      try {
        await removeUntrackedDemoIdentity(createdUserId, createdOrganizationId);
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    if (globalReserved) {
      try {
        await releaseGlobalDemoEnvironment(attemptId);
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    if (cleanupFailures.length === 0) {
      await discardDemoProvisioningAttempt(attemptId);
    }
    if (error instanceof DemoStorageCapacityError) throw new DemoEntryError("capacity");
    if (cleanupFailures.length > 0) {
      throw new AggregateError([error, ...cleanupFailures], "Demo provisioning and cleanup failed");
    }
    throw error;
  }
}

export async function enterDemo(request: Request, idempotencyKey: string) {
  const currentSession = await auth.api.getSession({ headers: request.headers });
  if (currentSession?.user.isAnonymous) {
    const environment = await findDemoEnvironmentForUser(currentSession.user.id);
    if (environment?.state === "active" && environment.expiresAt > new Date()) {
      return {
        status: 200,
        body: {
          resumed: true,
          redirectTo: "/dashboard",
          expiresAt: environment.expiresAt,
        },
        setCookies: [] as string[],
      };
    }
    if (environment && environment.expiresAt <= new Date()) {
      await terminateDemoEnvironment(environment.id, "expired");
    } else if (environment) {
      throw new DemoEntryError("environmentUnavailable");
    }
  } else if (currentSession) {
    throw new DemoEntryError("durableSession");
  }

  const entryKeyHash = hashDemoEntryKey(idempotencyKey);
  const now = new Date();
  const recoverable = await findReadyDemoEnvironmentByEntryKeyHash(entryKeyHash, now);
  if (recoverable) {
    return {
      status: 200,
      body: {
        resumed: true,
        redirectTo: "/dashboard",
        expiresAt: recoverable.environment.expiresAt,
      },
      setCookies: [
        await demoSessionCookie(recoverable.sessionToken, recoverable.environment.expiresAt),
      ],
    };
  }
  const existingAttempt = await findDemoProvisioningAttemptByEntryKeyHash(entryKeyHash);
  if (existingAttempt && existingAttempt.recoveryExpiresAt <= now) {
    throw new DemoEntryError("environmentUnavailable");
  }

  try {
    return await runIdempotentDemoEntry(idempotencyKey, () =>
      provisionNewDemo(request, entryKeyHash),
    );
  } catch (error) {
    if (error instanceof DemoEntryInProgressError) {
      throw new DemoEntryError("environmentUnavailable");
    }
    throw error;
  }
}
