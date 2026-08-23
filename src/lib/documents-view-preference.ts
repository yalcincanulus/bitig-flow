import type { DocumentsView } from "#/lib/dashboard-search";

const STORAGE_KEY = "documents-view";

/**
 * The layout a User last chose for the Documents page, remembered between visits.
 *
 * The URL still says what is on screen — this only answers the question the URL cannot, which is
 * what to show when someone arrives at `/dashboard/documents` with nothing after it. Reading it
 * during render is safe because the whole Dashboard subtree opts out of SSR, so there is no server
 * pass to disagree with. Storage can still throw when a browser blocks it, and a blocked read is
 * not worth a broken page, so both sides swallow it and fall back to the default.
 */
export function readDocumentsView(): DocumentsView | undefined {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored === "grid" || stored === "list" ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function writeDocumentsView(view: DocumentsView) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, view);
  } catch {
    // A User who blocks storage simply gets the default next time.
  }
}
