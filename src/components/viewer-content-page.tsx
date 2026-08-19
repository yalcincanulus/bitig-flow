import { lazy, Suspense } from "react";

import { ViewerSenderLine } from "#/components/viewer-sender-line";
import type { VisitorContentPage } from "#/server/viewer/visitor-gate";

const ViewerPdf = lazy(() => import("#/components/viewer-pdf"));

export function ViewerContentPage({ page }: { page: VisitorContentPage }) {
  return (
    <>
      <ViewerSenderLine senderName={page.senderName} organizationName={page.organizationName} />
      <h1 className="text-2xl leading-snug font-medium tracking-tight text-balance">
        {page.title}
      </h1>
      {page.kind === "markdown" ? (
        <div className="mt-6" dangerouslySetInnerHTML={{ __html: page.html }} />
      ) : null}
      {page.kind === "pdf" ? (
        <Suspense fallback={null}>
          <ViewerPdf pageCount={page.pageCount} />
        </Suspense>
      ) : null}
      {page.kind === "vault" && page.emptyVault ? (
        <p className="mt-3 text-base text-muted-foreground">There's nothing in here yet.</p>
      ) : null}
    </>
  );
}
