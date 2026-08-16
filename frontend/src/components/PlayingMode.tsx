import { useCallback, useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { StaticStrokesOverlay } from "./StaticStrokesOverlay";
import { useNodDetection } from "../hooks/useNodDetection";
import type { Stroke } from "../types";

interface PlayingModeProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  totalPages: number;
  strokes: Stroke[];
  onNextPage: () => void;
  onPrevPage: () => void;
  onExit: () => void;
}

const STATUS_COPY: Record<string, string> = {
  idle: "Starting…",
  "requesting-camera": "Waiting for camera permission…",
  "loading-model": "Loading face tracking…",
  running: "Watching for a nod",
  "no-face": "Can't see your face",
  error: "Camera unavailable",
};

export function PlayingMode({ pdf, pageNumber, totalPages, strokes, onNextPage, onPrevPage, onExit }: PlayingModeProps) {
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(() => Math.min(window.innerWidth, 900));
  const [sensitivity, setSensitivity] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [flashConfirm, setFlashConfirm] = useState(false);

  useEffect(() => {
    const onResize = () => setContainerWidth(Math.min(window.innerWidth, 900));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleNod = useCallback(() => {
    setFlashConfirm(true);
    setTimeout(() => setFlashConfirm(false), 350);
    onNextPage();
  }, [onNextPage]);

  const { videoRef, status, errorMessage, gestureProgress } = useNodDetection({
    sensitivity,
    onNod: handleNod,
    active: true,
  });

  // esc exits playing mode as a keyboard-accessible fallback
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (e.key === "ArrowRight") onNextPage();
      if (e.key === "ArrowLeft") onPrevPage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, onNextPage, onPrevPage]);

  const ringPct = Math.round(Math.min(1, Math.max(0, gestureProgress)) * 100);

  return (
    <div className="playing-mode">
      <video ref={videoRef} className="playing-mode__video-hidden" muted playsInline />

      <div className="playing-mode__page-stage" style={{ width: containerWidth }}>
        <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} containerWidth={containerWidth} onRendered={setPageSize} />
        {pageSize.width > 0 && <StaticStrokesOverlay strokes={strokes} width={pageSize.width} height={pageSize.height} />}
      </div>

      {/* tap to also flip pages */}
      <button className="playing-mode__tap-zone playing-mode__tap-zone--left" onClick={onPrevPage} aria-label="Previous page" />
      <button className="playing-mode__tap-zone playing-mode__tap-zone--right" onClick={onNextPage} aria-label="Next page" />

      <div className="playing-mode__hud playing-mode__hud--top">
        <button className="playing-mode__exit" onClick={onExit}>
          &#10005; Done
        </button>
        <span className="playing-mode__page-counter">
          Page {pageNumber} / {totalPages}
        </span>
        <button className="playing-mode__settings-toggle" onClick={() => setShowSettings((v) => !v)} aria-label="Nod sensitivity settings">
          &#9881;
        </button>
      </div>

      {showSettings && (
        <div className="playing-mode__settings">
          <label>
            Nod sensitivity
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            />
          </label>
          <p className="playing-mode__settings-hint">
            Higher sensitivity triggers a page flip with a smaller nod, but may misfire if you move around while playing.
          </p>
        </div>
      )}

      <div className={`playing-mode__hud playing-mode__hud--bottom ${flashConfirm ? "playing-mode__hud--flash" : ""}`}>
        <div className={`playing-mode__ring playing-mode__ring--${status}`} style={{ ["--progress" as string]: `${ringPct}%` }}>
          <span className="playing-mode__ring-glyph">&#9835;</span>
        </div>
        <span className="playing-mode__status-text">{STATUS_COPY[status] ?? status}</span>
        {errorMessage && <span className="playing-mode__error">{errorMessage}</span>}
      </div>
    </div>
  );
}
