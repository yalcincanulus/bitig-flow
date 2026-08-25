import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import {
  ChevronRightIcon,
  EllipsisIcon,
  FileTextIcon,
  FolderClosedIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
import { DemoSampleBadge } from "#/components/demo-sample-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "#/components/ui/item";
import { Textarea } from "#/components/ui/textarea";
import { getCollections } from "#/db-collections";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { demoMutationErrorMessage } from "#/lib/demo-quota-copy";

export const Route = createFileRoute("/_authenticated/dashboard/vaults/")({
  component: VaultsPage,
});

type VaultCollection = ReturnType<typeof getCollections>["vaults"];
type VaultRow = NonNullable<ReturnType<VaultCollection["get"]>>;

function textValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function normalizedDescription(formData: FormData) {
  const description = textValue(formData, "description").trim();
  return description || null;
}

function vaultFormValues(form: HTMLFormElement) {
  const formData = new FormData(form);
  return {
    name: textValue(formData, "name").trim(),
    description: normalizedDescription(formData),
  };
}

function countPer(rows: ReadonlyArray<{ vaultId: string | null }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.vaultId === null) continue;
    counts.set(row.vaultId, (counts.get(row.vaultId) ?? 0) + 1);
  }
  return counts;
}

function VaultsPage() {
  const { organization, queryClient, demo } = Route.useRouteContext();
  const { vaults, vaultItems, links } = getCollections(queryClient, organization.id);
  const { data } = useLiveQuery({
    query: (query) =>
      query
        .from({ vault: vaults })
        .orderBy(({ vault }) => vault.createdAt, "desc")
        .select(({ vault }) => vault),
  });
  const { data: itemRows } = useLiveQuery({
    query: (query) => query.from({ vaultItem: vaultItems }).select(({ vaultItem }) => vaultItem),
  });
  const { data: linkRows } = useLiveQuery({
    query: (query) => query.from({ link: links }).select(({ link }) => link),
  });
  const [mutationError, setMutationError] = useState<string | null>(null);
  const documentCounts = countPer(itemRows);
  const linkCounts = countPer(linkRows);
  const sampleVaultIds = new Set(demo?.samples.vaults ?? []);

  function watchPersistence(transaction: ReturnType<VaultCollection["insert"]>, message: string) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch((error: unknown) =>
      setMutationError(demoMutationErrorMessage(error, message)),
    );
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.vaults.label}</PageTitle>
        <PageDescription>Group Documents that should be shared together.</PageDescription>
        <PageActions>
          <CreateVaultDialog
            organizationId={organization.id}
            vaults={vaults}
            watchPersistence={watchPersistence}
          />
        </PageActions>
      </PageHeader>

      {mutationError && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      {data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderClosedIcon />
            </EmptyMedia>
            <EmptyTitle>No Vaults yet</EmptyTitle>
            <EmptyDescription>Create a Vault to group related Documents.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateVaultDialog
              organizationId={organization.id}
              vaults={vaults}
              watchPersistence={watchPersistence}
              triggerLabel="Create your first Vault"
            />
          </EmptyContent>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {data.map((vault) => (
            <VaultRowItem
              key={vault.id}
              vault={vault}
              sample={sampleVaultIds.has(vault.id)}
              documentCount={documentCounts.get(vault.id) ?? 0}
              linkCount={linkCounts.get(vault.id) ?? 0}
              vaults={vaults}
              watchPersistence={watchPersistence}
            />
          ))}
        </ItemGroup>
      )}
    </Page>
  );
}

/**
 * One Vault as a row rather than a card.
 *
 * A Vault is a name, a sentence, and two counts — there is no picture to show and nothing to fill
 * a tile with, which is why a grid of them read as a grid of empty boxes.
 */
