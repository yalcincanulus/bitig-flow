import { useCallback, useRef } from "react";

import { ViewerColumn } from "#/components/viewer-column";
import { DemoViewerBanner } from "#/components/demo-viewer-banner";
import { ViewerContentPage } from "#/components/viewer-content-page";
import { ViewerGatePage } from "#/components/viewer-gate-page";
import { PdfVisiblePageProvider } from "#/components/viewer-pdf-visible-page";
import { ViewerShell } from "#/components/viewer-shell";
import { useDwellPage } from "#/hooks/viewer-dwell-context";
import type { VisitorPage } from "#/server/viewer/visitor-gate";

function ViewerUnavailable({ page }: { page: Extract<VisitorPage, { status: "unavailable" }> }) {
  const copy = {
    expired: "This temporary content has expired.",
    terminating: "This temporary content is being removed.",
    policy_paused: "This temporary content is temporarily unavailable.",
    reported: "This temporary content is temporarily unavailable.",
    viewing_limited: "This temporary content has reached its viewing limit.",
  }[page.reason];
  return (
    <>
      <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">{copy}</h1>
      <p className="mt-3 text-base text-muted-foreground">Try again later or contact the sender.</p>
    </>
  );
}

export function ViewerPage({ page }: { page: VisitorPage }) {
  const visiblePageRef = useRef(1);
  const reportVisiblePage = useCallback((next: number) => {
    visiblePageRef.current = next;
  }, []);
  const documentId =
    page.status === "content" && page.kind !== "vault_index" ? page.documentId : null;

  useDwellPage(documentId, () =>
    page.status === "content" && page.kind === "pdf" ? visiblePageRef.current : 1,
  );

  const body =
    page.status === "unavailable" ? (
      <ViewerColumn>
        <ViewerUnavailable page={page} />
      </ViewerColumn>
    ) : page.status !== "content" ? (
      <ViewerColumn>
        <ViewerGatePage page={page} />
      </ViewerColumn>
    ) : page.kind === "pdf" ? (
      <PdfVisiblePageProvider onPage={reportVisiblePage}>
        <ViewerContentPage page={page} />
      </PdfVisiblePageProvider>
    ) : (
      <ViewerContentPage page={page} />
    );

  return (
    <ViewerShell>
      {page.demo ? <DemoViewerBanner slug={page.slug} expiresAt={page.demo.expiresAt} /> : null}
      {body}
    </ViewerShell>
  );
}
