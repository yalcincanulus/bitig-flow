export function documentBytesUrl(documentId: string, options?: { download?: boolean }) {
  const path = `/api/documents/${documentId}/bytes`;
  return options?.download ? `${path}?download=1` : path;
}

const documentReferencePattern =
  /^doc\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function dashboardResolveImage(src: string) {
  const match = documentReferencePattern.exec(src);
  if (!match) return undefined;
  return documentBytesUrl(match[1]!);
}
