import { dashboardDestinations } from "#/lib/dashboard-destinations";

const unimplementedDestinations = ["links", "analytics", "settings"] as const;

export type UnimplementedDashboardDestination = (typeof unimplementedDestinations)[number];

export type DashboardUnimplemented = Readonly<{
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}>;

const descriptions = {
  links: "Share a Document or a Vault through a Link that carries its own Gate.",
  analytics: "The analytics stream each Link produces.",
  settings:
    "Organization administration will live here. Membership is Better Auth's surface today.",
} as const satisfies Record<UnimplementedDashboardDestination, string>;

/**
 * What an unfinished Dashboard destination says for itself: a real title and description, and an
 * honest Empty state. The features are not here yet, and the copy does not pretend they are.
 */
export function dashboardUnimplemented(
  destination: UnimplementedDashboardDestination,
): DashboardUnimplemented {
  return {
    title: dashboardDestinations[destination].label,
    description: descriptions[destination],
    emptyTitle: "Not implemented yet",
    emptyDescription: "This destination is part of the Dashboard. Its features are not built yet.",
  };
}
