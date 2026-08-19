"use client";

import type { ReactNode } from "react";

import { useViewerBytesReady } from "#/components/viewer-bytes-status";
import { ViewerDownloadControl } from "#/components/viewer-download-control";
import { ViewerUploadingState } from "#/components/viewer-uploading-state";
import { viewerBytesUrl } from "#/lib/document-bytes";
import type { VisitorImageContent, VisitorPdfContent } from "#/server/viewer/visitor-gate";

export function ViewerByteDocument({
  page,
  children,
}: {
  page: VisitorImageContent | VisitorPdfContent;
  children: ReactNode;
}) {
  const bytesUrl = viewerBytesUrl(page.slug, page.documentId);
  const { pending, retry } = useViewerBytesReady(page.bytesPending, bytesUrl);

  return (
    <>
      <ViewerDownloadControl
        allowDownload={page.allowDownload}
        slug={page.slug}
        documentId={page.documentId}
        fileName={page.fileName}
      />
      {pending ? <ViewerUploadingState onRetry={() => void retry()} /> : children}
    </>
  );
}
