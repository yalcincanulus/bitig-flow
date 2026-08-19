"use client";

import { lazy, Suspense } from "react";

import { ViewerByteDocument } from "#/components/viewer-byte-document";
import type { VisitorPdfContent } from "#/server/viewer/visitor-gate";

const ViewerPdf = lazy(() => import("#/components/viewer-pdf"));

export function ViewerPdfDocument({ page }: { page: VisitorPdfContent }) {
  return (
    <ViewerByteDocument page={page}>
      <Suspense fallback={null}>
        <ViewerPdf pageCount={page.pageCount} />
      </Suspense>
    </ViewerByteDocument>
  );
}
