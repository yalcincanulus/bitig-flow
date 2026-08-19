import { ViewerContentPage } from "#/components/viewer-content-page";
import { ViewerGatePage } from "#/components/viewer-gate-page";
import { useDwellPage } from "#/hooks/use-viewer-dwell";
import type { VisitorPage } from "#/server/viewer/visitor-gate";

export function ViewerPage({ page }: { page: VisitorPage }) {
  useDwellPage(
    page.status === "content" && page.kind !== "vault_index" ? page.documentId : null,
    () => 1,
  );
  if (page.status === "content") return <ViewerContentPage page={page} />;
  return <ViewerGatePage page={page} />;
}
