import { useCallback, useEffect, useRef, useState, Suspense, lazy } from "react";
import { usePdfDocument } from "../hooks/usePdfDocument";
import { useAnnotations } from "../hooks/useAnnotations";
import { api } from "../api/client";
import { Toolbar } from "./Toolbar";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { AnnotationCanvas, type AnnotationCanvasHandle } from "./AnnotationCanvas";
import type { Score, Stroke, ToolId } from "../types";

// Playing Mode pulls in @mediapipe/tasks-vision (a multi-hundred-KB WASM
// face tracker) which most sessions -- just reading/annotating a score --
// never touch. Lazy-loading it keeps the initial page load light and only
// pays that cost the moment someone actually presses Play.
const PlayingMode = lazy(() => import("./PlayingMode").then((m) => ({ default: m.PlayingMode })));

interface ScoreViewerProps {
  score: Score;
  onBack: () => void;
  onScorePatched: (score: Score) => void;
}

export function ScoreViewer({ score, onBack, onScorePatched }: ScoreViewerProps) {
  const { pdf, numPages, loading, error } = usePdfDocument(api.scoreFileUrl(score.id));
  const { getStrokes, setStrokes, saveStatus, loaded: annotationsLoaded } = useAnnotations(score.id);

  const [pageNumber, setPageNumber] = useState(score.lastOpenedPage || 1);
  const [tool, setTool] = useState<ToolId>("pen");
  const [color, setColor] = useState("#1B1B1F");
  const [strokeWidth, setStrokeWidth] = useState(3.5);
  const [clipboard, setClipboard] = useState<Stroke[] | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [playingMode, setPlayingMode] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(score.title);
  const [titleSaveError, setTitleSaveError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const annotationRef = useRef<AnnotationCanvasHandle | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(Math.floor(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // report the current page's PDF's real page count back once known, and
  // clamp our page pointer to something valid for this document
  useEffect(() => {
    if (numPages > 0) {
      setPageNumber((p) => Math.min(Math.max(1, p), numPages));
      if (numPages !== score.pageCount) {
        api.updateScore(score.id, { pageCount: numPages }).then(onScorePatched).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages]);

  // persist "where the musician left off" might get rid of later
  useEffect(() => {
    const t = setTimeout(() => {
      api.updateScore(score.id, { lastOpenedPage: pageNumber }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [pageNumber, score.id]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const startEditingTitle = () => {
  setTitleDraft(score.title);
  setTitleSaveError(false);
  setIsEditingTitle(true);
};

const cancelEditingTitle = () => {
  setTitleDraft(score.title);
  setIsEditingTitle(false);
};

const commitTitleChange = async () => {
  const trimmed = titleDraft.trim();
  if (!trimmed || trimmed === score.title) {
    cancelEditingTitle();
    return;
  }
  setIsEditingTitle(false);
  setTitleSaveError(false);
  try {
    const updated = await api.updateScore(score.id, { title: trimmed });
    onScorePatched(updated);
  } catch (err) {
    console.error("Failed to rename score", err);
    setTitleSaveError(true);
  }
};

  const goNext = useCallback(() => setPageNumber((p) => (numPages ? Math.min(p + 1, numPages) : p)), [numPages]);
  const goPrev = useCallback(() => setPageNumber((p) => Math.max(p - 1, 1)), []);

  const currentStrokes = getStrokes(pageNumber);

  if (playingMode && pdf) {
    return (
      <Suspense fallback={<div className="score-viewer__playing-mode-loading">Starting Playing Mode…</div>}>
        <PlayingMode
          pdf={pdf}
          pageNumber={pageNumber}
          totalPages={numPages}
          strokes={currentStrokes}
          onNextPage={goNext}
          onPrevPage={goPrev}
          onExit={() => setPlayingMode(false)}
        />
      </Suspense>
    );
  }

  return (
    <div className="score-viewer">
      <header className="score-viewer__header">
        <button className="score-viewer__back" onClick={onBack}>
          &#8249; Library
        </button>
        <div className="score-viewer__title-block">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              className="score-viewer__title-input"
              value={titleDraft}
              maxLength={120}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitleChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitTitleChange(); }
                else if (e.key === "Escape") { e.preventDefault(); cancelEditingTitle(); }
              }}
            />
          ) : (
            <h1 onClick={startEditingTitle} title="Click to rename">{score.title}</h1>
          )}
          {titleSaveError && <p className="score-viewer__title-error">Couldn't save the new title.</p>}
        </div>
      </header>

      <Toolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        hasSelection={hasSelection}
        hasClipboard={!!clipboard && clipboard.length > 0}
        onCopy={() => annotationRef.current?.copySelection()}
        onPaste={() => annotationRef.current?.pasteClipboard()}
        onDeleteSelection={() => annotationRef.current?.deleteSelection()}
        saveStatus={saveStatus}
        onEnterPlayingMode={() => setPlayingMode(true)}
        pageLabel={numPages ? `${pageNumber} / ${numPages}` : "…"}
        onPrevPage={goPrev}
        onNextPage={goNext}
      />

      <div className="score-viewer__stage" ref={stageRef}>
        {loading && <p className="score-viewer__status">Loading score…</p>}
        {error && <p className="score-viewer__status score-viewer__status--error">{error}</p>}
        {pdf && containerWidth > 0 && (
          <div className="score-viewer__page" style={{ width: pageSize.width || containerWidth }}>
            <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} containerWidth={Math.min(containerWidth, 900)} onRendered={setPageSize} />
            {annotationsLoaded && pageSize.width > 0 && (
              <AnnotationCanvas
                ref={annotationRef}
                strokes={currentStrokes}
                onStrokesChange={(next) => setStrokes(pageNumber, next)}
                tool={tool}
                color={color}
                strokeWidth={strokeWidth}
                clipboard={clipboard}
                onClipboardChange={setClipboard}
                onSelectionChange={setHasSelection}
                width={pageSize.width}
                height={pageSize.height}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
