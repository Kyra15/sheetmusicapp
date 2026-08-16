import { useState } from "react";
import { ScoreLibrary } from "./components/ScoreLibrary";
import { ScoreViewer } from "./components/ScoreViewer";
import type { Score } from "./types";
import "./styles/theme.css";
import "./styles/app.css";

export default function App() {
  const [activeScore, setActiveScore] = useState<Score | null>(null);

  return (
    <div className="app">
      {activeScore ? (
        <ScoreViewer
          score={activeScore}
          onBack={() => setActiveScore(null)}
          onScorePatched={setActiveScore}
        />
      ) : (
        <ScoreLibrary onOpenScore={setActiveScore} />
      )}
    </div>
  );
}
