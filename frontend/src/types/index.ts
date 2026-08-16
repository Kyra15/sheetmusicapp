// Shared domain types. The `strokes` shape here must stay in sync with
// backend/models.py PageAnnotation.data -- the backend treats it as an
// opaque JSON blob, so this file is the single source of truth for its shape.

export type ToolId = "pen" | "eraser" | "lasso" | "highlight";

// set up for pen pressure
export interface Point {
  x: number;
  y: number;
  pressure: number;
}

// drawing in pdf space
export interface Stroke {
  id: string;
  tool: "pen" | "highlight";
  color: string;
  width: number;
  points: Point[];
  selected?: boolean;
}

// score object
export interface Score {
  id: number;
  title: string;
  originalFilename: string;
  pageCount: number;
  lastOpenedPage: number;
  createdAt: string;
  updatedAt: string;
}

// annotations
export interface PageAnnotation {
  pageNumber: number;
  strokes: Stroke[];
  updatedAt: string;
}

// saving
export type SaveStatus = "idle" | "saving" | "saved" | "error";
