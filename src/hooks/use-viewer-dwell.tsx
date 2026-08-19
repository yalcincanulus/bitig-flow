import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";

import { viewerBeaconUrl } from "#/lib/document-bytes";
import {
  createDwellAccumulator,
  startDwellCapture,
  type DwellBeaconBody,
  type DwellAccumulator,
} from "#/lib/dwell-accumulator";

type DwellPageSource = () => number;

const ViewerDwellContext = createContext<
  (documentId: string | null, pageSource: DwellPageSource) => void
>(() => {});

function sendViewerBeacon(slug: string, body: DwellBeaconBody, keepalive: boolean) {
  const url = viewerBeaconUrl(slug);
  const payload = JSON.stringify(body);
  if (keepalive) {
    return navigator.sendBeacon(url, new Blob([payload], { type: "text/plain" }));
  }
  void fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "text/plain" },
    body: payload,
  });
  return true;
}

export function ViewerDwell({ children }: { children: ReactNode }) {
  const params = useParams({ strict: false });
  const slug = typeof params.slug === "string" ? params.slug : undefined;
  const documentIdRef = useRef<string | null>(null);
  const pageSourceRef = useRef<DwellPageSource>(() => 1);
  const accumulatorRef = useRef<DwellAccumulator | null>(null);

  const setCurrent = useCallback((documentId: string | null, pageSource: DwellPageSource) => {
    documentIdRef.current = documentId;
    pageSourceRef.current = pageSource;
    accumulatorRef.current?.setCurrent(documentId, pageSource());
  }, []);

  useEffect(() => {
    if (!slug) return;

    const accumulator = createDwellAccumulator({
      send: (body, { keepalive }) => sendViewerBeacon(slug, body, keepalive),
      now: () => Date.now(),
    });
    accumulatorRef.current = accumulator;
    accumulator.setCurrent(documentIdRef.current, pageSourceRef.current());

    const stop = startDwellCapture({
      accumulator,
      currentDocument: () => documentIdRef.current,
      currentPage: () => pageSourceRef.current(),
      setInterval: (handler, ms) => window.setInterval(handler, ms),
      clearInterval: (id) => window.clearInterval(id),
      addVisibilityListener: (handler) => document.addEventListener("visibilitychange", handler),
      removeVisibilityListener: (handler) =>
        document.removeEventListener("visibilitychange", handler),
      hidden: () => document.hidden,
    });

    return () => {
      stop();
      accumulatorRef.current = null;
    };
  }, [slug]);

  return <ViewerDwellContext.Provider value={setCurrent}>{children}</ViewerDwellContext.Provider>;
}

export function useDwellPage(documentId: string | null, pageSource: DwellPageSource) {
  const setCurrent = useContext(ViewerDwellContext);
  const pageSourceRef = useRef(pageSource);
  pageSourceRef.current = pageSource;

  useEffect(() => {
    setCurrent(documentId, () => pageSourceRef.current());
  }, [documentId, setCurrent]);
}
