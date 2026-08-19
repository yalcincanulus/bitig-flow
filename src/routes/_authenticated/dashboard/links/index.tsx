import { Link, createFileRoute } from "@tanstack/react-router";
import { eq, or, useLiveQuery } from "@tanstack/react-db";
import { LinkIcon } from "lucide-react";
import { useState } from "react";

import {
  CopyLinkSlugButton,
  DeleteLinkDialog,
  gateSummary,
  LinkTargetLabel,
  LinkWriteDialog,
  RotateLinkSlugButton,
  ToggleLinkActiveButton,
} from "#/components/link-write-dialog";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { getCollections } from "#/db-collections";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { linksSearchSchema } from "#/lib/dashboard-search";
import { isLinkSlug } from "#/lib/link-slug";

export const Route = createFileRoute("/_authenticated/dashboard/links/")({
  validateSearch: linksSearchSchema,
  component: LinksPage,
});

type LinkCollection = ReturnType<typeof getCollections>["links"];

function LinksPage() {
  const search = Route.useSearch();
  const { organization, queryClient, session } = Route.useRouteContext();
  const { links, documents, vaults } = getCollections(queryClient, organization.id);
  const { data } = useLiveQuery(
    (query) => {
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
    [links, search.status, search.target],
  );
  const { data: documentRows } = useLiveQuery(
    (query) => query.from({ document: documents }).select(({ document }) => document),
    [documents],
  );
  const { data: vaultRows } = useLiveQuery(
    (query) => query.from({ vault: vaults }).select(({ vault }) => vault),
    [vaults],
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const isFiltered = Boolean(search.status || search.target);

  function watchPersistence(transaction: ReturnType<LinkCollection["insert"]>, message: string) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch(() => setMutationError(message));
  }

  const writeDialog = (
    triggerLabel: string,
    extra?: { triggerVariant?: "default" | "outline" },
  ) => (
    <LinkWriteDialog
      organizationId={organization.id}
      organizationName={organization.name}
      createdBy={session.user.id}
      documents={documentRows}
      vaults={vaultRows}
      links={links}
      watchPersistence={watchPersistence}
      triggerLabel={triggerLabel}
      triggerVariant={extra?.triggerVariant}
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((link) => (
            <Card key={link.id}>
              <CardHeader>
                <CardTitle>
                  <Link
                    to="/dashboard/links/$linkId"
                    params={{ linkId: link.id }}
                    className="hover:underline"
                  >
                    {link.name || (isLinkSlug(link.slug) ? `/v/${link.slug}` : "Link")}
                  </Link>
                </CardTitle>
                <CardDescription>
                  <LinkTargetLabel link={link} documents={documentRows} vaults={vaultRows} />
                  {" · "}
                  {gateSummary(link)}
                  {link.isActive ? "" : " · Inactive"}
                </CardDescription>
                <CardAction>{link.$synced ? null : "Saving…"}</CardAction>
              </CardHeader>
              <CardFooter className="flex-wrap gap-2">
                <CopyLinkSlugButton slug={link.slug} />
                <ToggleLinkActiveButton
                  link={link}
                  links={links}
                  watchPersistence={watchPersistence}
                />
                <RotateLinkSlugButton
                  link={link}
                  links={links}
                  watchPersistence={watchPersistence}
                />
                <LinkWriteDialog
                  organizationId={organization.id}
                  organizationName={organization.name}
                  createdBy={session.user.id}
                  documents={documentRows}
                  vaults={vaultRows}
                  links={links}
                  watchPersistence={watchPersistence}
                  link={link}
                  triggerLabel="Edit"
                  triggerVariant="outline"
                  triggerSize="sm"
                />
                <Button
                  nativeButton={false}
                  variant="outline"
                  size="sm"
                  render={<Link to="/dashboard/links/$linkId" params={{ linkId: link.id }} />}
                >
                  Open
                </Button>
                <DeleteLinkDialog link={link} links={links} watchPersistence={watchPersistence} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
