import { createServerFn } from "@tanstack/react-start";

import { orgMiddleware } from "#/server/auth-middleware";
import { listVaults as listVaultsFromRepository } from "#/server/repositories/vaults";

export const listVaults = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(({ context }) => listVaultsFromRepository(context.orgId));
