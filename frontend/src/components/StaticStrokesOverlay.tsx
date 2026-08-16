import { useEffect, useRef } from "react";
import type { Stroke } from "../types";

interface StaticStrokesOverlayProps {
  strokes: Stroke[];
  width: number;
  height: number;
}

/** Renders committed strokes with no pointer handling at all -- used in
 * Playing Mode where the musician's markings should stay visible but
 * nothing on the page should be editable. */
export function StaticStrokesOverlay({ strokes, width, height }: StaticStrokesOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    const draw = (stroke: Stroke) => {
      if (stroke.points.length === 0) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (stroke.tool === "highlight") {
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = "multiply";
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
      }
      ctx.stroke();
      ctx.restore();
    };

    for (const s of strokes) if (s.tool === "highlight") draw(s);
    for (const s of strokes) if (s.tool === "pen") draw(s);
  }, [strokes, width, height]);

  return <canvas ref={canvasRef} className="static-strokes-overlay" />;
}
