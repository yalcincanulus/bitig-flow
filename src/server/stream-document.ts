import { streamStoredObject } from "#/server/storage";

export type StreamableDocument = Readonly<{
  id: string;
  status: "pending" | "ready";
  storageKey: string | null;
  mimeType: string | null;
  fileName: string | null;
}>;

export type ByteDisposition = "inline" | "attachment";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
} as const;

function attachmentFileName(fileName: string | null) {
  return (fileName ?? "document").replaceAll(/["\\]/g, "_");
}

function contentDisposition(disposition: ByteDisposition, fileName: string | null) {
  if (disposition === "inline") return "inline";
  return `attachment; filename="${attachmentFileName(fileName)}"`;
}

export function byteErrorResponse(status: number) {
  return new Response(null, { status, headers: securityHeaders });
}

export async function streamDocument(options: {
  document: StreamableDocument;
  range: string | null;
  disposition: ByteDisposition;
}) {
  if (options.document.status === "pending") return byteErrorResponse(409);

  const { id, storageKey, mimeType, fileName } = options.document;
  if (!storageKey || !mimeType) {
    console.error("ready Document is missing a storage key or sniffed type", { documentId: id });
    return byteErrorResponse(404);
  }

  const stored = await streamStoredObject(storageKey, options.range);
  if (!stored) {
    console.error("ready Document object is missing", { documentId: id, storageKey });
    return byteErrorResponse(404);
  }

  const headers = new Headers(securityHeaders);
  headers.set("Content-Type", mimeType);
  headers.set("Content-Disposition", contentDisposition(options.disposition, fileName));
  if (stored.contentRange) headers.set("Content-Range", stored.contentRange);
  if (stored.contentLength !== undefined) {
    headers.set("Content-Length", String(stored.contentLength));
  }

  return new Response(stored.body, { status: stored.status, headers });
}
