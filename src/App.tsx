import { Download, FileArchive, FileJson, FolderOpen, RotateCcw } from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import type { WrappedData } from "./types/wrapped";
import type { WorkerResponse } from "./workers/wrappedWorker";

type Status = "idle" | "reading" | "done" | "error";

function App() {
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [statusText, setStatusText] = useState("Choose a ChatGPT export zip or folder.");
  const [data, setData] = useState<WrappedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overview = data?.overview as Record<string, unknown> | undefined;
  const preview = useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);

  function run(files: File[]) {
    if (files.length === 0) {
      return;
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./workers/wrappedWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setStatus("reading");
    setStatusText(`Reading ${files.length.toLocaleString()} file${files.length > 1 ? "s" : ""} locally...`);
    setData(null);
    setError(null);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === "done") {
        setData(event.data.data);
        setStatus("done");
        setStatusText("Wrapped data is ready.");
        worker.terminate();
        workerRef.current = null;
      } else {
        setError(event.data.message);
        setStatus("error");
        setStatusText("Could not parse this export.");
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (event) => {
      setError(event.message);
      setStatus("error");
      setStatusText("The worker stopped unexpectedly.");
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({ files });
  }

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    run(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function reset() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setData(null);
    setError(null);
    setStatus("idle");
    setStatusText("Choose a ChatGPT export zip or folder.");
  }

  function downloadJson() {
    if (!data) {
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "wrapped-data.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="intro-band">
        <div>
          <p className="eyebrow">ChatGPT Wrapped</p>
          <h1>Local export analysis</h1>
          <p className="lede">Parse an official ChatGPT export in your browser and generate report-ready wrapped data.</p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => zipInputRef.current?.click()} disabled={status === "reading"}>
            <FileArchive size={18} />
            Zip
          </button>
          <button type="button" onClick={() => folderInputRef.current?.click()} disabled={status === "reading"}>
            <FolderOpen size={18} />
            Folder
          </button>
          <button type="button" onClick={reset} disabled={status === "reading" && !data}>
            <RotateCcw size={18} />
            Reset
          </button>
        </div>
        <input ref={zipInputRef} className="hidden-input" type="file" accept=".zip,application/zip" onChange={onFilesSelected} />
        <input
          ref={folderInputRef}
          className="hidden-input"
          type="file"
          multiple
          onChange={onFilesSelected}
          {...{ webkitdirectory: "true" }}
        />
      </section>

      <section className={`status-band status-${status}`}>
        <div>
          <strong>{statusText}</strong>
          {error ? <p>{error}</p> : null}
        </div>
        <button type="button" onClick={downloadJson} disabled={!data}>
          <Download size={18} />
          Download
        </button>
      </section>

      {overview ? (
        <section className="metrics-grid" aria-label="Overview">
          <Metric label="Known days" value={overview.known_days} />
          <Metric label="Conversations" value={overview.conversation_count} />
          <Metric label="Your messages" value={overview.user_message_count} />
          <Metric label="GPT messages" value={overview.assistant_message_count} />
          <Metric label="Images" value={overview.image_count} />
          <Metric label="Files" value={overview.file_count} />
          <Metric label="Voice" value={overview.voice_count} />
          <Metric label="Total chars" value={overview.total_character_count} />
        </section>
      ) : null}

      {data ? (
        <section className="preview-band">
          <div className="preview-header">
            <div>
              <p className="eyebrow">WrappedData</p>
              <h2>Generated JSON</h2>
            </div>
            <FileJson size={22} />
          </div>
          <pre>{preview}</pre>
        </section>
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  if (typeof value === "string") {
    return value;
  }
  return value === null || value === undefined ? "-" : String(value);
}

export default App;

