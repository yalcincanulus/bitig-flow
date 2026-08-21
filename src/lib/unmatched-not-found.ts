/**
 * Which not-found surface an unmatched URL belongs to, when it has bubbled to the root boundary.
 *
 * Dashboard and Viewer already have their own pages; this only chooses which of those (or the
 * public fallback) the root should render so a miss never falls through to TanStack Router's
 * generic `<p>Not Found</p>`.
 */
export function unmatchedNotFoundSurface(pathname: string): "viewer" | "dashboard" | "public" {
  if (pathname === "/v" || pathname.startsWith("/v/")) return "viewer";
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return "dashboard";
  return "public";
}
