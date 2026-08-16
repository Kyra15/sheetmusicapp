import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Point, Stroke, ToolId } from "../types";
import {
  boundingBoxOfStrokes,
  boxContains,
  strokeMostlyInPolygon,
  strokeNearPoint,
  translateStroke,
  type Box,
} from "./canvasGeometry";

const ERASER_RADIUS = 0.02;
const PASTE_OFFSET = 0.02;

export interface AnnotationCanvasHandle {
  copySelection: () => void;
  pasteClipboard: () => void;
  deleteSelection: () => void;
  clearSelection: () => void;
}

interface AnnotationCanvasProps {
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  tool: ToolId;
  color: string;
  strokeWidth: number;
  clipboard: Stroke[] | null;
  onClipboardChange: (clipboard: Stroke[] | null) => void;
  onSelectionChange: (hasSelection: boolean) => void;
  width: number;
  height: number;
}

let idCounter = 0;
const nextId = () => `stroke_${Date.now()}_${idCounter++}`;

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(
  function AnnotationCanvas(
    { strokes, onStrokesChange, tool, color, strokeWidth, clipboard, onClipboardChange, onSelectionChange, width, height },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
    const [lassoPath, setLassoPath] = useState<Point[] | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const dragRef = useRef<{ start: Point; originals: Stroke[] } | null>(null);

    const selectionBox: Box | null = boundingBoxOfStrokes(strokes.filter((s) => selectedIds.has(s.id)));

    useEffect(() => {
      onSelectionChange(selectedIds.size > 0);
    }, [selectedIds, onSelectionChange]);

    // clear selection whenever the tool changes away from lasso
    useEffect(() => {
      if (tool !== "lasso") {
        setSelectedIds(new Set());
        setLassoPath(null);
      }
    }, [tool]);

    const toNormalizedPoint = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
          pressure: e.pressure > 0 ? e.pressure : 0.5,
        };
      },
      []
    );

    // rendering stuff
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const drawStroke = (stroke: Stroke, dx = 0, dy = 0) => {
        if (stroke.points.length === 0) return;
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (stroke.tool === "highlight") {
          ctx.globalAlpha = 0.35;
          ctx.globalCompositeOperation = "multiply";
        } else {
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.beginPath();
        const pts = stroke.points;
        ctx.moveTo((pts[0].x + dx) * width, (pts[0].y + dy) * height);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo((pts[i].x + dx) * width, (pts[i].y + dy) * height);
        }
        ctx.stroke();
        if (selectedIds.has(stroke.id)) {
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = 0.15;
          ctx.strokeStyle = "#3E7CB1";
          ctx.lineWidth = stroke.width + 6;
          ctx.beginPath();
          ctx.moveTo((pts[0].x + dx) * width, (pts[0].y + dy) * height);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo((pts[i].x + dx) * width, (pts[i].y + dy) * height);
          }
          ctx.stroke();
        }
        ctx.restore();
      };

      // highlights first so pen ink and page content stay legible on top
      for (const s of strokes) if (s.tool === "highlight" && !selectedIds.has(s.id)) drawStroke(s);
      for (const s of strokes) if (s.tool === "pen" && !selectedIds.has(s.id)) drawStroke(s);
      // selected strokes drawn last (on top) so the move-preview reads clearly
      for (const s of strokes) if (selectedIds.has(s.id)) drawStroke(s);

      if (currentStroke) drawStroke(currentStroke);

      if (lassoPath && lassoPath.length > 1) {
        ctx.save();
        ctx.strokeStyle = "#419ceb";
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lassoPath[0].x * width, lassoPath[0].y * height);
        for (let i = 1; i < lassoPath.length; i++) ctx.lineTo(lassoPath[i].x * width, lassoPath[i].y * height);
        ctx.stroke();
        ctx.restore();
      }

      if (selectionBox && tool === "lasso") {
        ctx.save();
        ctx.strokeStyle = "#419ceb";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        const pad = 0.01;
        ctx.strokeRect(
          (selectionBox.minX - pad) * width,
          (selectionBox.minY - pad) * height,
          (selectionBox.maxX - selectionBox.minX + pad * 2) * width,
          (selectionBox.maxY - selectionBox.minY + pad * 2) * height
        );
        ctx.restore();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strokes, currentStroke, lassoPath, selectedIds, width, height, tool]);


    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = toNormalizedPoint(e);
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

      if (tool === "pen" || tool === "highlight") {
        setCurrentStroke({
          id: nextId(),
          tool,
          color: tool === "highlight" ? "#FFD84D" : color,
          width: tool === "highlight" ? Math.max(strokeWidth * 5, 16) : strokeWidth,
          points: [p],
        });
        return;
      }

      if (tool === "eraser") {
        onStrokesChange(strokes.filter((s) => !strokeNearPoint(s, p.x, p.y, ERASER_RADIUS)));
        return;
      }

      if (tool === "lasso") {
        if (selectionBox && boxContains(selectionBox, p.x, p.y, 0.015)) {
          // start dragging the existing selection instead of a new lasso
          dragRef.current = { start: p, originals: strokes.filter((s) => selectedIds.has(s.id)) };
          return;
        }
        setSelectedIds(new Set());
        setLassoPath([p]);
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.buttons === 0 && tool !== "lasso") return;
      const p = toNormalizedPoint(e);

      if ((tool === "pen" || tool === "highlight") && currentStroke) {
        setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, p] });
        return;
      }

      if (tool === "eraser" && e.buttons !== 0) {
        const before = strokes.length;
        const remaining = strokes.filter((s) => !strokeNearPoint(s, p.x, p.y, ERASER_RADIUS));
        if (remaining.length !== before) onStrokesChange(remaining);
        return;
      }

      if (tool === "lasso") {
        if (dragRef.current) {
          const { start, originals } = dragRef.current;
          const dx = p.x - start.x;
          const dy = p.y - start.y;
          const movedIds = new Set(originals.map((s) => s.id));
          const moved = originals.map((s) => translateStroke(s, dx, dy));
          onStrokesChange([...strokes.filter((s) => !movedIds.has(s.id)), ...moved]);
          return;
        }
        if (lassoPath) setLassoPath([...lassoPath, p]);
      }
    };

    const handlePointerUp = () => {
      if (currentStroke) {
        if (currentStroke.points.length > 1) onStrokesChange([...strokes, currentStroke]);
        setCurrentStroke(null);
      }

      if (dragRef.current) {
        dragRef.current = null;
        return;
      }

      if (lassoPath) {
        if (lassoPath.length > 3) {
          const ids = new Set(strokes.filter((s) => strokeMostlyInPolygon(s, lassoPath)).map((s) => s.id));
          setSelectedIds(ids);
        }
        setLassoPath(null);
      }
    };

    useImperativeHandle(ref, () => ({
      copySelection: () => {
        const selected = strokes.filter((s) => selectedIds.has(s.id));
        if (selected.length > 0) onClipboardChange(selected);
      },
      pasteClipboard: () => {
        if (!clipboard || clipboard.length === 0) return;
        const pasted = clipboard.map((s) => ({
          ...s,
          id: nextId(),
          points: s.points.map((p) => ({ ...p, x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET })),
        }));
        onStrokesChange([...strokes, ...pasted]);
        setSelectedIds(new Set(pasted.map((s) => s.id)));
      },
      deleteSelection: () => {
        if (selectedIds.size === 0) return;
        onStrokesChange(strokes.filter((s) => !selectedIds.has(s.id)));
        setSelectedIds(new Set());
      },
      clearSelection: () => setSelectedIds(new Set()),
    }));

    return (
      <canvas
        ref={canvasRef}
        className={`annotation-canvas annotation-canvas--${tool}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    );
  }
);
