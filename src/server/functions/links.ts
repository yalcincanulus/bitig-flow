import { createServerFn } from "@tanstack/react-start";

import { orgMiddleware } from "#/server/auth-middleware";
import { listLinks as listLinksFromRepository } from "#/server/repositories/links";

export const listLinks = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(({ context }) => listLinksFromRepository(context.orgId));
