import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";

import {
  CopyLinkSlugButton,
  DeleteLinkDialog,
  LinkTargetLabel,
  LinkWriteDialog,
  RotateLinkSlugButton,
  ToggleLinkActiveButton,
} from "#/components/link-write-dialog";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import { isLinkSlug, linkViewerPath } from "#/lib/link-slug";
import { linkTrust } from "#/lib/link-trust";

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
  const { organization, queryClient, session } = Route.useRouteContext();
  const { links, documents, vaults } = getCollections(queryClient, organization.id);
  const link = links.get(loaded.id) ?? loaded;
  const { data: documentRows } = useLiveQuery(
    (query) => query.from({ document: documents }).select(({ document }) => document),
    [documents],
  );
  const { data: vaultRows } = useLiveQuery(
    (query) => query.from({ vault: vaults }).select(({ vault }) => vault),
    [vaults],
  );
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
          {linkTrust(link).summary}
          {link.passwordSet ? ". A password is set." : ""}
          {link.isActive ? "" : " This Link is inactive."}
        </PageDescription>
        <PageActions>
          <CopyLinkSlugButton slug={link.slug} />
          <ToggleLinkActiveButton link={link} links={links} watchPersistence={watchPersistence} />
          <RotateLinkSlugButton link={link} links={links} watchPersistence={watchPersistence} />
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
          <DeleteLinkDialog link={link} links={links} watchPersistence={watchPersistence} />
        </PageActions>
      </PageHeader>

      {mutationError && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground">
        Target: <LinkTargetLabel link={link} documents={documentRows} vaults={vaultRows} />
        {link.allowDownload ? " · Downloads allowed" : " · Downloads off"}
        {link.expiresAt ? ` · Expires ${link.expiresAt.toLocaleString()}` : ""}
      </p>
    </Page>
  );
}
