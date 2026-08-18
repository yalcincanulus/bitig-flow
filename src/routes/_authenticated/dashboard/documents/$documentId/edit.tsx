import { createFileRoute } from "@tanstack/react-router";
import { and, debounceStrategy, eq, useLiveQuery, usePacedMutations } from "@tanstack/react-db";
import { ImageIcon } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { Page, PageActions, PageHeader } from "#/components/page";
import { Alert, AlertDescription } from "#/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Button } from "#/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
import { clipboardLooksLikeRemoteImage, imageReferenceMarkdown } from "#/lib/document-references";
import {
  continueListItem,
  flushRetryDelaysMs,
  savingStatusMinMs,
  wait,
} from "#/lib/document-editor";
import {
  registerDocumentEditorFlush,
  waitForDocumentInsert,
} from "#/lib/document-editor-lifecycle";
import {
  documentTitleMaxLength,
  markdownContentCounterBytes,
  markdownContentMaxBytes,
  utf8ByteLength,
} from "#/lib/markdown-limits";
import {
  isDocumentConflictError,
  updateDocument,
  type DocumentConflictError,
} from "#/server/functions/documents";

export const Route = createFileRoute("/_authenticated/dashboard/documents/$documentId/edit")({
  loader: async ({ context: { organization, queryClient }, params: { documentId } }) => {
    const { documents } = getCollections(queryClient, organization.id);

    return resolveRow(documents, documentId);
  },
  component: DocumentEditorPage,
});

type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "failed" | "conflict";

