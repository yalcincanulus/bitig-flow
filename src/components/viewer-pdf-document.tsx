"use client";

import { lazy, Suspense } from "react";

import { ViewerByteDocument } from "#/components/viewer-byte-document";
import type { VisitorPdfContent } from "#/server/viewer/visitor-gate";
import { viewerBytesUrl } from "#/lib/document-bytes";

const ViewerPdf = lazy(() => import("#/components/viewer-pdf"));

export function ViewerPdfDocument({ page }: { page: VisitorPdfContent }) {
  const bytesUrl = viewerBytesUrl(page.slug, page.documentId);

  return (
    <ViewerByteDocument page={page}>
      <Suspense fallback={null}>
        <ViewerPdf bytesUrl={bytesUrl} pageCount={page.pageCount} />
      </Suspense>
    </ViewerByteDocument>
  );
}
