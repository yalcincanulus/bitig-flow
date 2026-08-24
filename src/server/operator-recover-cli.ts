import { hiddenPrompt, requireInteractiveInvocation } from "#/server/operator-cli-input";
import { closeRedis } from "#/server/redis";
import {
  closeOperatorDatabase,
  recoverPlatformOperator,
} from "#/server/repositories/platform-operator";

async function main() {
  requireInteractiveInvocation(process.argv.slice(2), process.stdin);
  const password = await hiddenPrompt("New password: ", {
    input: process.stdin,
    output: process.stdout,
  });
  const confirmation = await hiddenPrompt("Confirm new password: ", {
    input: process.stdin,
    output: process.stdout,
  });
  if (password !== confirmation) throw new Error("Passwords do not match");

  const recovered = await recoverPlatformOperator(password);
  process.stdout.write(
    `Platform Operator ${recovered.userId} recovered; all Sessions revoked and TOTP enrollment required\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Operator recovery failed"}\n`);
  process.exitCode = 1;
} finally {
  await Promise.all([closeOperatorDatabase(), closeRedis()]);
}
