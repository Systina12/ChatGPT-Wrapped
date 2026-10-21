import { useEffect, useMemo, useState } from "react";
import type { WrappedData } from "../../types/wrapped";
import { useI18n } from "../../lib/report/i18n";
import { downloadBlob, shareSvg, svgToPng } from "../../lib/report/share";
export function ShareCard({ data }: { data: WrappedData }) {
  const { t, language } = useI18n();
  const [keywords, setKeywords] = useState(false),
    [titles, setTitles] = useState(false);
  const [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const svg = useMemo(
    () => shareSvg(data, { keywords, titles, language }),
    [data, keywords, titles, language],
  );
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [svg]);
  async function png() {
    setBusy(true);
    setError("");
    try {
      downloadBlob(await svgToPng(svg), "chatgpt-wrapped-share.png");
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="feature-panel share-card"
      aria-label={t("分享卡", "Share card")}
    >
      <div>
        <p className="eyebrow">SHARE BY CHOICE</p>
        <h2>{t("只分享你想分享的。", "Your story. Your choice.")}</h2>
        <p>
          {t(
            "默认只包含汇总指标。关键词与会话标题需主动勾选；分享卡不包含消息摘录或附件文件名。",
            "Summary metrics only by default. Keywords and conversation titles are opt-in. Cards contain no message excerpts or attachment filenames.",
          )}
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={keywords}
            onChange={(e) => setKeywords(e.target.checked)}
          />
          {t("分享关键词", "Include keywords")}
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={titles}
            onChange={(e) => setTitles(e.target.checked)}
          />
          {t("分享会话标题", "Include conversation titles")}
        </label>
        <div className="actions">
          <button
            onClick={() =>
              downloadBlob(
                new Blob([svg], { type: "image/svg+xml" }),
                "chatgpt-wrapped-share.svg",
              )
            }
          >
            {t("下载 SVG", "Download SVG")}
          </button>
          <button onClick={png} disabled={busy}>
            {t("下载 PNG", "Download PNG")}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
      <img
        className="share-preview"
        src={preview || undefined}
        alt={t("分享卡预览", "Share card preview")}
      />
    </section>
  );
}
