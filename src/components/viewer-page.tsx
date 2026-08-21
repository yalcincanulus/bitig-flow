import { useCallback, useRef } from "react";

import { ViewerColumn } from "#/components/viewer-column";
import { ViewerContentPage } from "#/components/viewer-content-page";
import { ViewerGatePage } from "#/components/viewer-gate-page";
import { PdfVisiblePageProvider } from "#/components/viewer-pdf-visible-page";
import { ViewerShell } from "#/components/viewer-shell";
import { useDwellPage } from "#/hooks/viewer-dwell-context";
import type { VisitorPage } from "#/server/viewer/visitor-gate";

export function ViewerPage({ page }: { page: VisitorPage }) {
  const visiblePageRef = useRef(1);
  const reportVisiblePage = useCallback((next: number) => {
    visiblePageRef.current = next;
  }, []);
  const documentId =
    page.status === "content" && page.kind !== "vault_index" ? page.documentId : null;

  useDwellPage(documentId, () =>
    page.status === "content" && page.kind === "pdf" ? visiblePageRef.current : 1,
  );

  const body =
    page.status !== "content" ? (
      <ViewerColumn>
        <ViewerGatePage page={page} />
      </ViewerColumn>
    ) : page.kind === "pdf" ? (
      <PdfVisiblePageProvider onPage={reportVisiblePage}>
        <ViewerContentPage page={page} />
      </PdfVisiblePageProvider>
    ) : (
      <ViewerContentPage page={page} />
    );

  return <ViewerShell>{body}</ViewerShell>;
}
