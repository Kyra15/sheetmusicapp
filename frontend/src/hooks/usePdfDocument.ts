import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
// Vite's ?url import gives us a fingerprinted URL to the worker file it
// bundles, which is the recommended way to wire up pdf.js's worker in a
// Vite app (avoids manually copying the file into /public).
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PdfDocumentState {
  pdf: PDFDocumentProxy | null;
  numPages: number;
  loading: boolean;
  error: string | null;
}

export function usePdfDocument(url: string | null): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({
    pdf: null,
    numPages: 0,
    loading: !!url,
    error: null,
  });

  useEffect(() => {
    if (!url) {
      setState({ pdf: null, numPages: 0, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const loadingTask = pdfjsLib.getDocument(url);
    loadingTask.promise
      .then((pdf) => {
        if (cancelled) return;
        setState({ pdf, numPages: pdf.numPages, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load PDF", err);
        setState({ pdf: null, numPages: 0, loading: false, error: "Couldn't load this score's PDF." });
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [url]);

  return state;
}
