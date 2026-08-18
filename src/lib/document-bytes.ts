import { documentIdSchema } from "#/server/ids";

export function documentBytesUrl(documentId: string, options?: { download?: boolean }) {
  const path = `/api/documents/${documentId}/bytes`;
  return options?.download ? `${path}?download=1` : path;
}

export function dashboardResolveImage(readyImageIds: ReadonlySet<string>) {
  return (src: string) => {
    if (!src.startsWith("doc/")) return undefined;
    const parsed = documentIdSchema.safeParse(src.slice("doc/".length));
    if (!parsed.success || !readyImageIds.has(parsed.data)) return undefined;
    return documentBytesUrl(parsed.data);
  };
}
