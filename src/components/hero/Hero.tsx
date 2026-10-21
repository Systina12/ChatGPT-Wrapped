import { useI18n } from "../../lib/report/i18n";
export function Hero() {
  const { t } = useI18n();
  return (
    <header className="hero-band">
      <div className="hero-copy">
        <p className="eyebrow">A YEAR OF CURIOSITY</p>
        <h1>
          {t("每个问题，\n都有回响。", "Every question.\nA new possibility.")}
        </h1>
        <p className="lede">
          {t(
            "从一次对话，到一个更大的自己。导入 ChatGPT 导出文件，看见你的探索轨迹。",
            "From one conversation to a bigger world. Turn your ChatGPT export into a story of curiosity.",
          )}
        </p>
        <div className="privacy-pill">
          {t(
            "本地读取 · 无需账号 · 聊天记录不会上传",
            "Read locally · No account · Your conversations stay here",
          )}
        </div>
      </div>
      <div className="hero-poster" aria-hidden="true">
        <span className="poster-kicker">YOUR MIND, IN MOTION</span>
        <div className="poster-orbit poster-orbit-one" />
        <div className="poster-orbit poster-orbit-two" />
        <strong>
          YOU
          <br />× AI
          <br />↗
        </strong>
        <small>
          {t(
            "把日常的好奇，变成看得见的轨迹。",
            "An archive of your everyday curiosity.",
          )}
        </small>
      </div>
    </header>
  );
}
