import { Download, FileArchive, FolderOpen, RotateCcw } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef } from "react";
import type { ReportState } from "../../hooks/useWrappedReport";
import { formatCount } from "../../lib/report/format";

interface StatusBarProps {
  state: ReportState;
  onFiles: (files: File[]) => void;
  onDownload: () => void;
  onReset: () => void;
}

export function StatusBar({ state, onFiles, onDownload, onReset }: StatusBarProps) {
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const isReading = state.status === "reading";

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    onFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  return (
    <section className={`status-band status-${state.status}`} aria-live="polite">
      <div className="status-copy">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <strong>{statusText(state)}</strong>
          {state.status === "error" ? <p>{state.message}</p> : null}
        </div>
      </div>
      <div className="actions">
        <button type="button" onClick={() => zipInputRef.current?.click()} disabled={isReading}>
          <FileArchive size={17} />
          Choose ZIP
        </button>
        <button type="button" onClick={() => folderInputRef.current?.click()} disabled={isReading}>
          <FolderOpen size={17} />
          Choose folder
        </button>
        {state.status === "done" ? (
          <button type="button" onClick={onDownload}>
            <Download size={17} />
            Download data
          </button>
        ) : null}
        <button type="button" onClick={onReset} disabled={state.status === "idle"}>
          <RotateCcw size={17} />
          Reset
        </button>
      </div>
      <input
        ref={zipInputRef}
        className="hidden-input"
        type="file"
        accept=".zip,application/zip"
        onChange={onFilesSelected}
      />
      <input
        ref={folderInputRef}
        className="hidden-input"
        type="file"
        multiple
        onChange={onFilesSelected}
        {...{ webkitdirectory: "true" }}
      />
    </section>
  );
}

function statusText(state: ReportState): string {
  switch (state.status) {
    case "idle":
      return "Choose a ChatGPT export ZIP or folder.";
    case "reading":
      return `Reading ${formatCount(state.fileCount)} ${state.fileCount === 1 ? "file" : "files"} locally...`;
    case "done":
      return "Your local report is ready.";
    case "error":
      return "Could not parse this export.";
  }
}
