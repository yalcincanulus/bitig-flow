import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { FolderClosedIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { getCollections } from "#/db-collections";
import { dashboardDestinations } from "#/lib/dashboard-destinations";

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

function VaultsPage() {
  const { organization, queryClient } = Route.useRouteContext();
  const { vaults } = getCollections(queryClient, organization.id);
  const { data } = useLiveQuery(
    (query) =>
      query
        .from({ vault: vaults })
        .orderBy(({ vault }) => vault.createdAt, "desc")
        .select(({ vault }) => vault),
    [vaults],
  );
  const [mutationError, setMutationError] = useState<string | null>(null);

  function watchPersistence(transaction: ReturnType<VaultCollection["insert"]>, message: string) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch(() => setMutationError(message));
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((vault) => (
            <Card key={vault.id}>
              <CardHeader>
                <CardTitle>
                  <Link
                    to="/dashboard/vaults/$vaultId"
                    params={{ vaultId: vault.id }}
                    className="hover:underline"
                  >
                    {vault.name}
                  </Link>
                </CardTitle>
                <CardDescription>{vault.description || "No description"}</CardDescription>
                <CardAction>{vault.$synced ? null : "Saving…"}</CardAction>
              </CardHeader>
              <CardFooter className="gap-2">
                <EditVaultDialog
                  vault={vault}
                  vaults={vaults}
                  watchPersistence={watchPersistence}
                />
                <DeleteVaultDialog
                  vault={vault}
                  vaults={vaults}
                  watchPersistence={watchPersistence}
                />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </Page>
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
}: {
  vault: VaultRow;
  vaults: VaultCollection;
  watchPersistence: WatchPersistence;
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

    const transaction = vaults.update(vault.id, (draft) => {
      draft.name = name;
      draft.description = description;
    });
    watchPersistence(transaction, `Could not update “${vault.name}”. Your change was rolled back.`);
    setNameError(null);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PencilIcon data-icon="inline-start" />
        Edit
      </DialogTrigger>
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
}: {
  vault: VaultRow;
  vaults: VaultCollection;
  watchPersistence: WatchPersistence;
}) {
  const [open, setOpen] = useState(false);

  function handleDelete() {
    const transaction = vaults.delete(vault.id);
    watchPersistence(transaction, `Could not delete “${vault.name}”. Your change was rolled back.`);
    setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <TrashIcon data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
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
