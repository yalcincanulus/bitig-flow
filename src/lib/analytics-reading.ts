import type { AnalyticsLinkPayload } from "#/lib/analytics-fold";
import type { DocumentKind } from "#/lib/document-kind";

type ReadingIdentity = AnalyticsLinkPayload["identities"][number];

export type ReadingDocument = Readonly<{ kind: DocumentKind; pageCount: number | null }>;

export type DocumentReading = Readonly<{
  views: number;
  completion: number | null;
  readersByPage: ReadonlyMap<number, number>;
}>;

export type IdentityReading = Readonly<{
  totalMs: number;
  downloads: number;
  completion: number | null;
  lastSeenAt: Date | string;
}>;

/**
 * The share of a PDF's pages that received Dwell in one View, capped at the whole document.
 *
 * Only a PDF has pages to finish. Markdown and images always report page 1, so a completion for
 * them would read 100% the moment any Dwell arrived and say nothing.
 */
export function viewCompletion(pagesRead: number, document: ReadingDocument | undefined) {
  if (document?.kind !== "pdf" || document.pageCount === null || document.pageCount <= 0) {
    return null;
  }
  return Math.min(pagesRead / document.pageCount, 1);
}

function average(values: ReadonlyArray<number>) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function identityKey(identity: Pick<ReadingIdentity, "email" | "visitorId">) {
  return identity.email ?? identity.visitorId;
}

/**
 * What the Views of one Link say about reading, rather than visiting: how far each PDF was read,
 * how many Views reached each page, and each Viewer identity's share of it.
 *
 * It reads the Visits the payload already carries, so a truncated range stays consistent with the
 * totals beside it.
 */
export function foldLinkReading(
  identities: ReadonlyArray<ReadingIdentity>,
  documents: ReadonlyMap<string, ReadingDocument>,
) {
  const byDocument = new Map<
    string,
    { views: number; completions: number[]; readersByPage: Map<number, number> }
  >();
  const byIdentity = new Map<string, IdentityReading>();
  const allCompletions: number[] = [];

  for (const identity of identities) {
    let totalMs = 0;
    let downloads = 0;
    let lastSeenAt: Date | string = identity.visits[0]?.lastSeenAt ?? new Date(0);
    const completions: number[] = [];

    for (const visit of identity.visits) {
      if (new Date(visit.lastSeenAt) > new Date(lastSeenAt)) lastSeenAt = visit.lastSeenAt;

      for (const view of visit.documents) {
        totalMs += view.totalMs;
        downloads += view.downloads;

        let reading = byDocument.get(view.documentId);
        if (reading === undefined) {
          reading = { views: 0, completions: [], readersByPage: new Map() };
          byDocument.set(view.documentId, reading);
        }
        reading.views += 1;
        for (const { page } of view.pages) {
          reading.readersByPage.set(page, (reading.readersByPage.get(page) ?? 0) + 1);
        }

        const completion = viewCompletion(view.pagesRead, documents.get(view.documentId));
        if (completion === null) continue;
        completions.push(completion);
        reading.completions.push(completion);
        allCompletions.push(completion);
      }
    }

    byIdentity.set(identityKey(identity), {
      totalMs,
      downloads,
      completion: average(completions),
      lastSeenAt,
    });
  }

  return {
    completion: average(allCompletions),
    documents: new Map<string, DocumentReading>(
      [...byDocument].map(([documentId, reading]) => [
        documentId,
        {
          views: reading.views,
          completion: average(reading.completions),
          readersByPage: reading.readersByPage,
        },
      ]),
    ),
    identities: byIdentity,
  };
}
