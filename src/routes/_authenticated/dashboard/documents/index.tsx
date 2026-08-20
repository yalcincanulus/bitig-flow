import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { eq, ilike, useLiveQuery } from "@tanstack/react-db";
import {
  ChartNoAxesCombinedIcon,
  DownloadIcon,
  EllipsisIcon,
  FileTextIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import { FilterBar, FilterBarLabel, FilterBarSpacer } from "#/components/dashboard-filter-bar";
import { DocumentThumbnail, documentKindLabel } from "#/components/document-kind";
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from "#/components/page";
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
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
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
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "#/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { getCollections } from "#/db-collections";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { documentsSearchSchema } from "#/lib/dashboard-search";
import { documentBytesUrl } from "#/lib/document-bytes";
import { rememberDocumentInsert } from "#/lib/document-editor-lifecycle";
import {
  documentKindFromMimeType,
  isAllowedUploadMimeType,
  mimeTypeFromFileName,
  sanitizeFileName,
  uploadMaxBytes,
  type AllowedUploadMimeType,
} from "#/lib/upload";
import {
  confirmUpload,
  createUpload,
  isUploadConfirmationError,
  isUploadIncompleteError,
} from "#/server/functions/documents";

export const Route = createFileRoute("/_authenticated/dashboard/documents/")({
  validateSearch: documentsSearchSchema,
  component: DocumentsPage,
});

type DocumentCollection = ReturnType<typeof getCollections>["documents"];
type DocumentRow = NonNullable<ReturnType<DocumentCollection["get"]>>;

type WatchPersistence = (
  transaction: ReturnType<DocumentCollection["insert"]>,
  message: string,
) => void;

const kindFilters = [
  { value: "all", label: "All" },
  { value: "markdown", label: "Markdown" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Images" },
] as const;

async function putThenConfirm(
  uploadUrl: string,
  file: File,
  documentId: string,
  contentType: AllowedUploadMimeType,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const uploaded = await fetch(uploadUrl, { method: "PUT", body: file });
    if (!uploaded.ok) {
      if (attempt === 0) continue;
      throw new Error("put failed");
    }
    try {
      return await confirmUpload({ data: { documentId, contentType } });
    } catch (error) {
      if (isUploadIncompleteError(error) && attempt === 0) continue;
      throw error;
    }
  }
  throw new Error("put failed");
}

function DocumentsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { organization, queryClient, session } = Route.useRouteContext();
  const { documents, vaults, vaultItems } = getCollections(queryClient, organization.id);
  const { data } = useLiveQuery(
    (query) => {
      let filtered = query.from({ document: documents });
      const { kind, q, vault } = search;

      if (kind) {
        filtered = filtered.where(({ document }) => eq(document.kind, kind));
      }
      if (q) {
        filtered = filtered.where(({ document }) => ilike(document.title, `%${q}%`));
      }

      if (!vault) return filtered.select(({ document }) => document);

      return filtered
        .innerJoin({ vaultItem: vaultItems }, ({ document, vaultItem }) =>
          eq(document.id, vaultItem.documentId),
        )
        .where(({ vaultItem }) => eq(vaultItem.vaultId, vault))
        .select(({ document }) => document);
    },
    [documents, search.kind, search.q, search.vault, vaultItems],
  );
  const { data: vaultRows } = useLiveQuery(
    (query) => query.from({ vault: vaults }).select(({ vault }) => vault),
    [vaults],
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const isFiltered = Boolean(search.kind || search.q || search.vault);
  const filteredVault = search.vault
    ? vaultRows.find((vault) => vault.id === search.vault)
    : undefined;

  function watchPersistence(
    transaction: ReturnType<DocumentCollection["insert"]>,
    message: string,
  ) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch(() => setMutationError(message));
  }

  function setSearch(next: Partial<typeof search>) {
    void navigate({ to: "/dashboard/documents", search: { ...search, ...next } });
  }

  function submitTitleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    setSearch({ q: typeof value === "string" && value.trim() ? value.trim() : undefined });
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.documents.label}</PageTitle>
        <PageDescription>
          Write markdown Documents or upload a PDF or image from this pane.
        </PageDescription>
        <PageActions>
          <UploadDocumentButton
            organizationId={organization.id}
            createdBy={session.user.id}
            documents={documents}
            onError={setMutationError}
          />
          <CreateDocumentDialog
            organizationId={organization.id}
            createdBy={session.user.id}
            documents={documents}
            watchPersistence={watchPersistence}
          />
        </PageActions>
      </PageHeader>

      <FilterBar>
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[search.kind ?? "all"]}
          onValueChange={(value) => {
            const next = value[0];
            if (!next) return;
            setSearch({ kind: next === "all" ? undefined : (next as typeof search.kind) });
          }}
          aria-label="Filter by kind"
        >
          {kindFilters.map((filter) => (
            <ToggleGroupItem key={filter.value} value={filter.value}>
              {filter.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {filteredVault ? (
          <Badge variant="secondary">
            In {filteredVault.name}
            <button
              type="button"
              aria-label="Clear the Vault filter"
              className="-mr-1 rounded-full p-0.5 hover:bg-foreground/10"
              onClick={() => setSearch({ vault: undefined })}
            >
              <XIcon className="size-2.5" />
            </button>
          </Badge>
        ) : null}

        <FilterBarSpacer />

        <form onSubmit={submitTitleSearch} key={search.q ?? ""}>
          <InputGroup className="w-full sm:w-56">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              name="q"
              defaultValue={search.q ?? ""}
              placeholder="Search titles"
              aria-label="Search Document titles"
            />
            {search.q ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear the title search"
                  onClick={() => setSearch({ q: undefined })}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </form>

        <FilterBarLabel>
          {data.length} {data.length === 1 ? "Document" : "Documents"}
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
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>No matching Documents</EmptyTitle>
              <EmptyDescription>
                Nothing matches the current kind, Vault, or title filter.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                onClick={() => void navigate({ to: "/dashboard/documents", search: {} })}
              >
                Clear filters
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>No Documents yet</EmptyTitle>
              <EmptyDescription>
                Create a markdown Document or upload a PDF or image.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <CreateDocumentDialog
                organizationId={organization.id}
                createdBy={session.user.id}
                documents={documents}
                watchPersistence={watchPersistence}
                triggerLabel="Create your first Document"
              />
            </EmptyContent>
          </Empty>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {data.map((document) => (
            <DocumentTile
              key={document.id}
              document={document}
              documents={documents}
              watchPersistence={watchPersistence}
            />
          ))}
        </div>
      )}
    </Page>
  );
}

/**
 * One Document in the grid.
 *
 * Every tile is the same height whatever the Document is, and carries one control rather than a
 * row of them: the whole tile is the way in, and the verbs an owner uses rarely sit behind the
 * menu instead of competing with the Document's own name.
 */
function DocumentTile({
  document,
  documents,
  watchPersistence,
}: Readonly<{
  document: DocumentRow;
  documents: DocumentCollection;
  watchPersistence: WatchPersistence;
}>) {
  const [deleting, setDeleting] = useState(false);
  const pending = document.status === "pending";

  return (
    <Card className="group gap-0 overflow-hidden py-0 transition-shadow hover:ring-foreground/20">
      <Link
        to="/dashboard/documents/$documentId"
        params={{ documentId: document.id }}
        aria-label={document.title || "Untitled"}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <DocumentThumbnail document={document} />
      </Link>
      <CardHeader className="gap-1 border-t border-border py-3">
        <CardTitle className="min-w-0">
          <Link
            to="/dashboard/documents/$documentId"
            params={{ documentId: document.id }}
            className="block truncate hover:underline"
          >
            {document.title || "Untitled"}
          </Link>
        </CardTitle>
        <CardDescription>
          {pending ? "Uploading…" : document.$synced ? documentKindLabel(document.kind) : "Saving…"}
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Document actions" />}
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={
                    <Link
                      to="/dashboard/documents/$documentId"
                      params={{ documentId: document.id }}
                    />
                  }
                >
                  <ChartNoAxesCombinedIcon />
                  Preview and activity
                </DropdownMenuItem>
                {document.kind === "markdown" ? (
                  <DropdownMenuItem
                    render={
                      <Link
                        to="/dashboard/documents/$documentId/edit"
                        params={{ documentId: document.id }}
                      />
                    }
                  >
                    <PencilIcon />
                    Edit
                  </DropdownMenuItem>
                ) : null}
                {document.kind !== "markdown" && !pending ? (
                  <DropdownMenuItem
                    render={<a href={documentBytesUrl(document.id, { download: true })} />}
                  >
                    <DownloadIcon />
                    Download
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  disabled={pending}
                  render={
                    <Link to="/dashboard/links" search={pending ? {} : { target: document.id }} />
                  }
                >
                  <LinkIcon />
                  Links to it
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                  <TrashIcon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <DeleteDocumentDialog
        document={document}
        documents={documents}
        watchPersistence={watchPersistence}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </Card>
  );
}

function UploadDocumentButton({
  organizationId,
  createdBy,
  documents,
  onError,
}: {
  organizationId: string;
  createdBy: string;
  documents: DocumentCollection;
  onError: (message: string | null) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    const contentType = isAllowedUploadMimeType(file.type)
      ? file.type
      : mimeTypeFromFileName(file.name);
    if (!contentType) {
      onError("That Document type cannot be uploaded.");
      return;
    }
    if (file.size > uploadMaxBytes) {
      onError("That Document is larger than 25 MB.");
      return;
    }

    const documentId = uuidv7();
    const now = new Date();
    const fileName = sanitizeFileName(file.name) || file.name;
    const pending = {
      id: documentId,
      organizationId,
      title: fileName.trim() || "Untitled",
      kind: documentKindFromMimeType(contentType),
      status: "pending" as const,
      content: null,
      storageKey: null,
      fileName,
      mimeType: null,
      byteSize: null,
      checksum: null,
      pageCount: null,
      createdBy,
      updatedBy: createdBy,
      createdAt: now,
      updatedAt: now,
    };

    onError(null);
    documents.utils.writeInsert(pending);

    let persisted = false;
    try {
      const created = await createUpload({
        data: { documentId, fileName: file.name, contentType },
      });
      persisted = true;
      documents.utils.writeUpdate(created.document);

      const confirmed = await putThenConfirm(created.uploadUrl, file, documentId, contentType);
      documents.utils.writeUpdate(confirmed);
    } catch (error) {
      if (!persisted || isUploadConfirmationError(error)) {
        documents.utils.writeDelete(documentId);
      }
      onError(`Could not upload “${fileName}”.`);
    }
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf,.png,.jpg,.jpeg,.webp,.gif"
        className="sr-only"
        tabIndex={-1}
        aria-label="Upload a Document"
        onChange={(event) => {
          void handleFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
        <UploadIcon data-icon="inline-start" />
        Upload
      </Button>
    </>
  );
}

function CreateDocumentDialog({
  organizationId,
  createdBy,
  documents,
  watchPersistence,
  triggerLabel = "Create Document",
}: {
  organizationId: string;
  createdBy: string;
  documents: DocumentCollection;
  watchPersistence: WatchPersistence;
  triggerLabel?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const titleValue = formData.get("title");
    const title = typeof titleValue === "string" ? titleValue.trim() : "";
    const documentId = uuidv7();
    const now = new Date();
    const transaction = documents.insert({
      id: documentId,
      organizationId,
      title,
      kind: "markdown",
      status: "ready",
      content: "",
      storageKey: null,
      fileName: null,
      mimeType: null,
      byteSize: null,
      checksum: null,
      pageCount: null,
      createdBy,
      updatedBy: createdBy,
      createdAt: now,
      updatedAt: now,
    });
    rememberDocumentInsert(documentId, transaction.isPersisted.promise);
    watchPersistence(transaction, `Could not create the Document. Your change was rolled back.`);
    setOpen(false);
    void navigate({
      to: "/dashboard/documents/$documentId/edit",
      params: { documentId },
    });
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
            <DialogTitle>Create Document</DialogTitle>
            <DialogDescription>
              Give it a title, or leave it blank and it will be called Untitled.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="create-document-title">Title</FieldLabel>
              <Input id="create-document-title" name="title" autoComplete="off" />
            </Field>
          </FieldGroup>
          <DialogFooter showCloseButton>
            <Button type="submit">Create Document</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDocumentDialog({
  document,
  documents,
  watchPersistence,
  open,
  onOpenChange,
}: {
  document: DocumentRow;
  documents: DocumentCollection;
  watchPersistence: WatchPersistence;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  function handleDelete() {
    const transaction = documents.delete(document.id);
    watchPersistence(
      transaction,
      `Could not delete “${document.title}”. Your change was rolled back.`,
    );
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{document.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the Document, its Vault memberships, and its Links. Its analytics history
            goes, and Links including it will show less activity.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete}>
            Delete Document
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
