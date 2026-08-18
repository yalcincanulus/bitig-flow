export function previewQueryKey(documentId: string, updatedAt: Date) {
  return ["documents", documentId, "preview", updatedAt.toISOString()] as const;
}
