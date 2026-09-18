import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { EyeIcon, EyeOffIcon, FileTextIcon, LinkIcon, PlusIcon, XIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { GateBadges, LinkStatusBadge } from "#/components/link-badges";
import { CopyLinkSlugButton, LinkWriteDialog } from "#/components/link-write-dialog";
import { DocumentThumbnail } from "#/components/document-kind";
import { DemoSampleBadge } from "#/components/demo-sample-badge";
import { documentKindLabel } from "#/lib/document-kind";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "#/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "#/components/ui/item";
import { Separator } from "#/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import { useIntentPreload } from "#/hooks/use-intent-preload";
import { isLinkSlug } from "#/lib/link-slug";
import { demoMutationErrorMessage } from "#/lib/demo-quota-copy";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/vaults/$vaultId")({
  loader: ({ context: { organization, queryClient }, params: { vaultId } }) => {
    const { vaults } = getCollections(queryClient, organization.id);

    return resolveRow(vaults, vaultId);
  },
  component: VaultPage,
});

type VaultItemCollection = ReturnType<typeof getCollections>["vaultItems"];
type DocumentRow = NonNullable<ReturnType<ReturnType<typeof getCollections>["documents"]["get"]>>;
type VaultDocumentRow = DocumentRow & { isVisible: boolean };
type LinkRow = NonNullable<ReturnType<ReturnType<typeof getCollections>["links"]["get"]>>;

