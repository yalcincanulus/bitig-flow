"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";

import { Skeleton } from "#/components/ui/skeleton";
import { viewerPaperSurface } from "#/components/viewer-paper";
import { useReportPdfVisiblePage } from "#/components/viewer-pdf-visible-page-context";
import { currentPageFromIntersections, renderWindowPages } from "#/lib/pdf-page-window";
import { cn } from "#/lib/utils";

import "./viewer-pdf.css";

const letterAspect = 11 / 8.5;
const observerThresholds = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

type PdfEngine = typeof import("#/components/viewer-pdf-engine");

export default function ViewerPdf({
  bytesUrl,
  pageCount,
}: {
  bytesUrl: string;
  pageCount: number | null;
}) {
  const reportVisiblePage = useReportPdfVisiblePage();
  const containerRef = useRef<HTMLDivElement>(null);
  const ratiosRef = useRef(new Map<number, number>());
  const [width, setWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [engine, setEngine] = useState<PdfEngine | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageAspect, setPageAspect] = useState(letterAspect);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const readWidth = () => {
      const next = Math.floor(node.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    readWidth();

    const observer = new ResizeObserver(readWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    let loadingTask: PDFDocumentLoadingTask | undefined;

    void (async () => {
      try {
        const loaded = await import("#/components/viewer-pdf-engine");
        const response = await fetch(bytesUrl, {
          credentials: "same-origin",
          signal: abort.signal,
        });
        if (!response.ok) throw new Error("bytes");
        const data = await response.arrayBuffer();
        const task = loaded.getDocument({
          data,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
        });
        loadingTask = task;
        const documentProxy = await task.promise;
        if (abort.signal.aborted) return;
        const first = await documentProxy.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        setEngine(loaded);
        setPageAspect(viewport.height / viewport.width);
        setPdf(documentProxy);
      } catch (error) {
        if (abort.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      }
    })();

    return () => {
      abort.abort();
      void loadingTask?.destroy();
    };
  }, [bytesUrl]);

  const totalPages = pdf?.numPages ?? pageCount ?? 0;

  useEffect(() => {
    const root = containerRef.current;
    if (!root || totalPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (!Number.isFinite(page)) continue;
          ratiosRef.current.set(page, entry.intersectionRatio);
        }
        const next = currentPageFromIntersections(
          [...ratiosRef.current.entries()].map(([observedPage, ratio]) => ({
            page: observedPage,
            ratio,
          })),
        );
        if (next === undefined) {
          reportVisiblePage(0);
          return;
        }
        setCurrentPage(next);
        reportVisiblePage(next);
      },
      { threshold: observerThresholds },
    );

    for (const node of root.querySelectorAll("[data-page]")) observer.observe(node);
    return () => observer.disconnect();
  }, [totalPages, pdf, width, reportVisiblePage]);

  const pageHeight = width > 0 ? width * pageAspect : 0;
  const windowPages = new Set(renderWindowPages(currentPage, totalPages));

  if (failed) {
    return <p className="mt-6 text-base text-muted-foreground">This document couldn't be shown.</p>;
  }

  return (
    <div ref={containerRef} className="mt-6 flex flex-col items-center gap-6">
      {totalPages === 0 || width === 0 ? (
        <Skeleton className="h-[32rem] w-full rounded-lg" />
      ) : null}
      {Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        return (
          <PdfPageSlot
            key={page}
            page={page}
            pdf={pdf}
            engine={engine}
            width={width}
            height={pageHeight}
            inWindow={windowPages.has(page)}
          />
        );
      })}
    </div>
  );
}

function PdfPageSlot({
  page,
  pdf,
  engine,
  width,
  height,
  inWindow,
}: {
  page: number;
  pdf: PDFDocumentProxy | null;
  engine: PdfEngine | null;
  width: number;
  height: number;
  inWindow: boolean;
}) {
  if (width === 0 || height === 0) return null;

  const style: CSSProperties = { width, height };

  return (
    <article
      data-page={page}
      className={cn(viewerPaperSurface, "relative overflow-hidden")}
      style={style}
      aria-label={`Page ${page}`}
    >
      {inWindow && pdf && engine ? (
        <PdfPageCanvas pageNumber={page} pdf={pdf} engine={engine} width={width} />
      ) : null}
    </article>
  );
}

function PdfPageCanvas({
  pageNumber,
  pdf,
  engine,
  width,
}: {
  pageNumber: number;
  pdf: PDFDocumentProxy;
  engine: PdfEngine;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayerDiv = textLayerRef.current;
    if (!canvas || !textLayerDiv) return;

    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: InstanceType<PdfEngine["TextLayer"]> | undefined;
    let pageProxy: PDFPageProxy | undefined;

    void (async () => {
      try {
        pageProxy = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = pageProxy.getViewport({ scale: 1 });
        const scale = width / base.width;
        const viewport = pageProxy.getViewport({ scale });
        const outputScale = new engine.OutputScale();
        canvas.width = Math.floor(viewport.width * outputScale.sx);
        canvas.height = Math.floor(viewport.height * outputScale.sy);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const transform = outputScale.scaled
          ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
          : undefined;
        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) throw new Error("canvas");
        renderTask = pageProxy.render({
          canvas: null,
          canvasContext,
          viewport,
          transform,
        });
        await renderTask.promise;
        if (cancelled) return;
        textLayerDiv.replaceChildren();
        textLayerDiv.style.setProperty("--total-scale-factor", String(scale));
        textLayer = new engine.TextLayer({
          textContentSource: pageProxy.streamTextContent(),
          container: textLayerDiv,
          viewport,
        });
        await textLayer.render();
      } catch (error) {
        if (cancelled) return;
        if (error instanceof engine.RenderingCancelledException) return;
        setRenderFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      pageProxy?.cleanup();
    };
  }, [engine, pageNumber, pdf, width]);

  if (renderFailed) {
    return <p className="p-4 text-base text-muted-foreground">This page couldn't be shown.</p>;
  }

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div ref={textLayerRef} className="textLayer" />
    </>
  );
}
