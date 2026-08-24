import { eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { platformOperator } from "#/server/db/schema";

export async function findPlatformOperatorBinding() {
  const [binding] = await db
    .select({ userId: platformOperator.userId })
    .from(platformOperator)
    .where(eq(platformOperator.id, "platform-operator"))
    .limit(1);
  return binding;
}

export async function findPlatformOperatorBindingForUser(userId: string) {
  const binding = await findPlatformOperatorBinding();
  return binding?.userId === userId ? binding : undefined;
}
