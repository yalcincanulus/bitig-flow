export function documentBytesUrl(documentId: string, options?: { download?: boolean }) {
  const path = `/api/documents/${documentId}/bytes`;
  return options?.download ? `${path}?download=1` : path;
}
