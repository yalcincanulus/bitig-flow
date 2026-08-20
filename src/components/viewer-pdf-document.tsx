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
        <div className="relative left-1/2 w-screen max-w-none -translate-x-1/2">
          <ViewerPdf bytesUrl={bytesUrl} pageCount={page.pageCount} />
        </div>
      </Suspense>
    </ViewerByteDocument>
  );
}
