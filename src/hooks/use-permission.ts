import { authClient } from "#/lib/auth-client";

import { useRole } from "./use-role";

// The client check takes a narrower request than the server's `PermissionRequest`, which also
// carries the AND/OR connector. Lifting the shape off the function keeps the two from drifting.
type ClientPermissionRequest = Parameters<
  typeof authClient.organization.checkRolePermission
>[0]["permissions"];

/**
 * Whether the caller's Role grants the requested actions — for hiding and disabling UI only.
 *
 * The check is synchronous and network-free: it runs the browser's copy of the same statement
 * object the server enforces with. Per ADR-0013 that copy decides nothing, so a `false` here is a
 * courtesy and never the reason a mutation is refused.
 */
export function usePermission(permissions: ClientPermissionRequest) {
  const role = useRole();

  return authClient.organization.checkRolePermission({ role, permissions });
}
