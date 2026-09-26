import { ChartNoAxesCombinedIcon, ChevronRightIcon, DownloadIcon, UserIcon } from "lucide-react";

import { CompletionMeter, PageStrip } from "#/components/analytics-reading";
import { DocumentKindIcon } from "#/components/document-kind";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { dwellPagesWithZeros, type AnalyticsLinkPayload } from "#/lib/analytics-fold";
import {
  analyticsNumberFormat,
  formatAnalyticsMoment,
  formatAnalyticsSpan,
  formatDownloadCount,
  formatTotalTime,
  unidentifiedVisitorLabel,
} from "#/lib/analytics-format";
import { identityKey, viewCompletion, type IdentityReading } from "#/lib/analytics-reading";
import type { DocumentKind } from "#/lib/document-kind";

type TimelineIdentity = AnalyticsLinkPayload["identities"][number];
type TimelineVisit = TimelineIdentity["visits"][number];
type TimelineDocument = TimelineVisit["documents"][number];
type DocumentRecord = {
  title: string;
  kind: DocumentKind;
  pageCount: number | null;
};

function plural(count: number, one: string, many: string) {
  return `${analyticsNumberFormat.format(count)} ${count === 1 ? one : many}`;
}

export function AnalyticsVisitTimeline({
  identities,
  documents,
  readings,
}: Readonly<{
  identities: AnalyticsLinkPayload["identities"];
  documents: ReadonlyMap<string, DocumentRecord>;
  readings: ReadonlyMap<string, IdentityReading>;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Visitors</CardTitle>
        <CardDescription>
          Most recent first. Open a visitor to see each visit. Visits with and without an email
          address can appear as separate visitors.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {identities.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartNoAxesCombinedIcon />
              </EmptyMedia>
              <EmptyTitle>No visits in this range</EmptyTitle>
              <EmptyDescription>No visits in the selected date range.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="-mx-2 flex flex-col divide-y divide-border">
            {identities.map((identity) => (
              <IdentityRow
                key={identityKey(identity)}
                identity={identity}
                reading={readings.get(identityKey(identity))}
                documents={documents}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function IdentityRow({
  identity,
  reading,
  documents,
}: Readonly<{
  identity: TimelineIdentity;
  reading: IdentityReading | undefined;
  documents: ReadonlyMap<string, DocumentRecord>;
}>) {
  const lastSeen = reading ? formatAnalyticsMoment(reading.lastSeenAt) : null;

  return (
    <li>
      <Collapsible>
        <CollapsibleTrigger className="group/identity flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Avatar size="sm">
            <AvatarFallback className="text-[0.625rem] uppercase">
              {identity.email !== null ? (
                identity.email.slice(0, 1)
              ) : (
                <UserIcon className="size-3.5" />
              )}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex min-w-0 flex-1 basis-48 flex-col">
              <IdentityLabel identity={identity} />
              <span className="text-[0.6875rem] text-muted-foreground">
                {plural(identity.visitCount, "visit", "visits")}
                {lastSeen ? (
                  <>
                    {" · last seen "}
                    <time dateTime={lastSeen.dateTime}>{lastSeen.label}</time>
                  </>
                ) : null}
              </span>
            </div>
            {reading ? (
              <div className="flex items-center gap-3 text-xs whitespace-nowrap tabular-nums sm:gap-4">
                {reading.downloads > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 text-muted-foreground"
                    aria-label={plural(reading.downloads, "download", "downloads")}
                  >
                    <DownloadIcon className="size-3" />
                    {analyticsNumberFormat.format(reading.downloads)}
                  </span>
                ) : null}
                <span className="sm:w-14 sm:text-right">{formatTotalTime(reading.totalMs)}</span>
                {reading.completion !== null ? (
                  <CompletionMeter value={reading.completion} label="Average completion" />
                ) : (
                  <span className="hidden w-[6.5rem] sm:block" />
                )}
              </div>
            ) : null}
          </div>
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/identity:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="flex flex-col gap-2 pb-3 pl-2 sm:pl-11">
            {identity.visits.map((visit) => (
              <VisitBlock key={visit.visitId} visit={visit} documents={documents} />
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function IdentityLabel({ identity }: Readonly<{ identity: TimelineIdentity }>) {
  if (identity.email !== null) {
    return <span className="truncate text-sm font-medium">{identity.email}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span />} className="w-fit font-mono text-sm font-medium">
        {unidentifiedVisitorLabel(identity.visitorId)}
      </TooltipTrigger>
      <TooltipContent>{identity.visitorId}</TooltipContent>
    </Tooltip>
  );
}

function VisitBlock({
  visit,
  documents,
}: Readonly<{
  visit: TimelineVisit;
  documents: ReadonlyMap<string, DocumentRecord>;
}>) {
  const started = formatAnalyticsMoment(visit.startedAt);

  return (
    <li className="rounded-md bg-muted/40 px-3 py-2.5">
      <p className="mb-1.5 text-[0.6875rem] text-muted-foreground">
        <time dateTime={started.dateTime}>
          {formatAnalyticsSpan(visit.startedAt, visit.lastSeenAt)}
        </time>
      </p>
      {visit.documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">Opened the link but no document.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visit.documents.map((row, index) => (
            <DocumentViewRow
              key={`${visit.visitId}:${row.documentId}:${index}`}
              row={row}
              document={documents.get(row.documentId)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function DocumentViewRow({
  row,
  document,
}: Readonly<{
  row: TimelineDocument;
  document: DocumentRecord | undefined;
}>) {
  const showPages = document?.kind === "pdf";
  const pages = showPages ? dwellPagesWithZeros(document.pageCount ?? null, row.pages) : [];
  const completion = viewCompletion(row.pagesRead, document);
  const downloads = formatDownloadCount(row.downloads);

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex min-w-0 flex-1 basis-40 items-center gap-2 text-xs">
          {document ? (
            <DocumentKindIcon
              kind={document.kind}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          ) : null}
          <span className="truncate">{document?.title || "Document"}</span>
        </span>
        <span className="flex items-center gap-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:gap-4">
          {downloads ? (
            <span className="inline-flex items-center gap-1" aria-label={`Downloads: ${downloads}`}>
              <DownloadIcon className="size-3" />
              {downloads}
            </span>
          ) : null}
          {showPages && document.pageCount !== null ? (
            <span>
              {analyticsNumberFormat.format(row.pagesRead)}/
              {analyticsNumberFormat.format(document.pageCount)} pages
            </span>
          ) : null}
          <span className="text-foreground sm:w-14 sm:text-right">
            {formatTotalTime(row.totalMs)}
          </span>
          {completion !== null ? (
            <CompletionMeter value={completion} />
          ) : (
            <span className="hidden w-[6.5rem] sm:block" />
          )}
        </span>
      </div>
      {showPages && pages.length > 0 ? <PageStrip pages={pages} className="pl-5.5" /> : null}
    </li>
  );
}