function DocumentEditorPage() {
  const loaded = Route.useLoaderData();
  const { organization, queryClient } = Route.useRouteContext();
  const { documents } = getCollections(queryClient, organization.id);
  const { data: readyImages } = useLiveQuery(
    (query) =>
      query
        .from({ document: documents })
        .where(({ document }) => and(eq(document.kind, "image"), eq(document.status, "ready")))
        .orderBy(({ document }) => document.title)
        .select(({ document }) => document),
    [documents],
  );
  const [title, setTitle] = useState(loaded.title);
  const [content, setContent] = useState(loaded.content ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [conflict, setConflict] = useState<DocumentConflictError>();
  const [atCap, setAtCap] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [remoteImageNotice, setRemoteImageNotice] = useState(false);
  const lastKeyWasEscape = useRef(false);
  const insertReady = useRef(false);
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  const statusRef = useRef(status);
  titleRef.current = title;
  contentRef.current = content;
  statusRef.current = status;
  const savingStartedAt = useRef<number | null>(null);
  const generation = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentBytes = utf8ByteLength(content);
  const frozen = status === "conflict";

  const mutate = usePacedMutations<{ title: string; content: string }>({
    onMutate: (authored) => {
      documents.update(loaded.id, (draft) => {
        draft.title = authored.title;
        draft.content = authored.content;
      });
    },
    mutationFn: async () => {
      const currentGeneration = generation.current;
      setStatus("saving");
      savingStartedAt.current = Date.now();
      await persistOnce();
      if (currentGeneration === generation.current) await finishSaving("saved");
      return { refetch: false as const };
    },
    strategy: debounceStrategy({ wait: 800 }),
  });

  async function finishSaving(next: Extract<SaveStatus, "saved" | "failed">) {
    const started = savingStartedAt.current;
    if (started !== null) {
      const remaining = savingStatusMinMs - (Date.now() - started);
      if (remaining > 0) await wait(remaining);
    }
    setStatus(next);
  }

  function queueAutosave(nextTitle: string, nextContent: string) {
    generation.current += 1;
    const currentGeneration = generation.current;
    const transaction = mutate({ title: nextTitle, content: nextContent });
    void transaction.isPersisted.promise.catch((error: unknown) => {
      if (currentGeneration !== generation.current) return;
      if (isDocumentConflictError(error)) {
        setConflict(error);
        setStatus("conflict");
        return;
      }
      void finishSaving("failed");
    });
  }

  function noteChange(nextTitle: string, nextContent: string) {
    if (frozen) return;
    setAtCap(false);
    setTitle(nextTitle);
    setContent(nextContent);
    setStatus("unsaved");
    if (!insertReady.current) return;
    queueAutosave(nextTitle, nextContent);
  }

  async function persistOnce() {
    await waitForDocumentInsert(loaded.id);
    const row = documents.get(loaded.id);
    if (!row) return;

    const saved = await updateDocument({
      data: {
        documentId: loaded.id,
        title: titleRef.current,
        content: contentRef.current,
        updatedAt: row.updatedAt,
      },
    });
    documents.utils.writeUpdate(saved);
  }

  async function persistWithRetries() {
    const currentGeneration = generation.current;
    setStatus("saving");
    savingStartedAt.current = Date.now();

    try {
      await persistOnce();
      if (currentGeneration === generation.current) await finishSaving("saved");
      return;
    } catch (error) {
      if (isDocumentConflictError(error)) {
        setConflict(error);
        setStatus("conflict");
        return;
      }
    }

    for (const delay of flushRetryDelaysMs) {
      await wait(delay);
      if (currentGeneration !== generation.current) return;
      try {
        await persistOnce();
        if (currentGeneration === generation.current) await finishSaving("saved");
        return;
      } catch (error) {
        if (isDocumentConflictError(error)) {
          setConflict(error);
          setStatus("conflict");
          return;
        }
      }
    }

    if (currentGeneration === generation.current) await finishSaving("failed");
  }

  function retryFailedSave() {
    generation.current += 1;
    void persistWithRetries();
  }

  function takeTheirVersion() {
    if (!conflict) return;
    generation.current += 1;
    setTitle(conflict.title);
    setContent(conflict.content);
    documents.utils.writeUpdate({
      ...loaded,
      ...documents.get(loaded.id),
      title: conflict.title,
      content: conflict.content,
      updatedAt: conflict.updatedAt,
    });
    setConflict(undefined);
    setStatus("saved");
  }

  function overwriteTheirs() {
    const row = documents.get(loaded.id);
    if (!conflict || !row) return;
    generation.current += 1;
    documents.utils.writeUpdate({
      ...row,
      title,
      content,
      updatedAt: conflict.updatedAt,
    });
    setConflict(undefined);
    void persistWithRetries();
  }

  const persistWithRetriesRef = useRef(persistWithRetries);
  persistWithRetriesRef.current = persistWithRetries;

  useEffect(() => {
    return registerDocumentEditorFlush(() => persistWithRetriesRef.current());
  }, []);

  useEffect(() => {
    void waitForDocumentInsert(loaded.id).then(() => {
      insertReady.current = true;
      if (statusRef.current === "unsaved") {
        queueAutosave(titleRef.current, contentRef.current);
      }
    });
  }, [loaded.id]);

  useEffect(() => {
    return () => {
      const current = statusRef.current;
      if (current === "unsaved" || current === "saving" || current === "failed") {
        void persistWithRetriesRef.current();
      }
    };
  }, []);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (status === "unsaved" || status === "saving" || status === "failed") {
        event.preventDefault();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (status === "conflict") return;
        void persistWithRetriesRef.current();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status]);

  function handleContentKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      lastKeyWasEscape.current = true;
      return;
    }

    if (event.key === "Tab") {
      if (lastKeyWasEscape.current) {
        lastKeyWasEscape.current = false;
        return;
      }
      event.preventDefault();
      insertText("  ");
      lastKeyWasEscape.current = false;
      return;
    }

    lastKeyWasEscape.current = false;

    if (event.key === "Enter") {
      const textarea = event.currentTarget;
      const continued = continueListItem(textarea.value, textarea.selectionStart);
      if (!continued) return;
      event.preventDefault();
      if (utf8ByteLength(continued.value) > markdownContentMaxBytes) {
        setAtCap(true);
        return;
      }
      noteChange(title, continued.value);
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(continued.cursor, continued.cursor);
      });
    }
  }

  function insertText(text: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${content.slice(0, start)}${text}${content.slice(end)}`;
    if (utf8ByteLength(next) > markdownContentMaxBytes) {
      setAtCap(true);
      return;
    }
    noteChange(title, next);
    requestAnimationFrame(() => {
      const cursor = start + text.length;
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function insertPickedImage(image: { id: string; title: string }) {
    insertText(imageReferenceMarkdown(image.title, image.id));
    setPickerOpen(false);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData("text/plain");
    if (!clipboardLooksLikeRemoteImage(pasted)) return;
    event.preventDefault();
    setRemoteImageNotice(true);
  }

  function handleContentChange(next: string) {
    if (utf8ByteLength(next) > markdownContentMaxBytes) {
      setAtCap(true);
      return;
    }
    noteChange(title, next);
  }

  function handleTitleChange(next: string) {
    if (next.length > documentTitleMaxLength) return;
    noteChange(next, content);
  }

  return (
    <Page className="h-full min-h-0">
      <PageHeader>
        <div className="min-w-0 sm:col-start-1">
          <Input
            aria-label="Title"
            value={title}
            maxLength={documentTitleMaxLength}
            readOnly={frozen}
            onChange={(event) => handleTitleChange(event.target.value)}
            className="h-9 w-full border-0 bg-transparent px-0 text-lg font-medium md:text-lg"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-start-1">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {statusLine(status)}
          </p>
          {status === "failed" ? (
            <Button variant="link" className="h-auto px-0" onClick={retryFailedSave}>
              Retry
            </Button>
          ) : null}
        </div>
        <PageActions>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={frozen}
            onClick={() => setPickerOpen(true)}
          >
            <ImageIcon data-icon="inline-start" />
            Insert image
          </Button>
        </PageActions>
      </PageHeader>

      {atCap ? (
        <Alert variant="destructive">
          <AlertDescription>
            This Document is at the 256 KB limit. Further input is refused.
          </AlertDescription>
        </Alert>
      ) : null}

      {remoteImageNotice ? (
        <Alert>
          <AlertDescription>Images must come from this Organization.</AlertDescription>
        </Alert>
      ) : null}

      <Textarea
        ref={textareaRef}
        aria-label="Markdown"
        value={content}
        readOnly={frozen}
        onChange={(event) => handleContentChange(event.target.value)}
        onKeyDown={handleContentKeyDown}
        onPaste={handlePaste}
        className="min-h-0 flex-1 resize-none font-mono text-sm md:text-sm"
      />

      {contentBytes >= markdownContentCounterBytes ? (
        <p className="text-xs text-muted-foreground">
          {contentBytes.toLocaleString()} / {markdownContentMaxBytes.toLocaleString()} bytes
        </p>
      ) : null}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert image</DialogTitle>
            <DialogDescription>
              Choose a ready image Document from this Organization.
            </DialogDescription>
          </DialogHeader>
          {(readyImages ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No ready images</EmptyTitle>
                <EmptyDescription>
                  Upload an image Document and wait until it is ready.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {(readyImages ?? []).map((image) => (
                <li key={image.id}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start py-2"
                    onClick={() => insertPickedImage(image)}
                  >
                    <span className="truncate">{image.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={conflict !== undefined}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This Document changed while you were editing</AlertDialogTitle>
            <AlertDialogDescription>
              {conflict
                ? `${conflict.updatedByName} saved a different version. Take their version, or overwrite theirs. There is no merge.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="outline" onClick={takeTheirVersion}>
              Take their version
            </AlertDialogAction>
            <AlertDialogAction onClick={overwriteTheirs}>Overwrite theirs</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function statusLine(status: SaveStatus) {
  switch (status) {
    case "unsaved":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "failed":
      return "The changes are not saved.";
    case "conflict":
      return "Saving paused";
    case "idle":
      return "";
  }
}
