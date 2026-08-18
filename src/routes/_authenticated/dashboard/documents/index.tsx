import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { eq, ilike, useLiveQuery } from "@tanstack/react-db";
import { FileTextIcon, PlusIcon, TrashIcon, UploadIcon } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
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
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { getCollections } from "#/db-collections";
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
  const { organization, queryClient, session } = Route.useRouteContext();
  const { documents, vaultItems } = getCollections(queryClient, organization.id);
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
  const [mutationError, setMutationError] = useState<string | null>(null);
  const isFiltered = Boolean(search.kind || search.q || search.vault);

  function watchPersistence(
    transaction: ReturnType<DocumentCollection["insert"]>,
    message: string,
  ) {
    setMutationError(null);
    void transaction.isPersisted.promise.catch(() => setMutationError(message));
  }

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-lg font-medium">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Write markdown Documents or upload a PDF or image from this pane.
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </header>

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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((document) => (
            <Card key={document.id}>
              {document.kind === "image" && document.status === "ready" ? (
                <img
                  src={documentBytesUrl(document.id)}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
              ) : null}
              <CardHeader>
                <CardTitle>
                  <Link
                    to="/dashboard/documents/$documentId"
                    params={{ documentId: document.id }}
                    className="hover:underline"
                  >
                    {document.title || "Untitled"}
                  </Link>
                </CardTitle>
                <CardDescription>{document.kind}</CardDescription>
                <CardAction>
                  {document.status === "pending"
                    ? "Uploading…"
                    : document.$synced
                      ? null
                      : "Saving…"}
                </CardAction>
              </CardHeader>
              <CardFooter className="gap-2">
                {document.kind === "markdown" ? (
                  <Link
                    to="/dashboard/documents/$documentId/edit"
                    params={{ documentId: document.id }}
                  >
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                ) : null}
                <DeleteDocumentDialog
                  document={document}
                  documents={documents}
                  watchPersistence={watchPersistence}
                />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </main>
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
}: {
  document: DocumentRow;
  documents: DocumentCollection;
  watchPersistence: WatchPersistence;
}) {
  const [open, setOpen] = useState(false);

  function handleDelete() {
    const transaction = documents.delete(document.id);
    watchPersistence(
      transaction,
      `Could not delete “${document.title}”. Your change was rolled back.`,
    );
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
          <AlertDialogTitle>Delete “{document.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the Document, its Vault memberships, and its Links.
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
