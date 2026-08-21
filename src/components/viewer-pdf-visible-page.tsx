import type { ReactNode } from "react";

import { PdfVisiblePageContext } from "#/components/viewer-pdf-visible-page-context";

export function PdfVisiblePageProvider({
  onPage,
  children,
}: {
  onPage: (page: number) => void;
  children: ReactNode;
}) {
  return <PdfVisiblePageContext.Provider value={onPage}>{children}</PdfVisiblePageContext.Provider>;
}
