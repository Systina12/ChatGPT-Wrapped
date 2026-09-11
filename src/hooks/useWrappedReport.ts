import { useCallback, useEffect, useRef, useState } from "react";
import type { WrappedData } from "../types/wrapped";
import type { WorkerRequest, WorkerResponse } from "../workers/wrappedWorker";

export type ReportState =
  | { status: "idle" }
  | { status: "reading"; fileCount: number }
  | { status: "done"; data: WrappedData }
  | { status: "error"; message: string };

export interface WrappedReport {
  state: ReportState;
  analyze: (files: File[]) => void;
  reset: () => void;
}

const IDLE_STATE: ReportState = { status: "idle" };

export function useWrappedReport(): WrappedReport {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<ReportState>(IDLE_STATE);

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => stopWorker, [stopWorker]);

  const analyze = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      stopWorker();
      const worker = createWorker();
      workerRef.current = worker;
      setState({ status: "reading", fileCount: files.length });

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        setState(event.data.type === "done" ? { status: "done", data: event.data.data } : { status: "error", message: event.data.message });
        stopWorker();
      };
      worker.onerror = (event) => {
        setState({ status: "error", message: event.message || "The parser worker stopped unexpectedly." });
        stopWorker();
      };

      const request: WorkerRequest = { files };
      worker.postMessage(request);
    },
    [stopWorker],
  );

  const reset = useCallback(() => {
    stopWorker();
    setState(IDLE_STATE);
  }, [stopWorker]);

  return { state, analyze, reset };
}

function createWorker(): Worker {
  return new Worker(new URL("../workers/wrappedWorker.ts", import.meta.url), { type: "module" });
}
