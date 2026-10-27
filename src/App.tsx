import { useState } from "react";
import { Languages } from "lucide-react";
import { Hero } from "./components/hero/Hero";
import { Report } from "./components/report/Report";
import { ReportControls } from "./components/report/ReportControls";
import { EmptyState } from "./components/status/EmptyState";
import { StatusBar } from "./components/status/StatusBar";
import { useWrappedReport } from "./hooks/useWrappedReport";
import { downloadWrappedData } from "./lib/report/download";
import { I18nProvider, useI18n } from "./lib/report/i18n";
import { clearReport, loadReport, saveReport } from "./lib/report/storage";
function Workspace() {
  const { state, analyze, recalculate, reset, open, importReport } =
    useWrappedReport();
  const { t, language, setLanguage } = useI18n();
  const [notice, setNotice] = useState("");
  function action(run: () => void, success: string) {
    try {
      run();
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <main className="app-shell">
      <nav className="topbar" aria-label={t("界面设置", "Interface settings")}>
        <a className="brand" href={import.meta.env.BASE_URL}>
          CHATGPT<span>WRAPPED ↗</span>
        </a>
        <label className="language-control">
          <Languages size={18} aria-hidden="true" />
          <span>语言 / Language</span>
          <select
            aria-label="语言 / Language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "zh" | "en")}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </nav>
      {state.status !== "done" && <Hero />}
      <StatusBar
        state={state}
        onFiles={(files) => {
          setNotice("");
          analyze(files);
        }}
        onReport={(file) => {
          setNotice("");
          void importReport(file);
        }}
        onDownload={(full = false) => {
          if (
            state.status === "done" &&
            window.confirm(
              t(
                "报告 JSON 可能包含会话标题、消息摘录、关键词和附件名称等敏感内容。确定下载？",
                "Report JSON may contain sensitive conversation titles, message excerpts, keywords and attachment names. Download?",
              ) +
                (full
                  ? t(
                      " 完整数据可能超过 20 MiB，无法在此重新打开。",
                      " Full data may exceed 20 MiB and cannot then be reopened here.",
                    )
                  : t(
                      " 超过上限时将省略完整会话排行，以便重新打开。",
                      " If needed, the full conversation ranking will be omitted to keep the report reopenable.",
                    )),
            )
          ) {
            try {
              const result = downloadWrappedData(state.data, full);
              setNotice(
                result.compacted
                  ? t(
                      "已下载精简报告，省略了完整会话排行，文件内保留了说明。",
                      "Compact report downloaded; the full conversation ranking was omitted and a notice retained.",
                    )
                  : full
                    ? t("完整数据已下载", "Full data downloaded")
                    : t(
                        "可重新打开的报告已下载",
                        "Reopenable report downloaded",
                      ),
              );
            } catch (error) {
              setNotice(error instanceof Error ? error.message : String(error));
            }
          }
        }}
        onReset={() => {
          reset();
          setNotice("");
        }}
      />
      <div className="storage-toolbar">
        <button
          onClick={() =>
            action(
              () => open(loadReport()),
              t("已打开保存的报告", "Saved report opened"),
            )
          }
        >
          {t("打开本地报告", "Open saved report")}
        </button>
        <button
          onClick={() =>
            action(
              () => clearReport(),
              t("已清除本地报告", "Saved report cleared"),
            )
          }
        >
          {t("清除本地报告", "Clear saved report")}
        </button>
        {state.status === "done" && (
          <button
            onClick={() =>
              action(
                () => saveReport(state.data),
                t("报告已保存在此浏览器", "Report saved in this browser"),
              )
            }
          >
            {t("保存到本地", "Save locally")}
          </button>
        )}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {state.status === "done" ? (
        <>
          <ReportControls
            options={state.data.options}
            years={state.data.available_years}
            disabled={!state.canRecalculate}
            onApply={recalculate}
          />
          <Report key={state.data.meta.generated_at} data={state.data} />
        </>
      ) : (
        !["reading"].includes(state.status) && <EmptyState />
      )}
    </main>
  );
}
export default function App() {
  return (
    <I18nProvider>
      <Workspace />
    </I18nProvider>
  );
}
