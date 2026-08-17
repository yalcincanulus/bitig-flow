import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { authedMiddleware } from "#/server/auth-middleware";
import { auth } from "#/server/auth";

export const hasAuthenticatedSession = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .handler(() => true);

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .handler(() => auth.api.listOrganizations({ headers: getRequest().headers }));
