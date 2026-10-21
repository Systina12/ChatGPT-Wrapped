import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TouchEvent,
} from "react";
import { CuriosityMark } from "../ui/CuriosityMark";
import type { WrappedData } from "../../types/wrapped";
import { useI18n } from "../../lib/report/i18n";
export type ReportDestination = "statistics" | "warnings" | "json" | "share";
interface Props {
  data: WrappedData;
  onClose: () => void;
  onExplore: (destination: ReportDestination) => void;
}
export function AnnualReport({ data, onClose, onExplore }: Props) {
  const { t, number, date } = useI18n();
  const [page, setPage] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const zone = data.options?.timezone || "UTC";
  const count = data.meta.table_counts.messages;
  const titles = [
    t("好奇心，有迹可循。", "Curiosity leaves a trace."),
    t("问题，连接了可能。", "One question opens a world."),
    t("灵感有自己的时区。", "Inspiration keeps its own time."),
    t("每一次出现，都算数。", "You kept showing up."),
    t("一起，把想法走得更远。", "A little further, together."),
    t("这些词，是你的坐标。", "Your words. Your coordinates."),
    t("把这一页，留给自己。", "Keep a little of this year."),
  ];
  const total = titles.length;
  const go = (next: number) => setPage(Math.min(total - 1, Math.max(0, next)));
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    heading.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    dialog.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  }, [page]);
  function keyDown(event: KeyboardEvent) {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.target instanceof HTMLElement &&
        /INPUT|SELECT|TEXTAREA/.test(event.target.tagName))
    )
      return;
    if (
      ["ArrowRight", "PageDown", "ArrowLeft", "PageUp", "Home", "End"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
      if (event.key === "Home") go(0);
      else if (event.key === "End") go(total - 1);
      else go(page + (["ArrowRight", "PageDown"].includes(event.key) ? 1 : -1));
    }
  }
  function touchEnd(event: TouchEvent) {
    if (!start.current || !event.changedTouches[0]) return;
    const dx = event.changedTouches[0].clientX - start.current.x,
      dy = event.changedTouches[0].clientY - start.current.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5)
      go(page + (dx < 0 ? 1 : -1));
    start.current = null;
  }
  const weekdays = t(
    "周一,周二,周三,周四,周五,周六,周日",
    "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
  ).split(",");
  const maxMonth = data.timeline.months.reduce(
    (max, item) => Math.max(max, item.message_count),
    1,
  );
  const words = data.frequent_words.user.slice(0, 12);
  return (
    <dialog
      ref={dialog}
      className="annual-dialog"
      aria-label={t("你的年度报告", "Your annual report")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={keyDown}
    >
      <div className={`annual-shell annual-theme-${page % 3}`}>
        <header className="annual-topbar">
          <span className="annual-brand">CHATGPT / WRAPPED</span>
          <div className="annual-utilities">
            <button onClick={() => onExplore("statistics")}>
              {t("完整统计", "Full statistics")}
            </button>
            <button onClick={() => onExplore("warnings")}>
              {t("警告", "Warnings")} ({number(data.meta.parse_warning_count)})
            </button>
            <button onClick={() => onExplore("json")}>JSON</button>
            <button
              className="annual-close"
              onClick={onClose}
              aria-label={t("关闭年度报告", "Close annual report")}
            >
              ×
            </button>
          </div>
        </header>
        <div
          className="annual-progress"
          aria-label={t("报告章节", "Report chapters")}
        >
          {titles.map((title, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`${t("第", "Page")} ${i + 1}: ${title}`}
              aria-current={page === i ? "step" : undefined}
            >
              <span />
            </button>
          ))}
        </div>
        <section
          className={`annual-page annual-page-${page}`}
          key={page}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (touch) start.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={touchEnd}
          aria-labelledby="annual-heading"
        >
          <div className="annual-art" aria-hidden="true">
            <div className="orbit-art" />
            <CuriosityMark className="annual-asterisk" />
            <span className="annual-cross">+</span>
          </div>
          <div className="annual-copy">
            <p className="annual-kicker">
              {String(page + 1).padStart(2, "0")} /{" "}
              {data.options?.year === "all" || !data.options
                ? t("你的对话档案", "YOUR CONVERSATION ARCHIVE")
                : data.options.year === "custom"
                  ? `${data.options.start} — ${data.options.end}`
                  : data.options.year}
            </p>
            <h2 id="annual-heading" tabIndex={-1} ref={heading}>
              {titles[page]}
            </h2>
            {page === 0 && (
              <>
                <p className="annual-lede">
                  {t(
                    "那些随手敲下的问题，串起了一个持续探索的你。",
                    "All those everyday questions add up to a mind in motion.",
                  )}
                </p>
                <div className="annual-main-number">
                  <strong data-testid="story-message-count">
                    {number(count)}
                  </strong>
                  <span>
                    {t(
                      "条消息，都是好奇的证据。",
                      "messages. Each one, a spark.",
                    )}
                  </span>
                </div>
                <p className="annual-footnote">
                  {date(data.overview.first_seen_at, zone)} —{" "}
                  {date(data.overview.last_seen_at, zone)} · {zone}
                </p>
              </>
            )}
            {page === 1 && (
              <>
                <p className="annual-lede">
                  {t(
                    "你不只是在寻找答案，也在发现更好的问题。",
                    "You were finding answers — and discovering new questions.",
                  )}
                </p>
                <div className="annual-main-number">
                  <strong>{number(data.overview.user_message_count)}</strong>
                  <span>{t("次主动提问与表达", "messages from you")}</span>
                </div>
                <div className="annual-pairs">
                  <div>
                    <b>{number(data.overview.conversation_count)}</b>
                    <span>{t("次对话", "conversations")}</span>
                  </div>
                  <div>
                    <b>{number(data.overview.total_character_count)}</b>
                    <span>{t("个字符", "characters")}</span>
                  </div>
                  <div>
                    <b>{number(data.overview.assistant_message_count)}</b>
                    <span>{t("次助手回应", "assistant messages")}</span>
                  </div>
                </div>
              </>
            )}
            {page === 2 && (
              <>
                <p className="annual-lede">
                  {t(
                    "在这个时刻，你的好奇心最活跃。",
                    "This is when your curiosity came alive.",
                  )}
                </p>
                <div className="annual-main-number">
                  <strong>
                    {data.activity.most_active_hour
                      ? `${data.activity.most_active_hour.key}:00`
                      : "—"}
                  </strong>
                  <span>
                    {t("最常出现的小时", "your busiest hour")} · {zone}
                  </span>
                </div>
                <div className="annual-pairs">
                  <div>
                    <b>
                      {data.activity.most_active_weekday
                        ? weekdays[
                            Number(data.activity.most_active_weekday.key)
                          ]
                        : "—"}
                    </b>
                    <span>{t("最活跃的星期", "busiest weekday")}</span>
                  </div>
                  <div>
                    <b className="annual-date">
                      {date(data.timeline.most_active_day?.key)}
                    </b>
                    <span>{t("最活跃的一天", "busiest day")}</span>
                  </div>
                </div>
              </>
            )}
            {page === 3 && (
              <>
                <p className="annual-lede">
                  {t(
                    "灵感不必每天发生。每次回来，都有新的可能。",
                    "Inspiration has its own rhythm. Every return brings a new possibility.",
                  )}
                </p>
                <div className="annual-main-number">
                  <strong>
                    {number(data.timeline.longest_active_streak.days)}
                    <small>{t("天", "days")}</small>
                  </strong>
                  <span>{t("最长连续探索", "your longest active streak")}</span>
                </div>
                <div
                  className="annual-months"
                  role="group"
                  tabIndex={0}
                  aria-label={t("最近月份活动", "Recent monthly activity")}
                >
                  {data.timeline.months.slice(-12).map((month) => (
                    <div
                      key={month.key}
                      tabIndex={0}
                      aria-label={`${month.key}: ${number(month.message_count)}`}
                    >
                      <span
                        style={{
                          height: `${Math.max(month.message_count ? 4 : 0, (month.message_count / maxMonth) * 100)}%`,
                        }}
                      />
                      <small>{month.key.slice(5)}</small>
                    </div>
                  ))}
                </div>
                <p className="annual-footnote">
                  {t(
                    "以上为最近十二个已统计月份，完整月份可在统计中查看。",
                    "Showing the latest twelve report months. Explore the complete timeline in statistics.",
                  )}
                </p>
              </>
            )}
            {page === 4 && (
              <>
                <p className="annual-lede">
                  {t(
                    "那些反复出现的名字，陪你打磨一个又一个想法。",
                    "Familiar names. New perspectives. One idea at a time.",
                  )}
                </p>
                <div className="annual-model">
                  {data.models.most_used_model?.model || "—"}
                </div>
                <p className="annual-model-caption">
                  {t("最常使用的助手模型", "Your most-used assistant model")}
                </p>
                <div className="annual-pairs">
                  <div>
                    <b>{number(data.models.models.length)}</b>
                    <span>{t("种助手模型", "assistant models")}</span>
                  </div>
                  <div>
                    <b>{number(data.assets.total_count)}</b>
                    <span>{t("个对话附件", "conversation attachments")}</span>
                  </div>
                </div>
              </>
            )}
            {page === 5 && (
              <>
                <p className="annual-lede">
                  {t(
                    "从你的提问里，捡起那些反复闪光的词。",
                    "The ideas that kept finding their way into your questions.",
                  )}
                </p>
                <div className="annual-words">
                  {words.length ? (
                    words.map((word, i) => (
                      <span
                        key={word.term}
                        style={{
                          fontSize: `${Math.max(1.1, 3.5 - i * 0.2)}rem`,
                          animationDelay: `${i * 40}ms`,
                        }}
                      >
                        {word.term}
                      </span>
                    ))
                  ) : (
                    <p>
                      {t(
                        "这个范围内还没有足够的文字。",
                        "There is not enough text in this scope yet.",
                      )}
                    </p>
                  )}
                </div>
                <p className="annual-footnote">
                  {t(
                    "关键词只在本地显示。分享卡默认不包含这些词。",
                    "Visible here on your device. Share cards exclude these words by default.",
                  )}
                </p>
              </>
            )}
            {page === 6 && (
              <>
                <p className="annual-lede">
                  {t(
                    "探索没有终点。把这段旅程收好，再向下一次好奇出发。",
                    "There is always another question. Keep this chapter, then begin the next.",
                  )}
                </p>
                <div className="annual-ending-art" aria-hidden="true">
                  ↗
                </div>
                <button
                  className="annual-share-button"
                  onClick={() => onExplore("share")}
                >
                  {t("制作我的分享卡 ↗", "Make my share card ↗")}
                </button>
                <p className="annual-footnote">
                  {t(
                    "默认只分享汇总数据。保存与分享，由你决定。",
                    "Only summary metrics by default. You choose what to save and share.",
                  )}
                </p>
              </>
            )}
          </div>
        </section>
        <footer className="annual-navigation">
          <button
            onClick={() => go(page - 1)}
            disabled={page === 0}
            aria-label={t("上一页报告", "Previous report page")}
          >
            ←<span>{t("上一页", "Previous")}</span>
          </button>
          <div aria-live="polite" aria-atomic="true">
            <strong>{String(page + 1).padStart(2, "0")}</strong>
            <span> / {String(total).padStart(2, "0")}</span>
            <small>
              {t("左右滑动 / 方向键翻页", "Swipe / arrow keys to explore")}
            </small>
          </div>
          <button
            onClick={() => (page + 1 < total ? go(page + 1) : onClose())}
            aria-label={
              page + 1 < total
                ? t("下一页报告", "Next report page")
                : t("返回数据总览", "Back to overview")
            }
          >
            <span>
              {page + 1 < total ? t("下一页", "Next") : t("总览", "Overview")}
            </span>
            →
          </button>
        </footer>
      </div>
    </dialog>
  );
}
