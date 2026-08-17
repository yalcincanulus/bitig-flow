import { Outlet, createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "#/components/ui/skeleton";
import { getCollections } from "#/db-collections";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  loader: async ({ context: { organization, queryClient } }) => {
    const { documents, vaults, vaultItems, links } = getCollections(queryClient, organization.id);

    // One warm sync for every Dashboard screen, because they cross-reference each other constantly.
    await Promise.all([
      documents.preload(),
      vaults.preload(),
      vaultItems.preload(),
      links.preload(),
    ]);
  },
  pendingComponent: DashboardPending,
  component: Outlet,
});

function DashboardPending() {
  return (
    <div className="flex flex-col gap-4 p-4" aria-label="Loading Dashboard">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
