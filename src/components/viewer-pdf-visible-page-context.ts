import { createContext, useContext } from "react";

export const PdfVisiblePageContext = createContext<(page: number) => void>(() => {});

export function useReportPdfVisiblePage() {
  return useContext(PdfVisiblePageContext);
}
