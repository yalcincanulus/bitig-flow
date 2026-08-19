import { ViewerContentPage } from "#/components/viewer-content-page";
import { ViewerGatePage } from "#/components/viewer-gate-page";
import type { VisitorPage } from "#/server/viewer/visitor-gate";

export function ViewerPage({ page }: { page: VisitorPage }) {
  if (page.status === "content") return <ViewerContentPage page={page} />;
  return <ViewerGatePage page={page} />;
}
