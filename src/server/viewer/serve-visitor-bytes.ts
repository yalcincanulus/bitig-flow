import { eq } from "drizzle-orm";

import { db } from "#/server/db/client";
import { document, visitEvent } from "#/server/db/schema";
import { documentIdSchema, visitIdSchema, type DocumentId, type VisitId } from "#/server/ids";
import {
  byteErrorResponse,
  meterDemoDocumentResponse,
  streamDocument,
} from "#/server/stream-document";
import { liveVisitForLink } from "#/server/viewer/mint-visit";
import { isDocumentReachableFromLink } from "#/server/viewer/reachability";
import { findVisitorLink } from "#/server/viewer/visitor-gate";
import { consumeDemoAnalyticsBudget } from "#/server/demo-policy";
import { rollbackDemoBudgets } from "#/server/repositories/demo-environments";

async function findVisitorDocument(documentId: DocumentId) {
  const [found] = await db
    .select({
      id: document.id,
      status: document.status,
      storageKey: document.storageKey,
      mimeType: document.mimeType,
      fileName: document.fileName,
    })
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);

  return found;
}

async function appendDownloadEvent(
  environmentId: string | undefined,
  visitId: VisitId | null,
  documentId: DocumentId,
) {
  if (visitId === null) return;
  if (!(await consumeDemoAnalyticsBudget(environmentId, "download"))) return;
  try {
    await db.insert(visitEvent).values({
      visitId,
      documentId,
      type: "download",
      payload: { via: "button" },
      occurredAt: new Date(),
    });
  } catch (error) {
    if (environmentId) {
      await rollbackDemoBudgets(environmentId, [{ kind: "download", amount: 1 }]);
    }
    throw error;
  }
}

export async function serveVisitorBytes(request: Request, slug: string, documentIdParam: string) {
  const parsed = documentIdSchema.safeParse(documentIdParam);
  if (!parsed.success) return byteErrorResponse(404);

  const link = await findVisitorLink(slug);
  if (!link) return byteErrorResponse(404);

  const live = await liveVisitForLink(link);
  if (!live) return byteErrorResponse(404);

  const downloadRequested = new URL(request.url).searchParams.get("download") === "button";
  const reachable = await isDocumentReachableFromLink(link.id, parsed.data);
  if (!reachable) return byteErrorResponse(404);

  if (downloadRequested && !link.allowDownload) return byteErrorResponse(403);

  const found = await findVisitorDocument(parsed.data);
  if (!found) return byteErrorResponse(404);

  const response = await meterDemoDocumentResponse(
    await streamDocument({
      document: found,
      range: request.headers.get("range"),
      disposition: downloadRequested ? "attachment" : "inline",
    }),
    link.demo?.environmentId,
  );

  if (downloadRequested && (response.status === 200 || response.status === 206)) {
    await appendDownloadEvent(
      link.demo?.environmentId,
      live.visitId === null ? null : visitIdSchema.parse(live.visitId),
      parsed.data,
    );
  }

  return response;
}
