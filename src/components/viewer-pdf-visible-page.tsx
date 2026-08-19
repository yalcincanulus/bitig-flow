import { createContext, useContext, type ReactNode } from "react";

const PdfVisiblePageContext = createContext<(page: number) => void>(() => {});

export function PdfVisiblePageProvider({
  onPage,
  children,
}: {
  onPage: (page: number) => void;
  children: ReactNode;
}) {
  return <PdfVisiblePageContext.Provider value={onPage}>{children}</PdfVisiblePageContext.Provider>;
}

export function useReportPdfVisiblePage() {
  return useContext(PdfVisiblePageContext);
}
