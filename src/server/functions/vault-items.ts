import { createServerFn } from "@tanstack/react-start";

import { orgMiddleware } from "#/server/auth-middleware";
import { listVaultItems as listVaultItemsFromRepository } from "#/server/repositories/vault-items";

export const listVaultItems = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(({ context }) => listVaultItemsFromRepository(context.orgId));
