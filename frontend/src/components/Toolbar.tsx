import type { ToolId } from "../types";
import { PenIcon, HighlighterIcon, EraserIcon, SelectionIcon, type Icon } from "@phosphor-icons/react";

const TOOLS: { id: ToolId; label: string; icon: Icon}[] = [
  { id: "pen", label: "Pen", icon: PenIcon },
  { id: "highlight", label: "Highlight", icon: HighlighterIcon },
  { id: "eraser", label: "Eraser", icon: EraserIcon },
  { id: "lasso", label: "Lasso", icon: SelectionIcon },
];

const PEN_COLORS = ["#1B1B1F", "#C1440E", "#3E7CB1", "#2F6B4F"];
const PEN_WIDTHS = [2, 3.5, 6];

interface ToolbarProps {
  tool: ToolId;
  onToolChange: (tool: ToolId) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  hasSelection: boolean;
  hasClipboard: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onDeleteSelection: () => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onEnterPlayingMode: () => void;
  pageLabel: string;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function Toolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  hasSelection,
  hasClipboard,
  onCopy,
  onPaste,
  onDeleteSelection,
  saveStatus,
  onEnterPlayingMode,
  pageLabel,
  onPrevPage,
  onNextPage,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__group toolbar__group--tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`toolbar__tool ${tool === t.id ? "toolbar__tool--active" : ""}`}
            onClick={() => onToolChange(t.id)}
            aria-pressed={tool === t.id}
            title={t.label}
          >
            <span className="toolbar__glyph"> {<t.icon />} </span>
          </button>
        ))}
      </div>

      {tool === "pen" && (
        <div className="toolbar__group toolbar__group--pen-options">
          <div className="toolbar__swatches">
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                className={`toolbar__swatch ${color === c ? "toolbar__swatch--active" : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => onColorChange(c)}
                aria-label={`Pen color ${c}`}
              />
            ))}
          </div>
          <div className="toolbar__widths">
            {PEN_WIDTHS.map((w) => (
              <button
                key={w}
                className={`toolbar__width ${strokeWidth === w ? "toolbar__width--active" : ""}`}
                onClick={() => onStrokeWidthChange(w)}
                aria-label={`Line width ${w}`}
              >
                <span style={{ width: w * 2, height: w * 2 }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {tool === "lasso" && (
        <div className="toolbar__group toolbar__group--lasso-actions">
          <button className="toolbar__action" onClick={onCopy} disabled={!hasSelection}>
            Copy
          </button>
          <button className="toolbar__action" onClick={onPaste} disabled={!hasClipboard}>
            Paste
          </button>
          <button className="toolbar__action toolbar__action--danger" onClick={onDeleteSelection} disabled={!hasSelection}>
            Delete
          </button>
        </div>
      )}

      <div className="toolbar__group toolbar__group--nav">
        <button className="toolbar__nav-btn" onClick={onPrevPage} aria-label="Previous page">
          &#8249;
        </button>
        <span className="toolbar__page-label">{pageLabel}</span>
        <button className="toolbar__nav-btn" onClick={onNextPage} aria-label="Next page">
          &#8250;
        </button>
      </div>

      <div className="toolbar__group toolbar__group--right">
        <span className={`toolbar__save-status toolbar__save-status--${saveStatus}`}>
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Couldn't save"}
        </span>
        <button className="toolbar__play-btn" onClick={onEnterPlayingMode}>
          <span className="toolbar__glyph">&#9654;</span> Play
        </button>
      </div>
    </div>
  );
}
