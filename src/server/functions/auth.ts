import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { authedMiddleware } from "#/server/auth-middleware";
import { auth } from "#/server/auth";

export const hasAuthenticatedSession = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .handler(() => true);

export const currentSessionUser = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .handler(({ context }) => ({ email: context.authSession.user.email }));

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([authedMiddleware])
  .handler(() => auth.api.listOrganizations({ headers: getRequest().headers }));
