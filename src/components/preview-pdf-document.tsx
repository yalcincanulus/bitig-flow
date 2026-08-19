"use client";

import { lazy, Suspense } from "react";

import { documentBytesUrl } from "#/lib/document-bytes";

// One renderer for both surfaces, as ADR-0059 asks of the Preview and ADR-0060 of the island.
// The credential is expressed entirely by which URL is passed in — this one is the Dashboard byte
// route, so the two credential paths ADR-0018 separates stay separate.
const ViewerPdf = lazy(() => import("#/components/viewer-pdf"));

export function PreviewPdfDocument({
  documentId,
  pageCount,
}: {
  documentId: string;
  pageCount: number | null;
}) {
  return (
    <Suspense fallback={null}>
      <ViewerPdf bytesUrl={documentBytesUrl(documentId)} pageCount={pageCount} />
    </Suspense>
  );
}
