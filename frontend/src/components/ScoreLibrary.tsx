import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Score } from "../types";
import { PdfThumbnail } from "./PdfThumbnail";

interface ScoreLibraryProps {
  onOpenScore: (score: Score) => void;
}

export function ScoreLibrary({ onOpenScore }: ScoreLibraryProps) {
  const [scores, setScores] = useState<Score[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => api.listScores().then(setScores);

  useEffect(() => {
    refresh();
  }, []);

  const handleFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const guessedTitle = file.name.replace(/\.pdf$/i, "");
      const created = await api.uploadScore(file, { title: guessedTitle, pageCount: 0 });
      await refresh();
      onOpenScore(created);
    } catch (err) {
      console.error(err);
      setUploadError("Couldn't upload that file. Make sure it's a PDF.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this score and all its markings? This can't be undone.")) return;
    await api.deleteScore(id);
    refresh();
  };

  return (
    <div className="library">
      <header className="library__header">
        <div>
          <h1>Mordent</h1>
        </div>
        <label className="library__upload-btn">
          {uploading ? "Uploading…" : "+ Add score"}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            hidden
            disabled={uploading}
            onChange={(e) => handleFileChosen(e.target.files?.[0])}
          />
        </label>
      </header>

      {uploadError && <p className="library__error">{uploadError}</p>}

      {scores === null && <p className="library__status">Loading your library…</p>}

      {scores?.length === 0 && (
        <div className="library__empty">
          <p>No scores yet.</p>
          <p>Upload a PDF of a piece to start marking it up.</p>
        </div>
      )}

      <ul className="library__grid">
        {scores?.map((s) => (
          <li key={s.id} className="library__card" onClick={() => onOpenScore(s)}>
            <div className="library__card-thumb">
              {/* <span className="library__card-glyph">&#119070;</span> */}
              <PdfThumbnail url={api.scoreFileUrl(s.id)} alt={s.title} />
            </div>
            <div className="library__card-body">
              <h2>{s.title}</h2>
              <p className="library__card-meta">
                {s.pageCount > 0 ? `${s.pageCount} page${s.pageCount === 1 ? "" : "s"}` : "Processing…"}
              </p>
            </div>
            <button className="library__card-delete" onClick={(e) => handleDelete(e, s.id)} aria-label={`Delete ${s.title}`}>
              &#10005;
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
