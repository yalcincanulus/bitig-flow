import { Outlet, createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "#/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
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
