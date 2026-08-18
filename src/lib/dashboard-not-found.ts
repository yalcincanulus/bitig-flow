import { dashboardDestinations } from "#/lib/dashboard-destinations";

const missingDestinations = ["documents", "vaults", "links"] as const;

const kindByDestination = {
  documents: "Document",
  vaults: "Vault",
  links: "Link",
} as const;

export type DashboardNotFound = Readonly<{
  title: string;
  description: string;
  recovery?: Readonly<{
    label: string;
    link: (typeof dashboardDestinations)[(typeof missingDestinations)[number]]["link"];
  }>;
}>;

/**
 * What a User sees when a Dashboard route has no row, or no matching destination.
 *
 * The pathname is enough: a missing Document, Vault, or Link is the same not-found whether the
 * User arrived by a cold load or by client navigation, and an identifier from another
 * Organization is absent from the collection rather than a distinct case.
 */
export function dashboardNotFound(pathname: string): DashboardNotFound {
  const destination = missingDestinations.find((missing) =>
    pathname.startsWith(`${dashboardDestinations[missing].link.to}/`),
  );

  if (destination === undefined) {
    return {
      title: "This page isn't here",
      description: "The Dashboard has no destination at this address.",
    };
  }

  const list = dashboardDestinations[destination];

  return {
    title: `This ${kindByDestination[destination]} isn't here`,
    description: "It may have been removed, or it is not in this Organization.",
    recovery: {
      label: `Back to ${list.label}`,
      link: list.link,
    },
  };
}
