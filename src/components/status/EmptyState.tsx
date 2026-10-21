import { useI18n } from "../../lib/report/i18n";
export function EmptyState() {
  const { t } = useI18n();
  return (
    <section className="empty-state">
      <p className="eyebrow">START WITH YOUR ARCHIVE</p>
      <h2>{t("你的数据，你的年度故事。", "Your data. Your year.")}</h2>
      <div className="steps">
        <div>
          <span>01</span>
          <strong>{t("导出", "Export")}</strong>
          <small>
            {t(
              "ChatGPT 设置 → 数据控制 → 导出数据。",
              "ChatGPT Settings → Data Controls → Export Data.",
            )}
          </small>
        </div>
        <div>
          <span>02</span>
          <strong>{t("导入", "Import")}</strong>
          <small>
            {t(
              "选择官方 ZIP，或完整的解压文件夹。",
              "Choose the official ZIP or its extracted folder.",
            )}
          </small>
        </div>
        <div>
          <span>03</span>
          <strong>{t("发现", "Discover")}</strong>
          <small>
            {t(
              "所有计算在浏览器本地进行。",
              "Everything is calculated in your browser.",
            )}
          </small>
        </div>
      </div>
      <p className="import-help">
        <a
          href="https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data"
          target="_blank"
          rel="noreferrer"
        >
          {t("官方聊天记录导出说明 ↗", "Official export instructions ↗")}
        </a>
        <br />
        {t(
          "ZIP 上限 512 MiB；单个数据 JSON 128 MiB；解压 JSON 合计 512 MiB。汇总报告导入上限 20 MiB。文件夹选择支持因浏览器而异，不支持时请使用 ZIP。",
          "ZIP: 512 MiB; each data JSON: 128 MiB; combined JSON: 512 MiB. Summary report import: 20 MiB. Folder selection varies by browser; use ZIP when unavailable.",
        )}
      </p>
    </section>
  );
}
