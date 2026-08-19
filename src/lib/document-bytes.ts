import { documentIdSchema } from "#/server/ids";

export function documentBytesUrl(documentId: string, options?: { download?: boolean }) {
  const path = `/api/documents/${documentId}/bytes`;
  return options?.download ? `${path}?download=1` : path;
}

function parseDocumentReference(src: string) {
  if (!src.startsWith("doc/")) return undefined;
  const parsed = documentIdSchema.safeParse(src.slice("doc/".length));
  return parsed.success ? parsed.data : undefined;
}

export function dashboardResolveImage(readyImageIds: ReadonlySet<string>) {
  return (src: string) => {
    const documentId = parseDocumentReference(src);
    if (!documentId || !readyImageIds.has(documentId)) return undefined;
    return documentBytesUrl(documentId);
  };
}

export function viewerBytesUrl(slug: string, documentId: string) {
  return `/v/${slug}/bytes/${documentId}`;
}

export function viewerResolveImage(slug: string, referencedDocumentIds: ReadonlySet<string>) {
  return (src: string) => {
    const documentId = parseDocumentReference(src);
    if (!documentId || !referencedDocumentIds.has(documentId)) return undefined;
    return viewerBytesUrl(slug, documentId);
  };
}
