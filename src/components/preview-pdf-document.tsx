"use client";

import { lazy, Suspense } from "react";

import { documentBytesUrl } from "#/lib/document-bytes";

// The Preview mounts the Viewer's island against the Dashboard byte route. The credential is
// expressed entirely by which URL is passed in, so the two surfaces share a renderer without
// sharing a credential path (ADR-0018).
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
