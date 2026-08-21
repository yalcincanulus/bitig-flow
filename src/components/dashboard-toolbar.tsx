import { Link, useMatch, useMatchRoute } from "@tanstack/react-router";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Separator } from "#/components/ui/separator";
import { SidebarTrigger } from "#/components/ui/sidebar";
import { useSidebar } from "#/components/ui/sidebar-context";
import { dashboardBreadcrumbs, type DashboardPlace } from "#/lib/dashboard-breadcrumbs";
import { dashboardDestinationIds, dashboardDestinations } from "#/lib/dashboard-destinations";

/**
 * The router's answer to "where am I", narrowed to what the breadcrumbs need.
 *
 * Every detail route is asked about by name rather than by walking the match list, because a named
 * match carries its own loader's type: the Document title, Vault name, and Link slug come back
 * typed instead of as an `unknown` the toolbar would have to assert its way through.
 */
function useDashboardPlace(): DashboardPlace | undefined {
  const matchRoute = useMatchRoute();
  const documentEdit = useMatch({
    from: "/_authenticated/dashboard/documents/$documentId/edit",
    shouldThrow: false,
  });
  const documentPreview = useMatch({
    from: "/_authenticated/dashboard/documents/$documentId/",
    shouldThrow: false,
  });
  const vault = useMatch({
    from: "/_authenticated/dashboard/vaults/$vaultId",
    shouldThrow: false,
  });
  const link = useMatch({
    from: "/_authenticated/dashboard/links/$linkId",
    shouldThrow: false,
  });
  const analyticsLink = useMatch({
    from: "/_authenticated/dashboard/analytics/$linkId",
    shouldThrow: false,
  });

  if (documentEdit) {
    return {
      destination: "documents",
      document: {
        id: documentEdit.params.documentId,
        title: documentEdit.loaderData?.title,
        editing: true,
      },
    };
  }

  if (documentPreview) {
    return {
      destination: "documents",
      document: {
        id: documentPreview.params.documentId,
        title: documentPreview.loaderData?.document.title,
      },
    };
  }

  if (vault) {
    return {
      destination: "vaults",
      vault: { id: vault.params.vaultId, name: vault.loaderData?.name },
    };
  }

  if (link) {
    return { destination: "links", link: { id: link.params.linkId, slug: link.loaderData?.slug } };
  }

  if (analyticsLink) {
    return {
      destination: "analytics",
      link: {
        id: analyticsLink.params.linkId,
        name: analyticsLink.loaderData?.link.name,
        slug: analyticsLink.loaderData?.link.slug,
      },
    };
  }

  return dashboardDestinationIds
    .filter((destination) => matchRoute({ to: dashboardDestinations[destination].link.to }))
    .map((destination) => ({ destination }) as const)
    .at(0);
}

function DashboardBreadcrumbs() {
  const place = useDashboardPlace();
  if (place === undefined) return null;

  const crumbs = dashboardBreadcrumbs(place);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.key}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className={crumb.truncates ? "min-w-0" : undefined}>
              {crumb.link ? (
                <BreadcrumbLink
                  className={crumb.truncates ? "truncate" : undefined}
                  // An ancestor is never the current page, and `Link` would otherwise call
                  // `/dashboard/documents` current while a User reads a Document under it.
                  render={<Link {...crumb.link} activeOptions={{ exact: true }} />}
                >
                  {crumb.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className={crumb.truncates ? "truncate" : undefined}>
                  {crumb.label}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * The row every Dashboard page wears: the sidebar trigger — the only way into the mobile Sheet —
 * and the breadcrumbs. It sticks so that navigation survives a long page; the page's own title
 * does not, because a title that follows a User down the page is noise rather than navigation.
 */
function DashboardSidebarTrigger() {
  const { isMobile, open, openMobile } = useSidebar();

  return <SidebarTrigger aria-expanded={isMobile ? openMobile : open} />;
}

export function DashboardToolbar() {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4 md:rounded-t-xl">
      <DashboardSidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      <DashboardBreadcrumbs />
    </header>
  );
}
