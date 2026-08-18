import { createFileRoute } from "@tanstack/react-router";
import { debounceStrategy, usePacedMutations } from "@tanstack/react-db";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

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
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { getCollections } from "#/db-collections";
import { resolveRow } from "#/db-collections/resolve";
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
  const [title, setTitle] = useState(loaded.title);
  const [content, setContent] = useState(loaded.content ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [conflict, setConflict] = useState<DocumentConflictError>();
  const [atCap, setAtCap] = useState(false);
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
    <main className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Title"
          value={title}
          maxLength={documentTitleMaxLength}
          readOnly={frozen}
          onChange={(event) => handleTitleChange(event.target.value)}
          className="h-9 min-w-48 flex-1 border-0 bg-transparent px-0 text-lg font-medium md:text-lg"
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {statusLine(status)}
          {status === "failed" ? (
            <>
              {" "}
              <Button variant="link" className="h-auto px-0" onClick={retryFailedSave}>
                Retry
              </Button>
            </>
          ) : null}
        </p>
      </header>

      {atCap ? (
        <Alert variant="destructive">
          <AlertDescription>
            This Document is at the 256 KB limit. Further input is refused.
          </AlertDescription>
        </Alert>
      ) : null}

      <Textarea
        ref={textareaRef}
        aria-label="Markdown"
        value={content}
        readOnly={frozen}
        onChange={(event) => handleContentChange(event.target.value)}
        onKeyDown={handleContentKeyDown}
        className="min-h-0 flex-1 resize-none font-mono text-sm md:text-sm"
      />

      {contentBytes >= markdownContentCounterBytes ? (
        <p className="text-xs text-muted-foreground">
          {contentBytes.toLocaleString()} / {markdownContentMaxBytes.toLocaleString()} bytes
        </p>
      ) : null}

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
    </main>
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
