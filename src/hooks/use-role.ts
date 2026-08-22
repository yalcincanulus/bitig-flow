import { useRouteContext } from "@tanstack/react-router";

/**
 * The caller's Role in the active organization, for any client component under the Dashboard.
 *
 * The Chrome's `beforeLoad` already resolved it server-side and it rides in the route context, so
 * this exposes what exists rather than asking for it again. A component outside `/_authenticated`
 * has no such match and no Role to read.
 */
export function useRole() {
  return useRouteContext({ from: "/_authenticated", select: (context) => context.role });
}
