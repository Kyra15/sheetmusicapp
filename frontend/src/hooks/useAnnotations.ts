import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { SaveStatus, Stroke } from "../types";

const AUTOSAVE_DELAY_MS = 900;

/**
 * Owns every page's strokes for one score, keeps them in sync with the
 * backend, and debounces writes so a fast pen doesn't fire a PUT per point.
 */
export function useAnnotations(scoreId: number) {
  const [pages, setPages] = useState<Record<number, Stroke[]>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [loaded, setLoaded] = useState(false);
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    api.listAnnotations(scoreId).then((rows) => {
      if (cancelled) return;
      const next: Record<number, Stroke[]> = {};
      for (const row of rows) next[row.pageNumber] = row.strokes;
      setPages(next);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [scoreId]);

  const getStrokes = useCallback((page: number) => pages[page] ?? [], [pages]);

  const setStrokes = useCallback(
    (page: number, strokes: Stroke[]) => {
      setPages((prev) => ({ ...prev, [page]: strokes }));

      clearTimeout(saveTimers.current[page]);
      saveTimers.current[page] = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await api.saveAnnotations(scoreId, page, strokes);
          setSaveStatus("saved");
        } catch (err) {
          console.error("Failed to save annotations", err);
          setSaveStatus("error");
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [scoreId]
  );

  // flush any pending debounced saves on unmount (e.g. navigating away fast)
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  return { getStrokes, setStrokes, saveStatus, loaded };
}
