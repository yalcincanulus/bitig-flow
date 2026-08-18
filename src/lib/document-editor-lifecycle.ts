const pendingInserts = new Map<string, Promise<unknown>>();

export function rememberDocumentInsert(documentId: string, persisted: Promise<unknown>) {
  pendingInserts.set(
    documentId,
    persisted.finally(() => {
      pendingInserts.delete(documentId);
    }),
  );
}

export function waitForDocumentInsert(documentId: string) {
  return pendingInserts.get(documentId) ?? Promise.resolve();
}

let editorFlush: (() => Promise<void>) | undefined;

export function registerDocumentEditorFlush(flush: () => Promise<void>) {
  editorFlush = flush;
  return () => {
    if (editorFlush === flush) editorFlush = undefined;
  };
}

export function flushDocumentEditor() {
  return editorFlush?.() ?? Promise.resolve();
}
