import { createInterface } from "node:readline/promises";

import { hiddenPrompt, requireInteractiveInvocation } from "#/server/operator-cli-input";
import { closeRedis } from "#/server/redis";
import {
  bootstrapPlatformOperator,
  closeOperatorDatabase,
} from "#/server/repositories/platform-operator";

async function main() {
  requireInteractiveInvocation(process.argv.slice(2), process.stdin);
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  const name = await prompts.question("Name: ");
  const email = await prompts.question("Email: ");
  prompts.close();
  const password = await hiddenPrompt("Password: ", {
    input: process.stdin,
    output: process.stdout,
  });
  const confirmation = await hiddenPrompt("Confirm password: ", {
    input: process.stdin,
    output: process.stdout,
  });
  if (password !== confirmation) throw new Error("Passwords do not match");

  const created = await bootstrapPlatformOperator({ name, email, password });
  process.stdout.write(`Platform Operator created with User id ${created.id}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Operator bootstrap failed"}\n`);
  process.exitCode = 1;
} finally {
  await Promise.all([closeOperatorDatabase(), closeRedis()]);
}
