"use client";

import { ViewerByteDocument } from "#/components/viewer-byte-document";
import { viewerBytesUrl } from "#/lib/document-bytes";
import type { VisitorImageContent } from "#/server/viewer/visitor-gate";

export function ViewerImage({ page }: { page: VisitorImageContent }) {
  return (
    <ViewerByteDocument page={page}>
      <img
        src={viewerBytesUrl(page.slug, page.documentId)}
        alt={page.title}
        className="relative left-1/2 mt-6 w-screen max-w-none -translate-x-1/2"
      />
    </ViewerByteDocument>
  );
}