function VaultRowItem({
  vault,
  sample,
  documentCount,
  linkCount,
  vaults,
  watchPersistence,
}: Readonly<{
  vault: VaultRow;
  sample: boolean;
  documentCount: number;
  linkCount: number;
  vaults: VaultCollection;
  watchPersistence: WatchPersistence;
}>) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <Item variant="outline" className="hover:bg-muted/40">
      <ItemMedia variant="icon">
        <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FolderClosedIcon />
        </span>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <Link
            to="/dashboard/vaults/$vaultId"
            params={{ vaultId: vault.id }}
            className="hover:underline"
          >
            {vault.name}
          </Link>
          {vault.$synced ? null : (
            <span className="text-xs font-normal text-muted-foreground">Saving…</span>
          )}
          {sample ? <DemoSampleBadge /> : null}
        </ItemTitle>
        <ItemDescription>{vault.description || "No description"}</ItemDescription>
      </ItemContent>
      <ItemActions className="gap-1">
        <span className="hidden items-center gap-3 pr-2 text-xs text-muted-foreground tabular-nums sm:flex">
          <span className="inline-flex items-center gap-1">
            <FileTextIcon className="size-3.5" />
            {documentCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <LinkIcon className="size-3.5" />
            {linkCount}
          </span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="Vault actions" />}
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link to="/dashboard/vaults/$vaultId" params={{ vaultId: vault.id }} />}
              >
                <FolderClosedIcon />
                Open Vault
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <PencilIcon />
                Edit Vault
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                <TrashIcon />
                Delete Vault
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          nativeButton={false}
          variant="ghost"
          size="icon-sm"
          aria-label={`Open ${vault.name}`}
          render={<Link to="/dashboard/vaults/$vaultId" params={{ vaultId: vault.id }} />}
        >
          <ChevronRightIcon />
        </Button>
      </ItemActions>
      <EditVaultDialog
        vault={vault}
        vaults={vaults}
        watchPersistence={watchPersistence}
        open={editing}
        onOpenChange={setEditing}
      />
      <DeleteVaultDialog
        vault={vault}
        vaults={vaults}
        watchPersistence={watchPersistence}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </Item>
  );
}

type WatchPersistence = (
  transaction: ReturnType<VaultCollection["insert"]>,
  message: string,
) => void;

function CreateVaultDialog({
  organizationId,
  vaults,
  watchPersistence,
  triggerLabel = "Create Vault",
}: {
  organizationId: string;
  vaults: VaultCollection;
  watchPersistence: WatchPersistence;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { name, description } = vaultFormValues(event.currentTarget);
    if (!name) {
      setNameError("Enter a Vault name.");
      return;
    }

    const now = new Date();
    const transaction = vaults.insert({
      id: uuidv7(),
      organizationId,
      name,
      description,
      createdAt: now,
      updatedAt: now,
    });
    watchPersistence(transaction, `Could not create “${name}”. Your change was rolled back.`);
    setNameError(null);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Vault</DialogTitle>
            <DialogDescription>Give this Vault a name and optional description.</DialogDescription>
          </DialogHeader>
          <VaultFields idPrefix="create-vault" nameError={nameError} />
          <DialogFooter showCloseButton>
            <Button type="submit">Create Vault</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditVaultDialog({
  vault,
  vaults,
  watchPersistence,
  open,
  onOpenChange,
}: {
  vault: VaultRow;
  vaults: VaultCollection;
  watchPersistence: WatchPersistence;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [nameError, setNameError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { name, description } = vaultFormValues(event.currentTarget);
    if (!name) {
      setNameError("Enter a Vault name.");
      return;
    }

    const transaction = vaults.update(vault.id, (draft) => {
      draft.name = name;
      draft.description = description;
    });
    watchPersistence(transaction, `Could not update “${vault.name}”. Your change was rolled back.`);
    setNameError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Vault</DialogTitle>
            <DialogDescription>Rename the Vault or update its description.</DialogDescription>
          </DialogHeader>
          <VaultFields
            idPrefix={`edit-vault-${vault.id}`}
            nameError={nameError}
            defaultName={vault.name}
            defaultDescription={vault.description ?? ""}
          />
          <DialogFooter showCloseButton>
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VaultFields({
  idPrefix,
  nameError,
  defaultName,
  defaultDescription,
}: {
  idPrefix: string;
  nameError: string | null;
  defaultName?: string;
  defaultDescription?: string;
}) {
  const nameId = `${idPrefix}-name`;
  const descriptionId = `${idPrefix}-description`;

  return (
    <FieldGroup>
      <Field data-invalid={Boolean(nameError)}>
        <FieldLabel htmlFor={nameId}>Name</FieldLabel>
        <Input
          id={nameId}
          name="name"
          defaultValue={defaultName}
          autoComplete="off"
          aria-invalid={Boolean(nameError)}
          required
        />
        <FieldError>{nameError}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
        <Textarea id={descriptionId} name="description" defaultValue={defaultDescription} />
      </Field>
    </FieldGroup>
  );
}

function DeleteVaultDialog({
  vault,
  vaults,
  watchPersistence,
  open,
  onOpenChange,
}: {
  vault: VaultRow;
  vaults: VaultCollection;
  watchPersistence: WatchPersistence;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  function handleDelete() {
    const transaction = vaults.delete(vault.id);
    watchPersistence(transaction, `Could not delete “${vault.name}”. Your change was rolled back.`);
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{vault.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the Vault, its memberships, and its Links. Its Documents remain available.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete}>
            Delete Vault
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
