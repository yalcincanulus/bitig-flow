import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { eq, or, useLiveQuery } from "@tanstack/react-db";
import { LinkIcon } from "lucide-react";
import { useState } from "react";

import { FilterBar, FilterBarLabel, FilterBarSpacer } from "#/components/dashboard-filter-bar";
import { GateBadges, LinkStatusBadge } from "#/components/link-badges";
import {
  CopyLinkSlugButton,
  LinkActionsMenu,
  LinkTargetLabel,
  LinkWriteDialog,
  OpenLinkButton,
} from "#/components/link-write-dialog";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { TableFrame } from "#/components/table-frame";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { getCollections } from "#/db-collections";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { linksSearchSchema } from "#/lib/dashboard-search";
import { isLinkSlug } from "#/lib/link-slug";

export const Route = createFileRoute("/_authenticated/dashboard/links/")({
  validateSearch: linksSearchSchema,
  component: LinksPage,
});

type LinkCollection = ReturnType<typeof getCollections>["links"];

const statusFilters = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

function LinksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { organization, queryClient, session } = Route.useRouteContext();
  const { links, documents, vaults } = getCollections(queryClient, organization.id);
  const { data } = useLiveQuery({
    query: (query) => {
      let filtered = query.from({ link: links });
      const { status, target } = search;

      if (target) {
        filtered = filtered.where(({ link }) =>
          or(eq(link.documentId, target), eq(link.vaultId, target)),
        );
      }
      if (status) {
        filtered = filtered.where(({ link }) => eq(link.isActive, status === "active"));
      }

      return filtered.select(({ link }) => link);
    },
  });
  const { data: documentRows } = useLiveQuery({
    query: (query) => query.from({ document: documents }).select(({ document }) => document),
  });
  const { data: vaultRows } = useLiveQuery({
    query: (query) => query.from({ vault: vaults }).select(({ vault }) => vault),
  });
  const [mutationError, setMutationError] = useState<string | null>(null);
  const isFiltered = Boolean(search.status || search.target);

  function watchPersistence(transaction: ReturnType<LinkCollection["insert"]>, message: string) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch(() => setMutationError(message));
  }

  const writeDialog = (triggerLabel: string) => (
    <LinkWriteDialog
      organizationId={organization.id}
      organizationName={organization.name}
      createdBy={session.user.id}
      documents={documentRows}
      vaults={vaultRows}
      links={links}
      watchPersistence={watchPersistence}
      triggerLabel={triggerLabel}
    />
  );

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.links.label}</PageTitle>
        <PageDescription>
          Publish a Document or a Vault through a Link that carries its own Gate.
        </PageDescription>
        <PageActions>{writeDialog("Create Link")}</PageActions>
      </PageHeader>

      <FilterBar>
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[search.status ?? "all"]}
          onValueChange={(value) => {
            const next = value[0];
            if (!next) return;
            void navigate({
              to: "/dashboard/links",
              search: {
                ...search,
                status: next === "all" ? undefined : (next as "active" | "inactive"),
              },
            });
          }}
          aria-label="Filter by status"
        >
          {statusFilters.map((filter) => (
            <ToggleGroupItem key={filter.value} value={filter.value}>
              {filter.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {search.target ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void navigate({ to: "/dashboard/links", search: { ...search, target: undefined } })
            }
          >
            Clear Target filter
          </Button>
        ) : null}

        <FilterBarSpacer />

        <FilterBarLabel>
          {data.length} {data.length === 1 ? "Link" : "Links"}
        </FilterBarLabel>
      </FilterBar>

      {mutationError && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      {data.length === 0 ? (
        isFiltered ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LinkIcon />
              </EmptyMedia>
              <EmptyTitle>No matching Links</EmptyTitle>
              <EmptyDescription>
                Nothing matches the current Target or status filter.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                onClick={() => void navigate({ to: "/dashboard/links", search: {} })}
              >
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LinkIcon />
              </EmptyMedia>
              <EmptyTitle>No Links yet</EmptyTitle>
              <EmptyDescription>Create a Link to publish a Document or a Vault.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{writeDialog("Create your first Link")}</EmptyContent>
          </Empty>
        )
      ) : (
        <TableFrame>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-3">Link</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Gate</TableHead>
              <TableHead>Public URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0 pr-3 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="max-w-56 pl-3 font-medium">
                  <Link
                    to="/dashboard/links/$linkId"
                    params={{ linkId: link.id }}
                    className="block truncate hover:underline"
                  >
                    {link.name || (isLinkSlug(link.slug) ? `/v/${link.slug}` : "Link")}
                  </Link>
                  {link.$synced ? null : (
                    <span className="text-xs font-normal text-muted-foreground">Saving…</span>
                  )}
                </TableCell>
                <TableCell className="max-w-48 text-muted-foreground">
                  <LinkTargetLabel link={link} documents={documentRows} vaults={vaultRows} />
                </TableCell>
                <TableCell>
                  <GateBadges link={link} />
                </TableCell>
                <TableCell>
                  <CopyLinkSlugButton slug={link.slug} />
                </TableCell>
                <TableCell>
                  <LinkStatusBadge isActive={link.isActive} />
                </TableCell>
                <TableCell className="pr-3 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <OpenLinkButton slug={link.slug} />
                    <LinkActionsMenu
                      organizationId={organization.id}
                      organizationName={organization.name}
                      createdBy={session.user.id}
                      documents={documentRows}
                      vaults={vaultRows}
                      link={link}
                      links={links}
                      watchPersistence={watchPersistence}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableFrame>
      )}
    </Page>
  );
}
