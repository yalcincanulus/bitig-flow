import { DownloadIcon } from "lucide-react";

import { Button } from "#/components/ui/button";
import { viewerBytesUrl } from "#/lib/document-bytes";
import type { DocumentId } from "#/server/ids";

export function ViewerDownloadControl({
  allowDownload,
  slug,
  documentId,
  fileName,
}: {
  allowDownload: boolean;
  slug: string;
  documentId: DocumentId;
  fileName: string | null;
}) {
  if (!allowDownload) {
    return (
      <p className="mt-4 text-base text-muted-foreground">Downloading is disabled for this link</p>
    );
  }

  return (
    <Button
      nativeButton={false}
      size="lg"
      className="mt-5"
      render={
        <a
          href={viewerBytesUrl(slug, documentId, { download: true })}
          download={fileName ?? undefined}
        />
      }
    >
      <DownloadIcon data-icon="inline-start" />
      Download
    </Button>
  );
}
