import { Link, createFileRoute } from "@tanstack/react-router";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { FileTextIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

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
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";

export const Route = createFileRoute("/_authenticated/dashboard/vaults/$vaultId")({
  loader: ({ context: { organization, queryClient }, params: { vaultId } }) => {
    const { vaults } = getCollections(queryClient, organization.id);

    return resolveRow(vaults, vaultId);
  },
  component: VaultPage,
});

type VaultItemCollection = ReturnType<typeof getCollections>["vaultItems"];
type DocumentRow = NonNullable<ReturnType<ReturnType<typeof getCollections>["documents"]["get"]>>;

function VaultPage() {
  const vault = Route.useLoaderData();
  const { organization, queryClient } = Route.useRouteContext();
  const { documents, vaultItems } = getCollections(queryClient, organization.id);
  const { data: documentsInVault } = useLiveQuery(
    (query) =>
      query
        .from({ vaultItem: vaultItems })
        .innerJoin({ document: documents }, ({ vaultItem, document }) =>
          eq(vaultItem.documentId, document.id),
        )
        .where(({ vaultItem }) => eq(vaultItem.vaultId, vault.id))
        .orderBy(({ document }) => document.title)
        .select(({ document }) => document),
    [documents, vault.id, vaultItems],
  );
  const { data: organizationDocuments } = useLiveQuery(
    (query) =>
      query
        .from({ document: documents })
        .orderBy(({ document }) => document.title)
        .select(({ document }) => document),
    [documents],
  );
  const [mutationError, setMutationError] = useState<string | null>(null);

  function watchPersistence(
    transaction: ReturnType<VaultItemCollection["insert"]>,
    message: string,
  ) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch(() => setMutationError(message));
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>{vault.name}</PageTitle>
        <PageDescription>
          {vault.description || "Documents in this Vault are shared together."}
        </PageDescription>
        <PageActions>
          <AddDocumentsDialog
            documents={organizationDocuments}
            documentsInVault={documentsInVault}
            vaultId={vault.id}
            vaultItems={vaultItems}
            watchPersistence={watchPersistence}
          />
        </PageActions>
      </PageHeader>

      {mutationError && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      {documentsInVault.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>No Documents in this Vault</EmptyTitle>
            <EmptyDescription>Add Documents to share them as one unit.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddDocumentsDialog
              documents={organizationDocuments}
              documentsInVault={documentsInVault}
              vaultId={vault.id}
              vaultItems={vaultItems}
              watchPersistence={watchPersistence}
              triggerLabel="Add Documents"
            />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {documentsInVault.map((document) => (
            <Card key={document.id}>
              <CardHeader>
                <CardTitle>
                  <Link
                    to="/dashboard/documents/$documentId"
                    params={{ documentId: document.id }}
                    className="hover:underline"
                  >
                    {document.title}
                  </Link>
                </CardTitle>
                <CardDescription>{document.kind}</CardDescription>
                <CardAction>{document.$synced ? null : "Saving…"}</CardAction>
              </CardHeader>
              <CardFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const transaction = vaultItems.delete(`${vault.id}:${document.id}` as const);
                    watchPersistence(
                      transaction,
                      `Could not remove “${document.title}”. Your change was rolled back.`,
                    );
                  }}
                >
                  <TrashIcon data-icon="inline-start" />
                  Remove from Vault
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
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
  triggerLabel = "Add Documents",
}: {
  documents: DocumentRow[];
  documentsInVault: DocumentRow[];
  vaultId: string;
  vaultItems: VaultItemCollection;
  watchPersistence: WatchPersistence;
  triggerLabel?: string;
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
        addedAt,
      })),
    );
    watchPersistence(
      transaction,
      "Could not add Documents to this Vault. Your change was rolled back.",
    );
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Documents</DialogTitle>
            <DialogDescription>
              Choose Documents to include. Documents already in the Vault stay as they are.
            </DialogDescription>
          </DialogHeader>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Documents in this Organization yet.</p>
          ) : (
            <FieldSet>
              <FieldLegend>Documents</FieldLegend>
              <FieldGroup>
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
                        {alreadyInVault ? (
                          <FieldDescription>Already in this Vault</FieldDescription>
                        ) : null}
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldGroup>
            </FieldSet>
          )}
          <DialogFooter showCloseButton>
            <Button type="submit">Add to Vault</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
