import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** available width in CSS px to fit the page into */
  containerWidth: number;
  onRendered: (size: { width: number; height: number }) => void;
}

export function PdfPageCanvas({ pdf, pageNumber, containerWidth, onRendered }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<ReturnType<import("pdfjs-dist").PDFPageProxy["render"]> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderTaskRef.current?.cancel();
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
        if (!cancelled) onRendered({ width: viewport.width, height: viewport.height });
      } catch (err) {
        // RenderingCancelledException is expected when we re-render fast
        // (e.g. rapid page flips in Playing Mode); anything else, log it.
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) {
          console.error("PDF render failed", err);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, pageNumber, containerWidth, onRendered]);

  return <canvas ref={canvasRef} className="pdf-page-canvas" />;
}
