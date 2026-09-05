import { linkOptions } from "@tanstack/react-router";

/**
 * The Dashboard destinations, named once.
 *
 * The sidebar and the toolbar breadcrumbs both have to say "Documents" and both have to point at
 * `/dashboard/documents`; keeping the pair here is what stops the two halves of the Chrome from
 * disagreeing about what a destination is called or where it goes.
 */
export const dashboardDestinations = {
  home: { label: "Home", link: linkOptions({ to: "/dashboard" }) },
  documents: { label: "Documents", link: linkOptions({ to: "/dashboard/documents" }) },
  vaults: { label: "Vaults", link: linkOptions({ to: "/dashboard/vaults" }) },
  links: { label: "Links", link: linkOptions({ to: "/dashboard/links" }) },
  analytics: { label: "Analytics", link: linkOptions({ to: "/dashboard/analytics" }) },
  people: { label: "People", link: linkOptions({ to: "/dashboard/people" }) },
  settings: { label: "Settings", link: linkOptions({ to: "/dashboard/settings" }) },
} as const;

export type DashboardDestination = keyof typeof dashboardDestinations;

export const dashboardDestinationIds = Object.keys(dashboardDestinations) as DashboardDestination[];