function VaultDocumentName({
  document,
  preloadScope,
}: Readonly<{
  document: Pick<VaultDocumentRow, "id" | "title" | "isVisible">;
  preloadScope: string;
}>) {
  const router = useRouter();
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:${document.id}`,
    preload: () =>
      router.preloadRoute({
        to: "/dashboard/documents/$documentId",
        params: { documentId: document.id },
      }),
  });

  return (
    <Link
      to="/dashboard/documents/$documentId"
      params={{ documentId: document.id }}
      {...linkProps}
      className={cn("hover:underline", !document.isVisible && "text-muted-foreground")}
    >
      {document.title || "Untitled"}
    </Link>
  );
}

function VaultLinkName({
  link,
  preloadScope,
}: Readonly<{
  link: Pick<LinkRow, "id" | "name" | "slug">;
  preloadScope: string;
}>) {
  const router = useRouter();
  const { linkProps } = useIntentPreload({
    scope: `${preloadScope}:${link.id}`,
    preload: () =>
      router.preloadRoute({
        to: "/dashboard/links/$linkId",
        params: { linkId: link.id },
      }),
  });

  return (
    <Link
      to="/dashboard/links/$linkId"
      params={{ linkId: link.id }}
      {...linkProps}
      className="hover:underline"
    >
      {link.name || (isLinkSlug(link.slug) ? `/v/${link.slug}` : "Link")}
    </Link>
  );
}

function VaultPage() {
  const vault = Route.useLoaderData();
  const { organization, queryClient, session, demo } = Route.useRouteContext();
  const { documents, vaultItems, links, vaults } = getCollections(queryClient, organization.id);
  const { data: documentsInVault } = useLiveQuery({
    query: (query) =>
      query
        .from({ vaultItem: vaultItems })
        .innerJoin({ document: documents }, ({ vaultItem, document }) =>
          eq(vaultItem.documentId, document.id),
        )
        .where(({ vaultItem }) => eq(vaultItem.vaultId, vault.id))
        .orderBy(({ document }) => document.title)
        // Visibility lives on the membership, so the row carries it beside the Document.
        .select(({ document, vaultItem }) => ({ ...document, isVisible: vaultItem.isVisible })),
  });
  const { data: organizationDocuments } = useLiveQuery({
    query: (query) =>
      query
        .from({ document: documents })
        .orderBy(({ document }) => document.title)
        .select(({ document }) => document),
  });
  const { data: organizationVaults } = useLiveQuery({
    query: (query) =>
      query
        .from({ vault: vaults })
        .orderBy(({ vault }) => vault.name)
        .select(({ vault }) => vault),
  });
  const { data: vaultLinks } = useLiveQuery({
    query: (query) =>
      query
        .from({ link: links })
        .where(({ link }) => eq(link.vaultId, vault.id))
        .select(({ link }) => link),
  });
  const [mutationError, setMutationError] = useState<string | null>(null);
  const hiddenCount = documentsInVault.filter((document) => !document.isVisible).length;

  function watchPersistence(
    transaction: ReturnType<VaultItemCollection["insert"]>,
    message: string,
  ) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch((error: unknown) =>
      setMutationError(demoMutationErrorMessage(error, message)),
    );
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle className="flex min-w-0 items-center gap-2">
          <span className="truncate">{vault.name}</span>
          {demo?.samples.vaults.includes(vault.id) ? <DemoSampleBadge /> : null}
        </PageTitle>
        {vault.description ? <PageDescription>{vault.description}</PageDescription> : null}
        <PageActions>
          <AddDocumentsDialog
            documents={organizationDocuments}
            documentsInVault={documentsInVault}
            vaultId={vault.id}
            vaultItems={vaultItems}
            watchPersistence={watchPersistence}
            triggerVariant="outline"
          />
          <LinkWriteDialog
            organizationId={organization.id}
            organizationName={organization.name}
            createdBy={session.user.id}
            documents={organizationDocuments}
            vaults={organizationVaults}
            links={links}
            watchPersistence={(transaction, message) => {
              setMutationError(null);
              void transaction.isPersisted.promise.catch((error: unknown) =>
                setMutationError(demoMutationErrorMessage(error, message)),
              );
            }}
            lockedTarget={{ vaultId: vault.id }}
            triggerLabel="Create link"
            demo={Boolean(demo)}
          />
        </PageActions>
      </PageHeader>

      {mutationError && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Documents</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {hiddenCount > 0
              ? `${documentsInVault.length - hiddenCount} of ${documentsInVault.length} shared`
              : `${documentsInVault.length} in this vault`}
          </span>
        </header>

        {documentsInVault.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>No documents in this vault</EmptyTitle>
              <EmptyDescription>Add documents to this vault.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <AddDocumentsDialog
                documents={organizationDocuments}
                documentsInVault={documentsInVault}
                vaultId={vault.id}
                vaultItems={vaultItems}
                watchPersistence={watchPersistence}
              />
            </EmptyContent>
          </Empty>
        ) : (
          <ItemGroup className="gap-2">
            {documentsInVault.map((document) => (
              <Item
                key={document.id}
                variant="outline"
                className={cn("hover:bg-muted/40", !document.isVisible && "bg-muted/20")}
              >
                <ItemMedia
                  variant="image"
                  className={cn("size-9 rounded-md", !document.isVisible && "opacity-50")}
                >
                  <DocumentThumbnail document={document} compact />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    <VaultDocumentName document={document} preloadScope={organization.id} />
                  </ItemTitle>
                  <ItemDescription className="flex flex-wrap items-center gap-1.5">
                    {document.$synced ? documentKindLabel(document.kind) : "Saving…"}
                    {!document.isVisible && (
                      <Badge variant="outline">
                        <EyeOffIcon data-icon="inline-start" />
                        Hidden
                      </Badge>
                    )}
                    {demo?.samples.documents.includes(document.id) ? <DemoSampleBadge /> : null}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-pressed={!document.isVisible}
                          aria-label={
                            document.isVisible
                              ? `Hide ${document.title} from links to this vault`
                              : `Show ${document.title} in links to this vault`
                          }
                          onClick={() => {
                            const transaction = vaultItems.update(
                              `${vault.id}:${document.id}` as const,
                              (draft) => {
                                draft.isVisible = !document.isVisible;
                              },
                            );
                            watchPersistence(
                              transaction,
                              document.isVisible
                                ? `Could not hide “${document.title}”. Your changes were not saved.`
                                : `Could not show “${document.title}”. Your changes were not saved.`,
                            );
                          }}
                        >
                          {document.isVisible ? <EyeIcon /> : <EyeOffIcon />}
                        </Button>
                      }
                    />
                    <TooltipContent>
                      {document.isVisible ? "Hide from links" : "Show in links"}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${document.title} from this vault`}
                          onClick={() => {
                            const transaction = vaultItems.delete(
                              `${vault.id}:${document.id}` as const,
                            );
                            watchPersistence(
                              transaction,
                              `Could not remove “${document.title}”. Your changes were not saved.`,
                            );
                          }}
                        >
                          <XIcon />
                        </Button>
                      }
                    />
                    <TooltipContent>Remove from vault</TooltipContent>
                  </Tooltip>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Links to this vault</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {vaultLinks.length} {vaultLinks.length === 1 ? "link" : "links"}
          </span>
        </header>

        {vaultLinks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Create a link to share this vault.</p>
        ) : (
          <ItemGroup className="gap-2">
            {vaultLinks.map((link) => (
              <Item key={link.id} variant="outline" className="hover:bg-muted/40">
                <ItemMedia variant="icon">
                  <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <LinkIcon />
                  </span>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    <VaultLinkName link={link} preloadScope={organization.id} />
                  </ItemTitle>
                  <ItemDescription className="flex flex-wrap items-center gap-1.5">
                    <GateBadges link={link} />
                    <LinkStatusBadge isActive={link.isActive} />
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <CopyLinkSlugButton slug={link.slug} />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>
    </Page>
  );
}

type WatchPersistence = (
  transaction: ReturnType<VaultItemCollection["insert"]>,
  message: string,
) => void;

function AddDocumentsDialog({
  documents,
  documentsInVault,
  vaultId,
  vaultItems,
  watchPersistence,
  triggerLabel = "Add documents",
  triggerVariant = "default",
}: {
  documents: DocumentRow[];
  documentsInVault: VaultDocumentRow[];
  vaultId: string;
  vaultItems: VaultItemCollection;
  watchPersistence: WatchPersistence;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const documentIdsInVault = new Set(documentsInVault.map((document) => document.id));

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setSelectedIds(new Set());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const additions = documents.filter(
      (document) => selectedIds.has(document.id) && !documentIdsInVault.has(document.id),
    );
    if (additions.length === 0) {
      handleOpenChange(false);
      return;
    }

    const addedAt = new Date();
    const transaction = vaultItems.insert(
      additions.map((document) => ({
        vaultId,
        documentId: document.id,
        isVisible: true,
        addedAt,
      })),
    );
    watchPersistence(
      transaction,
      "Could not add documents to this vault. Your changes were not saved.",
    );
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant={triggerVariant} />}>
        <PlusIcon data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add documents</DialogTitle>
            <DialogDescription>Choose documents to add.</DialogDescription>
          </DialogHeader>
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documents in this organization yet.</p>
          ) : (
            <FieldSet>
              <FieldLegend>Documents</FieldLegend>
              <FieldGroup className="max-h-72 overflow-y-auto">
                {documents.map((document) => {
                  const alreadyInVault = documentIdsInVault.has(document.id);
                  const checkboxId = `vault-${vaultId}-document-${document.id}`;

                  return (
                    <Field
                      key={document.id}
                      orientation="horizontal"
                      data-disabled={alreadyInVault}
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={alreadyInVault || selectedIds.has(document.id)}
                        disabled={alreadyInVault}
                        onCheckedChange={(checked) => {
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(document.id);
                            else next.delete(document.id);
                            return next;
                          });
                        }}
                      />
                      <FieldContent>
                        <FieldTitle>
                          <label htmlFor={checkboxId}>{document.title}</label>
                        </FieldTitle>
                        <FieldDescription>
                          {alreadyInVault
                            ? "Already in this vault"
                            : documentKindLabel(document.kind)}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldGroup>
            </FieldSet>
          )}
          <DialogFooter showCloseButton>
            <Button type="submit">Add to vault</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
