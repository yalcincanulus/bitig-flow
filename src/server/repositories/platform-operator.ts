import { hashPassword } from "better-auth/crypto";
import { and, eq, like, or } from "drizzle-orm";
import { z } from "zod";

import { auth } from "#/server/auth";
import { db, pool } from "#/server/db/client";
import {
  account,
  operatorAuditRecord,
  platformOperator,
  twoFactor,
  user,
  verification,
} from "#/server/db/schema";
import { findPlatformOperatorBinding } from "#/server/repositories/platform-operator-binding";

const bootstrapInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Email must be valid").transform((email) => email.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const recoveryPasswordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);

export class PlatformOperatorCommandError extends Error {
  override readonly name = "PlatformOperatorCommandError";
}

export async function bootstrapPlatformOperator(input: z.input<typeof bootstrapInputSchema>) {
  const parsed = bootstrapInputSchema.parse(input);
  const password = await hashPassword(parsed.password);

  return db.transaction(async (transaction) => {
    const [existingBinding] = await transaction
      .select({ userId: platformOperator.userId })
      .from(platformOperator)
      .limit(1);
    if (existingBinding) {
      throw new PlatformOperatorCommandError("A Platform Operator is already configured");
    }

    const [existingUser] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, parsed.email))
      .limit(1);
    if (existingUser) {
      throw new PlatformOperatorCommandError(
        "A User already exists for that email; bootstrap will not adopt it",
      );
    }

    const [createdUser] = await transaction
      .insert(user)
      .values({
        name: parsed.name,
        email: parsed.email,
        emailVerified: true,
      })
      .returning({ id: user.id, email: user.email });
    if (!createdUser) throw new PlatformOperatorCommandError("Could not create the Operator User");

    await transaction.insert(account).values({
      accountId: createdUser.id,
      providerId: "credential",
      userId: createdUser.id,
      password,
    });
    await transaction.insert(platformOperator).values({ userId: createdUser.id });
    await transaction.insert(operatorAuditRecord).values({
      operatorUserId: createdUser.id,
      kind: "bootstrap",
    });

    return createdUser;
  });
}

export async function recoverPlatformOperator(newPassword: string) {
  const parsedPassword = recoveryPasswordSchema.parse(newPassword);
  const password = await hashPassword(parsedPassword);
  const binding = await findPlatformOperatorBinding();
  if (!binding) throw new PlatformOperatorCommandError("No Platform Operator is configured");

  // Better Auth owns both database and secondary-storage session indexes. Revoke through its
  // internal adapter so recovery cannot leave a Redis-backed Session alive.
  const authContext = await auth.$context;
  await authContext.internalAdapter.deleteUserSessions(binding.userId);

  await db.transaction(async (transaction) => {
    const updatedAccounts = await transaction
      .update(account)
      .set({ password })
      .where(and(eq(account.userId, binding.userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (updatedAccounts.length !== 1) {
      throw new PlatformOperatorCommandError("The Platform Operator credential is unavailable");
    }

    await transaction
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(eq(user.id, binding.userId));
    await transaction.delete(twoFactor).where(eq(twoFactor.userId, binding.userId));
    await transaction
      .delete(verification)
      .where(
        and(
          eq(verification.value, binding.userId),
          or(
            like(verification.identifier, "trust-device-%"),
            like(verification.identifier, "2fa-%"),
          ),
        ),
      );
    await transaction.insert(operatorAuditRecord).values({
      operatorUserId: binding.userId,
      kind: "recovery",
    });
  });

  return { userId: binding.userId };
}

export function closeOperatorDatabase() {
  return pool.end();
}
