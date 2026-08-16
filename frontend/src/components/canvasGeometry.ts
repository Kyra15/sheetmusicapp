import type { Point, Stroke } from "../types";

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundingBoxOfStrokes(strokes: Stroke[]): Box | null {
  if (strokes.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function boxContains(box: Box, x: number, y: number, padding = 0) {
  return (
    x >= box.minX - padding &&
    x <= box.maxX + padding &&
    y >= box.minY - padding &&
    y <= box.maxY + padding
  );
}

/** Standard ray-casting point-in-polygon test. `polygon` is a list of
 * normalized {x,y} points; treated as implicitly closed. */
export function pointInPolygon(x: number, y: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// stroke counts as "lassoed" if at least half its points fall inside the loop
export function strokeMostlyInPolygon(stroke: Stroke, polygon: Point[]): boolean {
  if (polygon.length < 3 || stroke.points.length === 0) return false;
  let count = 0;
  for (const p of stroke.points) {
    if (pointInPolygon(p.x, p.y, polygon)){
      count++;
    }
  }
  return count / stroke.points.length >= 0.5;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

/** True if the point is within `radius` (normalized units) of any segment of the stroke. */
export function strokeNearPoint(stroke: Stroke, x: number, y: number, radius: number): boolean {
  if (stroke.points.length === 1) {
    return Math.hypot(stroke.points[0].x - x, stroke.points[0].y - y) <= radius;
  }
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1];
    const b = stroke.points[i];
    if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= radius) return true;
  }
  return false;
}

export function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
}
