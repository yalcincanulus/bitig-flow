import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { ChartNoAxesCombinedIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { GateBadges, LinkStatusBadge } from "#/components/link-badges";
import {
  CopyLinkSlugButton,
  LinkActionsMenu,
  LinkTargetLabel,
  OpenLinkButton,
} from "#/components/link-write-dialog";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import { isLinkSlug, linkViewerPath } from "#/lib/link-slug";

export const Route = createFileRoute("/_authenticated/dashboard/links/$linkId")({
  loader: ({ context: { organization, queryClient }, params: { linkId } }) => {
    const { links } = getCollections(queryClient, organization.id);

    return resolveRow(links, linkId);
  },
  component: LinkPage,
});

type LinkCollection = ReturnType<typeof getCollections>["links"];

function LinkPage() {
  const loaded = Route.useLoaderData();
  const { organization, queryClient, session, demo } = Route.useRouteContext();
  const { links, documents, vaults } = getCollections(queryClient, organization.id);
  const link = links.get(loaded.id) ?? loaded;
  const { data: documentRows } = useLiveQuery({
    query: (query) => query.from({ document: documents }).select(({ document }) => document),
  });
  const { data: vaultRows } = useLiveQuery({
    query: (query) => query.from({ vault: vaults }).select(({ vault }) => vault),
  });
  const [mutationError, setMutationError] = useState<string | null>(null);

  function watchPersistence(transaction: ReturnType<LinkCollection["insert"]>, message: string) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch(() => setMutationError(message));
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>
          {link.name || (isLinkSlug(link.slug) ? linkViewerPath(link.slug) : "Link")}
        </PageTitle>
        <PageDescription>
          One public URL, one Gate, one analytics stream. Rotating the Slug retires the old URL and
          keeps the history.
        </PageDescription>
        <PageActions>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link to="/dashboard/analytics/$linkId" params={{ linkId: link.id }} />}
          >
            <ChartNoAxesCombinedIcon data-icon="inline-start" />
            Analytics
          </Button>
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
            demo={Boolean(demo)}
          />
        </PageActions>
      </PageHeader>

      {mutationError && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Public URL</CardTitle>
          <CardDescription>
            The Slug is separate from the Link's identity, so it can be rotated without losing the
            analytics history behind it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <CopyLinkSlugButton slug={link.slug} className="h-7 px-2.5 text-xs" />
          <LinkStatusBadge isActive={link.isActive} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How this Link behaves</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            <DetailRow label="Target">
              <LinkTargetLabel link={link} documents={documentRows} vaults={vaultRows} />
            </DetailRow>
            <DetailRow label="Gate">
              <GateBadges link={link} />
            </DetailRow>
            <DetailRow label="Downloads">
              <Badge variant={link.allowDownload ? "secondary" : "outline"}>
                {link.allowDownload ? "Allowed" : "Off"}
              </Badge>
            </DetailRow>
            <DetailRow label="Expires">
              {link.expiresAt ? (
                <time dateTime={link.expiresAt.toISOString()}>
                  {link.expiresAt.toLocaleString()}
                </time>
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </DetailRow>
          </dl>
        </CardContent>
      </Card>
    </Page>
  );
}

function DetailRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center text-xs">{children}</dd>
    </div>
  );
}
