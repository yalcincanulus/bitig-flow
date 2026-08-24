import type { useRouter } from "@tanstack/react-router";

type RecoveryOrganization = Readonly<{
  id: string;
  name: string;
}>;

/**
 * The deterministic order used whenever a User needs a replacement active Organization.
 * Organization names are not unique, so the id is the final, stable tie-breaker.
 */
export function byRecoveryOrder(left: RecoveryOrganization, right: RecoveryOrganization): number {
  const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  return byName === 0 ? left.id.localeCompare(right.id) : byName;
}

/**
 * Re-enter the authoritative route context after the active Organization was removed.
 * The server middleware selects and activates a replacement or redirects to onboarding.
 */
export async function recoverActiveOrganization(router: ReturnType<typeof useRouter>) {
  try {
    await router.invalidate({ sync: true });
    await router.navigate({ to: "/dashboard/documents" });
  } catch {
    // The mutation has committed. A document request runs the same recovery on a fresh request and
    // also gives the server the final say when no Membership remains.
    window.location.assign("/dashboard/documents");
  }
}
