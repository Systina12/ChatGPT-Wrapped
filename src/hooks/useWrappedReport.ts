import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_OPTIONS, type ReportOptions } from "../types/options";
import type { WrappedData } from "../types/wrapped";
import type { ImportProgress } from "../lib/export/fileInput";
import { readReportFile } from "../lib/report/restore";
import type { WorkerRequest, WorkerResponse } from "../workers/wrappedWorker";
export type ReportState =
  | { status: "idle" }
  | { status: "reading"; progress: ImportProgress }
  | { status: "done"; data: WrappedData; canRecalculate: boolean }
  | { status: "error"; message: string };
export function useWrappedReport() {
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const [state, setState] = useState<ReportState>({ status: "idle" });
  const stop = useCallback(() => {
    requestRef.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  const analyze = useCallback(
    (files: File[], options: ReportOptions = DEFAULT_OPTIONS) => {
      if (!files.length) return;
      stop();
      const id = ++requestRef.current;
      const worker = new Worker(
        new URL("../workers/wrappedWorker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      setState({
        status: "reading",
        progress: { phase: "reading", completed: 0, total: files.length },
      });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        if (workerRef.current !== worker || response.id !== requestRef.current)
          return;
        if (response.type === "progress")
          setState({ status: "reading", progress: response.progress });
        else if (response.type === "done")
          setState({
            status: "done",
            data: response.data,
            canRecalculate: true,
          });
        else {
          setState({ status: "error", message: response.message });
          stop();
        }
      };
      worker.onerror = (event) => {
        if (workerRef.current !== worker) return;
        setState({
          status: "error",
          message: event.message || "Worker failed / 计算进程失败",
        });
        stop();
      };
      worker.postMessage({
        type: "import",
        id,
        files,
        options,
      } satisfies WorkerRequest);
    },
    [stop],
  );
  const recalculate = useCallback((options: ReportOptions) => {
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++requestRef.current;
    setState({
      status: "reading",
      progress: { phase: "statistics", completed: 0, total: 1 },
    });
    worker.postMessage({
      type: "recalculate",
      id,
      options,
    } satisfies WorkerRequest);
  }, []);
  const open = useCallback(
    (data: WrappedData) => {
      stop();
      setState({ status: "done", data, canRecalculate: false });
    },
    [stop],
  );
  const importReport = useCallback(
    async (file: File) => {
      stop();
      const id = requestRef.current;
      setState({
        status: "reading",
        progress: { phase: "reading", completed: 0, total: 1 },
      });
      try {
        const data = await readReportFile(file);
        if (id === requestRef.current)
          setState({ status: "done", data, canRecalculate: false });
      } catch (error) {
        if (id === requestRef.current)
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
      }
    },
    [stop],
  );
  const reset = useCallback(() => {
    stop();
    setState({ status: "idle" });
  }, [stop]);
  return {
    state,
    analyze,
    recalculate,
    reset,
    cancel: reset,
    open,
    importReport,
  };
}
