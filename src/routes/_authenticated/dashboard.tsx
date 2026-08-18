import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { getCollections } from "#/db-collections";
import { dashboardNotFound } from "#/lib/dashboard-not-found";

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
  component: Outlet,
});

function DashboardNotFound() {
  const { pathname } = useLocation();
  const notFound = dashboardNotFound(pathname);

  return (
    <div className="flex flex-1 flex-col p-4">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{notFound.title}</EmptyTitle>
          <EmptyDescription>{notFound.description}</EmptyDescription>
        </EmptyHeader>
        {notFound.recovery ? (
          <EmptyContent>
            <Button nativeButton={false} render={<Link {...notFound.recovery.link} />}>
              {notFound.recovery.label}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  );
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
