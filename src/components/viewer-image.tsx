"use client";

import { ViewerByteDocument } from "#/components/viewer-byte-document";
import { viewerPaperSurface } from "#/components/viewer-paper";
import { viewerBytesUrl } from "#/lib/document-bytes";
import { cn } from "#/lib/utils";
import type { VisitorImageContent } from "#/server/viewer/visitor-gate";

export function ViewerImage({ page }: { page: VisitorImageContent }) {
  return (
    <ViewerByteDocument page={page}>
      <img
        src={viewerBytesUrl(page.slug, page.documentId)}
        alt={page.title}
        className={cn(viewerPaperSurface, "mx-auto mt-6 max-w-full border")}
      />
    </ViewerByteDocument>
  );
}
