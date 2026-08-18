import { linkOptions } from "@tanstack/react-router";

import { dashboardDestinations } from "#/lib/dashboard-destinations";

/**
 * Where a User is, in the only terms the breadcrumbs care about: which destination owns the route,
 * and which resource — if any — the route is about.
 *
 * A resource label is optional because the Dashboard pane is client-only: the route is matched
 * before its loader has resolved, so the toolbar renders the hierarchy first and the title second.
 */
export type DashboardPlace =
  | Readonly<{
      destination: "documents";
      document?: Readonly<{ id: string; title?: string; editing?: boolean }>;
    }>
  | Readonly<{ destination: "vaults"; vault?: Readonly<{ id: string; name?: string }> }>
  | Readonly<{ destination: "links"; link?: Readonly<{ id: string; slug?: string }> }>
  | Readonly<{ destination: "analytics" }>
  | Readonly<{ destination: "settings" }>;

export type DashboardCrumb = Readonly<{
  key: string;
  label: string;
  /** Absent on the last crumb: the page a User is already on is text, not somewhere to go. */
  link?: DashboardCrumbLink;
  /** A resource's own words are as long as its author made them, so the toolbar clips these. */
  truncates: boolean;
}>;

type DashboardCrumbLink =
  | (typeof dashboardDestinations)[keyof typeof dashboardDestinations]["link"]
  | ReturnType<typeof documentPreviewLink>;

function documentPreviewLink(documentId: string) {
  return linkOptions({ to: "/dashboard/documents/$documentId", params: { documentId } });
}

function destinationCrumb(destination: keyof typeof dashboardDestinations): DashboardCrumb {
  const { label, link } = dashboardDestinations[destination];

  return { key: destination, label, link, truncates: false };
}

/**
 * A resource shows its own words once they are loaded, and its kind until then. Its identifier is
 * never shown: a uuid tells a User nothing that the destination above it has not already said.
 */
function resourceCrumb(key: string, kind: string, label: string | undefined): DashboardCrumb {
  return { key, label: label ?? kind, truncates: true };
}

/** The last crumb is the current page, so it stops being a link. */
function trailEndingHere(crumbs: Array<DashboardCrumb>): Array<DashboardCrumb> {
  return crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { ...crumb, link: undefined } : crumb,
  );
}

/**
 * The Dashboard hierarchy, as the toolbar shows it. There is no Overview above a top-level
 * destination, because there is no Overview route to send a User to.
 */
export function dashboardBreadcrumbs(place: DashboardPlace): Array<DashboardCrumb> {
  const crumbs: Array<DashboardCrumb> = [destinationCrumb(place.destination)];

  switch (place.destination) {
    case "documents": {
      if (place.document) {
        crumbs.push({
          ...resourceCrumb("document", "Document", place.document.title),
          link: documentPreviewLink(place.document.id),
        });
        if (place.document.editing) {
          crumbs.push({ key: "edit", label: "Edit", truncates: false });
        }
      }
      break;
    }
    case "vaults": {
      if (place.vault) {
        crumbs.push(resourceCrumb("vault", "Vault", place.vault.name));
      }
      break;
    }
    case "links": {
      if (place.link) {
        crumbs.push(resourceCrumb("link", "Link", place.link.slug));
      }
      break;
    }
    default:
      break;
  }

  return trailEndingHere(crumbs);
}
