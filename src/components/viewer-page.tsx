import { useCallback, useRef } from "react";

import { ViewerColumn } from "#/components/viewer-column";
import { ViewerContentPage } from "#/components/viewer-content-page";
import { ViewerGatePage } from "#/components/viewer-gate-page";
import { PdfVisiblePageProvider } from "#/components/viewer-pdf-visible-page";
import { useDwellPage } from "#/hooks/use-viewer-dwell";
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

  if (page.status !== "content") {
    return (
      <ViewerColumn>
        <ViewerGatePage page={page} />
      </ViewerColumn>
    );
  }
  if (page.kind !== "pdf") return <ViewerContentPage page={page} />;

  return (
    <PdfVisiblePageProvider onPage={reportVisiblePage}>
      <ViewerContentPage page={page} />
    </PdfVisiblePageProvider>
  );
}
