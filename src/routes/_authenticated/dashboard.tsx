import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { DashboardNotFound } from "#/components/dashboard-not-found";
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
  // One boundary for the three detail routes: the not-found lands here, inside the Chrome,
  // so the User keeps their navigation and can move somewhere else.
  notFoundComponent: DashboardNotFound,
  component: DashboardCollections,
});

function DashboardCollections() {
  const { organization, queryClient } = Route.useRouteContext();
  const { documents, vaults, vaultItems, links } = getCollections(queryClient, organization.id);

  // Keep Query observers subscribed for the whole Dashboard visit so unused collections are not
  // unsubscribed on page changes (that path is what logs cleanupQueryIfIdle).
  useEffect(() => {
    const subscriptions = [documents, vaults, vaultItems, links].map((collection) =>
      collection.subscribeChanges(() => {}),
    );
    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [documents, vaults, vaultItems, links]);

  return <Outlet />;
}

function DashboardPending() {
  return (
    <div className="flex flex-col gap-4 p-4" aria-label="Loading Dashboard">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
