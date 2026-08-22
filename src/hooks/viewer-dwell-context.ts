import { createContext, useContext, useEffect, useRef } from "react";

export type DwellPageSource = () => number;

export const ViewerDwellContext = createContext<
  (documentId: string | null, pageSource: DwellPageSource) => void
>(() => {});

export function useDwellPage(documentId: string | null, pageSource: DwellPageSource) {
  const setCurrent = useContext(ViewerDwellContext);
  const pageSourceRef = useRef(pageSource);

  // The registration below reads this lazily, so refreshing it after commit is soon enough.
  useEffect(() => {
    pageSourceRef.current = pageSource;
  });

  useEffect(() => {
    setCurrent(documentId, () => pageSourceRef.current());
  }, [documentId, setCurrent]);
}
