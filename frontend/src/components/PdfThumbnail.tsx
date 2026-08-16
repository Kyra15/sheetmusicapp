import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PdfThumbnailProps {
  url: string;
  alt: string;
}

export function PdfThumbnail({ url, alt }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function renderPage() {
      try {
        setLoading(true);
        const pdf = await pdfjsLib.getDocument(url).promise;
        const page = await pdf.getPage(1);

        if (!active || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        const viewport = page.getViewport({ scale: 0.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        if (active) setLoading(false);
      } catch (err) {
        console.error("Error rendering PDF thumbnail:", err);
      }
    }

    renderPage();

    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {loading && <div className="library__card-placeholder">Loading preview…</div>}
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "auto",
          display: loading ? "none" : "block",
          objectFit: "contain",
        }}
        aria-label={alt}
      />
    </div>
  );
}