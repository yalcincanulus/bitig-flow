import { useNavigate } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";
import { platformOperatorRouteAccess } from "#/server/functions/operators";

export async function goToDashboardOrOnboarding(
  navigate: ReturnType<typeof useNavigate>,
  redirect?: string,
) {
  if (redirect) {
    await navigate({ href: redirect });
    return;
  }

  const operatorAccess = await platformOperatorRouteAccess();
  if (operatorAccess.isOperator) {
    await navigate({
      href: operatorAccess.twoFactorEnrolled ? "/operations" : "/operations/enroll",
    });
    return;
  }

  const organizations = await authClient.organization.list();
  if ((organizations.data?.length ?? 0) === 0) {
    await navigate({ href: "/onboarding" });
    return;
  }
  await navigate({ to: "/dashboard/documents" });
}
