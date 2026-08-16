import type { PageAnnotation, Score, Stroke } from "../types";

// In dev, Vite proxies /api -> the Flask server (see vite.config.ts), so we
// can just use relative paths and it works the same in prod once you build
// the frontend and serve it behind the same origin as the API (or set
// VITE_API_BASE_URL to point at a deployed Flask host).
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error ?? detail;
    } catch {
      /* response wasn't JSON, fall back to statusText */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listScores: () => request<Score[]>("/api/scores"),

  getScore: (id: number) => request<Score>(`/api/scores/${id}`),

  uploadScore: (file: File, meta: { title: string; pageCount: number }) => {
    const form = new FormData();
    form.append("file", file);
    form.append("title", meta.title);
    form.append("pageCount", String(meta.pageCount));
    return request<Score>("/api/scores", { method: "POST", body: form });
  },

  updateScore: (id: number, patch: Partial<Pick<Score, "title" | "lastOpenedPage" | "pageCount">>) =>
    request<Score>(`/api/scores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  deleteScore: (id: number) => request<void>(`/api/scores/${id}`, { method: "DELETE" }),

  scoreFileUrl: (id: number) => `${BASE_URL}/api/scores/${id}/file`,

  listAnnotations: (scoreId: number) => request<PageAnnotation[]>(`/api/scores/${scoreId}/annotations`),

  saveAnnotations: (scoreId: number, pageNumber: number, strokes: Stroke[]) =>
    request<PageAnnotation>(`/api/scores/${scoreId}/annotations/${pageNumber}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strokes }),
    }),

  clearAnnotations: (scoreId: number, pageNumber: number) =>
    request<void>(`/api/scores/${scoreId}/annotations/${pageNumber}`, { method: "DELETE" }),
};
