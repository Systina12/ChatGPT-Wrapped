import { useRef, type ChangeEvent } from "react";
import type { ReportState } from "../../hooks/useWrappedReport";
import { useI18n } from "../../lib/report/i18n";
interface Props {
  state: ReportState;
  onFiles: (files: File[]) => void;
  onReport: (file: File) => void;
  onDownload: () => void;
  onReset: () => void;
}
export function StatusBar({
  state,
  onFiles,
  onReport,
  onDownload,
  onReset,
}: Props) {
  const { t, number } = useI18n();
  const zip = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null),
    report = useRef<HTMLInputElement>(null);
  const busy = state.status === "reading";
  const phase = busy ? state.progress.phase : "reading";
  const phaseText =
    phase === "reading"
      ? t("正在读取", "Reading")
      : phase === "parsing"
        ? t("正在解析", "Parsing")
        : t("正在统计", "Calculating");
  const text = busy
    ? `${phaseText} ${number(state.progress.completed)} / ${number(state.progress.total)}`
    : state.status === "done"
      ? t("本地报告已就绪", "Your local report is ready")
      : state.status === "error"
        ? t("导入失败", "Import failed")
        : t("选择导出文件，开始回顾", "Choose an export to begin");
  function selected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    onFiles(files);
    event.target.value = "";
  }
  return (
    <section
      className={`status-band status-${state.status}`}
      aria-label={t("导入与状态", "Import & status")}
    >
      <div className="status-copy">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <strong role="status">{text}</strong>
          {state.status === "error" && <p role="alert">{state.message}</p>}
          {busy && (
            <progress
              aria-label={phaseText}
              value={state.progress.completed}
              max={Math.max(state.progress.total, 1)}
            />
          )}
        </div>
      </div>
      <div className="actions">
        <button onClick={() => zip.current?.click()}>
          {t("选择 ZIP", "Choose ZIP")}
        </button>
        <button onClick={() => folder.current?.click()}>
          {t("选择文件夹", "Choose folder")}
        </button>
        <button onClick={() => report.current?.click()}>
          {t("导入报告 JSON", "Import report JSON")}
        </button>
        {state.status === "done" && (
          <button onClick={onDownload}>
            {t("下载报告 JSON", "Download report JSON")}
          </button>
        )}
        <button onClick={onReset} disabled={state.status === "idle"}>
          {busy ? t("取消", "Cancel") : t("重置", "Reset")}
        </button>
      </div>
      <input
        className="hidden-input"
        ref={zip}
        type="file"
        aria-label={t("选择 ZIP 文件", "ZIP file")}
        accept=".zip,application/zip"
        onChange={selected}
      />
      <input
        className="hidden-input"
        ref={folder}
        type="file"
        aria-label={t("选择导出文件夹", "Export folder")}
        multiple
        {...{ webkitdirectory: "true" }}
        onChange={selected}
      />
      <input
        className="hidden-input"
        ref={report}
        type="file"
        accept=".json,application/json"
        aria-label={t("报告 JSON 文件", "Report JSON file")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onReport(file);
          event.target.value = "";
        }}
      />
    </section>
  );
}
