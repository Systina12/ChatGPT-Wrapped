import { useMemo, useState, type CSSProperties } from "react";
import type {
  CountMap,
  Distribution,
  TopConversation,
  WrappedData,
} from "../../types/wrapped";
import { useI18n } from "../../lib/report/i18n";
import { ShareCard } from "./ShareCard";
import { CuriosityMark } from "../ui/CuriosityMark";
import { AnnualReport, type ReportDestination } from "./AnnualReport";
export function Metrics({ data }: { data: WrappedData }) {
  const { t, number } = useI18n();
  const metrics: [string, number, string][] = [
    [
      t("对话", "Conversations"),
      data.overview.conversation_count,
      "conversations",
    ],
    [t("消息", "Messages"), data.meta.table_counts.messages, "messages"],
    [
      t("用户消息", "Your messages"),
      data.overview.user_message_count,
      "user-messages",
    ],
    [
      t("字符", "Characters"),
      data.overview.total_character_count,
      "characters",
    ],
    [
      t("活跃天数", "Active days"),
      data.timeline.days.filter((d) => d.message_count > 0).length,
      "active-days",
    ],
    [t("附件", "Attachments"), data.assets.total_count, "assets"],
  ];
  return (
    <div className="metrics-grid">
      {metrics.map(([label, value, testId]) => (
        <article className="metric" key={testId}>
          <span className="metric-label">{label}</span>
          <strong
            data-testid={`metric-${testId}`}
            style={{ "--metric-length": number(value).length } as CSSProperties}
          >
            {number(value)}
          </strong>
        </article>
      ))}
    </div>
  );
}
function Bars({
  values,
  label,
}: {
  values: [string, number][];
  label: string;
}) {
  const { number } = useI18n();
  const max = values.reduce((best, [, value]) => Math.max(best, value), 1);
  return (
    <div
      className="accessible-chart"
      role="group"
      aria-label={label}
      tabIndex={0}
    >
      {values.map(([key, value]) => (
        <div
          className="chart-item"
          tabIndex={0}
          key={key}
          aria-label={`${key}: ${number(value)}`}
        >
          <span>{key}</span>
          <div className="chart-track">
            <i style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <strong>{number(value)}</strong>
        </div>
      ))}
    </div>
  );
}
function Counts({
  values,
  labels = {},
}: {
  values: CountMap | Distribution;
  labels?: Record<string, string>;
}) {
  const { t, number } = useI18n();
  const translated: Record<string, string> = {
    zero: "0",
    one_to_two: "1–2",
    three_to_five: "3–5",
    six_to_ten: "6–10",
    eleven_to_thirty: "11–30",
    thirty_one_to_one_hundred: "31–100",
    over_one_hundred: ">100",
    image: t("图片", "Images"),
    voice: t("音频", "Audio"),
    file: t("文件", "Files"),
    chinese: t("中文", "Chinese"),
    english: t("英文", "English"),
    mixed: t("混合", "Mixed"),
    other: t("其他", "Other"),
    late_night: t("深夜", "Late night"),
    morning: t("上午", "Morning"),
    afternoon: t("下午", "Afternoon"),
    evening: t("晚间", "Evening"),
    weekday: t("工作日", "Weekday"),
    weekend: t("周末", "Weekend"),
  };
  return (
    <dl className="count-list">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt>
            {Object.hasOwn(labels, key)
              ? labels[key]
              : Object.hasOwn(translated, key)
                ? translated[key]
                : key}
          </dt>
          <dd>{number(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Report({ data }: { data: WrappedData }) {
  const { t, number, date } = useI18n();
  const [storyOpen, setStoryOpen] = useState(false);
  function explore(destination: ReportDestination) {
    setStoryOpen(false);
    const ids = {
      statistics: "full-statistics",
      warnings: "report-warnings",
      json: "report-json",
      share: "report-share",
    };
    const target = document.getElementById(ids[destination]);
    if (target instanceof HTMLDetailsElement) target.open = true;
    if (destination === "json") setRawOpen(true);
    requestAnimationFrame(() => {
      target?.scrollIntoView({ block: "start" });
      (target?.querySelector("summary,button") as HTMLElement | null)?.focus({
        preventScroll: true,
      });
    });
  }
  const [rawOpen, setRawOpen] = useState(false),
    [monthPage, setMonthPage] = useState(0),
    [rankMetric, setRankMetric] = useState<
      "message_count" | "character_count" | "asset_count"
    >("message_count"),
    [ascending, setAscending] = useState(false),
    [expanded, setExpanded] = useState(false),
    [rankPage, setRankPage] = useState(0),
    [wordRole, setWordRole] = useState<"user" | "assistant" | "all">("user");
  const zone = data.options?.timezone || "UTC";
  const pages = Math.max(1, Math.ceil(data.timeline.months.length / 12));
  const currentPage = Math.min(monthPage, pages - 1);
  const ranks = useMemo(() => {
    const source =
      data.conversations.ranking ??
      (rankMetric === "message_count"
        ? data.conversations.longest_by_messages
        : rankMetric === "character_count"
          ? data.conversations.longest_by_characters
          : data.conversations.most_assets);
    return [...source].sort(
      (a, b) => (a[rankMetric] - b[rankMetric]) * (ascending ? 1 : -1),
    );
  }, [data, rankMetric, ascending]);
  const rankPageSize = 25;
  const rankPages = Math.max(1, Math.ceil(ranks.length / rankPageSize));
  const visibleRankPage = Math.min(rankPage, rankPages - 1);
  const warnings = data.warnings || [];
  const raw = useMemo(
    () => (rawOpen ? JSON.stringify(data, null, 2) : ""),
    [rawOpen, data],
  );
  const comparison = data.comparison;
  return (
    <div className="report-content">
      <header className="report-heading">
        <div>
          <p className="eyebrow">YOUR ARCHIVE / AT A GLANCE</p>
          <h2>{t("数据总览", "At a glance")}</h2>
        </div>
        <p className="report-range">
          {date(data.overview.first_seen_at, zone)} →{" "}
          {date(data.overview.last_seen_at, zone)} · {zone}
        </p>
      </header>
      <section
        className="overview-gateway"
        aria-label={t("年度回顾总览", "Year in review overview")}
      >
        <div className="gateway-copy">
          <p className="eyebrow">
            A MIND IN MOTION /{" "}
            {data.options?.year === "all"
              ? "ALL YEARS"
              : data.options?.year === "custom"
                ? "YOUR OWN TIMELINE"
                : data.options?.year}
          </p>
          <h2>{t("这是你的好奇心。", "This is your curiosity.")}</h2>
          <p>
            {t(
              "用一个个问题，拼出你的探索轨迹。",
              "One question at a time. A world of your own.",
            )}
          </p>
          <button className="enter-report" onClick={() => setStoryOpen(true)}>
            {t("进入我的年度报告", "Enter my annual report")}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="gateway-art" aria-hidden="true">
          <span>
            <CuriosityMark />
          </span>
          <div />
          <b>
            {data.options?.year && /^\d{4}$/.test(data.options.year)
              ? data.options.year
              : "YOU × AI"}
          </b>
        </div>
      </section>
      <Metrics data={data} />
      {storyOpen && (
        <AnnualReport
          data={data}
          onClose={() => setStoryOpen(false)}
          onExplore={explore}
        />
      )}
      <div className="insights-row">
        <p>
          {t("最长连续使用", "Longest streak")}{" "}
          <strong>
            {number(data.timeline.longest_active_streak.days)} {t("天", "days")}
          </strong>
        </p>
        <p>
          {t("最高活跃日期", "Busiest day")}{" "}
          <strong>{date(data.timeline.most_active_day?.key)}</strong>
        </p>
        <p>
          {t("最高活跃小时", "Busiest hour")}{" "}
          <strong>
            {data.activity.most_active_hour
              ? `${data.activity.most_active_hour.key}:00`
              : "—"}
          </strong>
        </p>
      </div>
      {comparison && (
        <section
          className="feature-panel"
          aria-label={t("年度比较", "Year comparison")}
        >
          <h3>
            {t("与上一年相比", "Compared with last year")} · {comparison.year}
          </h3>
          {comparison.has_data ? (
            <p>
              {t("消息数量", "Messages")}: {number(comparison.message_count)} →{" "}
              {number(data.meta.table_counts.messages)} ·{" "}
              {comparison.message_growth_percent === null
                ? "—"
                : `${number(comparison.message_growth_percent, { maximumFractionDigits: 1 })}%`}
            </p>
          ) : (
            <p>
              {t(
                "上一年没有数据，无法计算增长率。",
                "No data for the previous year. Growth is unavailable.",
              )}
            </p>
          )}
        </section>
      )}
      <details
        id="report-warnings"
        className="feature-panel warning-panel"
        open={warnings.length > 0}
      >
        <summary>
          {t("解析警告", "Parse warnings")} (
          {number(data.meta.parse_warning_count)})
        </summary>
        {warnings.length ? (
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>
                <code>{w.code}</code> — {w.message}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {data.meta.parse_warning_count
              ? t(
                  "旧报告没有保存警告详情。",
                  "Warning details were not retained in this older report.",
                )
              : t("没有解析警告。", "No parse warnings.")}
          </p>
        )}
      </details>
      <details className="feature-panel full-statistics" id="full-statistics">
        <summary>{t("查看完整统计", "Explore complete statistics")}</summary>
        <div className="detail-grid">
          <section className="feature-panel">
            <h3>{t("月份活动", "Monthly activity")}</h3>
            <Bars
              label={t("月份消息图表", "Monthly messages chart")}
              values={data.timeline.months
                .slice(currentPage * 12, currentPage * 12 + 12)
                .map((m) => [m.key, m.message_count])}
            />
            <div className="pagination">
              <button
                disabled={currentPage === 0}
                onClick={() => setMonthPage(currentPage - 1)}
              >
                {t("上一页月份", "Previous months")}
              </button>
              <span>
                {number(currentPage + 1)} / {number(pages)}
              </span>
              <button
                disabled={currentPage + 1 >= pages}
                onClick={() => setMonthPage(currentPage + 1)}
              >
                {t("下一页月份", "Next months")}
              </button>
            </div>
          </section>
          <section className="feature-panel">
            <h3>{t("一天中的灵感", "Hours of inspiration")}</h3>
            <Bars
              label={t("小时活动图表", "Hourly activity chart")}
              values={Object.entries(data.activity.by_hour).map(([h, n]) => [
                `${h}:00`,
                n,
              ])}
            />
          </section>
          <section className="feature-panel">
            <h3>{t("星期与时段", "Weekdays & day periods")}</h3>
            <Counts
              values={data.activity.by_weekday}
              labels={Object.fromEntries(
                t(
                  "周一,周二,周三,周四,周五,周六,周日",
                  "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday",
                )
                  .split(",")
                  .map((s, i) => [String(i), s]),
              )}
            />
            <Counts values={data.activity.by_day_period} />
            <Counts values={data.activity.weekday_vs_weekend} />
            <p>
              {t("最长无活动间隔", "Longest inactive gap")}:{" "}
              {number(data.timeline.longest_inactive_gap.days)}{" "}
              {t("天", "days")}
            </p>
          </section>
          <section className="feature-panel">
            <h3>{t("模型与语言", "Models & languages")}</h3>
            <Bars
              label={t("模型使用图表", "Model usage chart")}
              values={data.models.models.map((m) => [m.model, m.message_count])}
            />
            <Counts values={data.language.message_buckets} />
            <Counts
              values={data.language.totals}
              labels={{
                chinese_characters: t("中文字符", "Chinese characters"),
                english_words: t("英文单词", "English words"),
                digit_characters: t("数字字符", "Digit characters"),
              }}
            />
          </section>
        </div>
        <section className="feature-panel">
          <h3>{t("对话排行", "Conversation ranking")}</h3>
          <div className="inline-controls">
            <label>
              {t("排行排序", "Rank by")}
              <select
                aria-label={t("排行排序", "Rank by")}
                value={rankMetric}
                onChange={(e) => {
                  setRankMetric(e.target.value as typeof rankMetric);
                  setRankPage(0);
                }}
              >
                <option value="message_count">{t("消息数", "Messages")}</option>
                <option value="character_count">
                  {t("字符数", "Characters")}
                </option>
                <option value="asset_count">
                  {t("附件数", "Attachments")}
                </option>
              </select>
            </label>
            <button
              onClick={() => {
                setAscending(!ascending);
                setRankPage(0);
              }}
            >
              {ascending ? t("升序", "Ascending") : t("降序", "Descending")}
            </button>
          </div>
          {!data.conversations.ranking && (
            <p>
              {t(
                "此旧报告仅保存 Top 20，排序仅限已保存的排行。",
                "This older report contains Top 20 only; sorting is limited to the saved ranking.",
              )}
            </p>
          )}
          <div className="ranking-list">
            {ranks
              .slice(
                expanded ? visibleRankPage * rankPageSize : 0,
                expanded ? (visibleRankPage + 1) * rankPageSize : 5,
              )
              .map((c: TopConversation, i) => (
                <details key={`${c.conversation_id}-${i}`}>
                  <summary>
                    <span>
                      {String(
                        (expanded ? visibleRankPage * rankPageSize : 0) + i + 1,
                      ).padStart(2, "0")}
                    </span>
                    <strong>
                      {c.title || t("未命名对话", "Untitled conversation")}
                    </strong>
                    <b>{number(c[rankMetric])}</b>
                  </summary>
                  <p>
                    {t("用户 / 助手消息", "User / assistant messages")}:{" "}
                    {number(c.user_message_count)} /{" "}
                    {number(c.assistant_message_count)} ·{" "}
                    {t("字符", "Characters")}: {number(c.character_count)} ·{" "}
                    {t("附件", "Attachments")}: {number(c.asset_count)} ·{" "}
                    {date(c.created_at, zone)}
                  </p>
                </details>
              ))}
          </div>
          {expanded && rankPages > 1 && (
            <nav
              className="pagination"
              aria-label={t("会话排行分页", "Conversation ranking pages")}
            >
              <button
                disabled={visibleRankPage === 0}
                onClick={() => setRankPage(visibleRankPage - 1)}
              >
                {t("上一页排行", "Previous rankings")}
              </button>
              <span>
                {number(visibleRankPage + 1)} / {number(rankPages)}
              </span>
              <button
                disabled={visibleRankPage + 1 >= rankPages}
                onClick={() => setRankPage(visibleRankPage + 1)}
              >
                {t("下一页排行", "Next rankings")}
              </button>
            </nav>
          )}
          <button
            onClick={() => {
              setExpanded(!expanded);
              setRankPage(0);
            }}
          >
            {expanded
              ? t("收起排行", "Collapse ranking")
              : t("展开排行", "Expand ranking")}
          </button>
        </section>
        <section className="feature-panel">
          <h3>{t("常用关键词", "Frequent keywords")}</h3>
          <label>
            {t("关键词角色", "Keyword role")}
            <select
              aria-label={t("关键词角色", "Keyword role")}
              value={wordRole}
              onChange={(e) => setWordRole(e.target.value as typeof wordRole)}
            >
              <option value="user">{t("用户", "User")}</option>
              <option value="assistant">{t("助手", "Assistant")}</option>
              <option value="all">{t("全部", "All")}</option>
            </select>
          </label>
          <div className="keyword-cloud">
            {data.frequent_words[wordRole].map((w) => (
              <span key={w.term} title={number(w.count)}>
                {w.term}
                <small>{number(w.count)}</small>
              </span>
            ))}
          </div>
        </section>
        <div className="detail-grid">
          <section className="feature-panel">
            <h3>{t("消息长度分布", "Message length distribution")}</h3>
            <h4>{t("全部消息", "All messages")}</h4>
            <Counts values={data.messages.all_length_distribution} />
            <h4>{t("用户消息", "User messages")}</h4>
            <Counts values={data.messages.user_length_distribution} />
            <h4>{t("助手消息", "Assistant messages")}</h4>
            <Counts values={data.messages.assistant_length_distribution} />
            <p>
              {t("用户 / 助手字符比例", "User / assistant character ratio")}:{" "}
              {data.messages.user_to_assistant_character_ratio === null
                ? "—"
                : number(data.messages.user_to_assistant_character_ratio, {
                    maximumFractionDigits: 4,
                  })}
            </p>
            <Counts
              values={{
                "?": data.messages.question_marks,
                "!": data.messages.exclamation_marks,
                URL: data.messages.url_count,
                [t("代码块", "Code blocks")]: data.messages.code_block_count,
              }}
            />
          </section>
          <section className="feature-panel">
            <h3>{t("对话状态与反馈", "Conversation state & feedback")}</h3>
            <Counts
              values={{
                [t("归档", "Archived")]: data.conversations.archived_count,
                [t("收藏", "Starred")]: data.conversations.starred_count,
                [t("已分享对话", "Shared conversations")]:
                  data.conversations.shared_count,
                [t("反馈", "Feedback")]: data.quality.feedback_count,
                [t("有反馈的对话", "Conversations with feedback")]:
                  data.quality.conversations_with_feedback_count,
                [t("群聊", "Group chats")]:
                  data.meta.table_counts.group_chats || 0,
              }}
            />
            <Counts values={data.quality.feedback_by_rating} />
            <h4>{t("对话消息分布", "Messages per conversation")}</h4>
            <Counts values={data.conversations.message_count_distribution} />
            <h4>{t("对话字符分布", "Characters per conversation")}</h4>
            <Counts values={data.conversations.character_count_distribution} />
          </section>
          <section className="feature-panel">
            <h3>{t("附件统计", "Attachments")}</h3>
            <p>
              {t(
                "仅统计去重后的对话附件，资料库文件不重复计数。",
                "Deduplicated conversation attachments; library metadata is not counted again.",
              )}
            </p>
            <Counts values={data.assets.by_category} />
            <h4>MIME</h4>
            <Counts
              values={Object.fromEntries(
                data.assets.by_mime_type.map((a) => [a.key, a.count]),
              )}
            />
            <h4>{t("文件扩展名", "File extensions")}</h4>
            <Counts
              values={Object.fromEntries(
                data.assets.by_extension.map((a) => [a.key, a.count]),
              )}
            />
            <details>
              <summary>{t("大附件详情", "Largest attachment details")}</summary>
              {data.assets.largest_assets.map((a, i) => (
                <p key={i}>
                  {a.display_name || a.local_path} · {number(a.size_bytes || 0)}{" "}
                  B
                </p>
              ))}
            </details>
          </section>
        </div>
      </details>
      <div id="report-share">
        <ShareCard data={data} />
      </div>
      <details
        id="report-json"
        className="raw-details"
        onToggle={(event) => setRawOpen(event.currentTarget.open)}
      >
        <summary>{t("完整报告 JSON", "Full report JSON")}</summary>
        {rawOpen && <pre data-testid="raw-report">{raw}</pre>}
      </details>
      <footer className="report-footer">
        {t(
          "在你的浏览器生成。由你决定保存与分享。",
          "Generated in your browser. Saved and shared by you.",
        )}
      </footer>
    </div>
  );
}
