import { AudioLines, FileText, Image, Star } from "lucide-react";
import type { WrappedData, Distribution } from "../../types/wrapped";
import { useI18n } from "../../lib/report/i18n";
import type { AnnualChapterId } from "./annualChapters";

export function AnnualChapterDetails({
  chapter,
  data,
}: {
  chapter: AnnualChapterId;
  data: WrappedData;
}) {
  const { t, number } = useI18n();
  if (chapter === "week") {
    const days = t(
      "周一,周二,周三,周四,周五,周六,周日",
      "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
    ).split(",");
    const values = days.map((_, i) => data.activity.by_weekday[String(i)] || 0);
    const maximum = Math.max(1, ...values);
    const busiest = data.activity.most_active_weekday;
    return (
      <>
        <p className="annual-lede">
          {t(
            "从星期一到星期日，每一次打开对话，都留下自己的节拍。",
            "From Monday to Sunday, your conversations found their own beat.",
          )}
        </p>
        <div className="annual-split">
          <div className="annual-feature-number">
            <strong data-testid="story-weekday">
              {busiest ? days[Number(busiest.key)] || "—" : "—"}
            </strong>
            <span>{t("最活跃的星期", "Your busiest weekday")}</span>
            <p>
              {t("工作日", "Weekdays")}{" "}
              <b>{number(data.activity.weekday_vs_weekend.weekday)}</b>
              <br />
              {t("周末", "Weekends")}{" "}
              <b>{number(data.activity.weekday_vs_weekend.weekend)}</b>
            </p>
          </div>
          <div
            className="annual-week-chart"
            role="group"
            tabIndex={0}
            aria-label={t("每周消息节奏", "Weekly message rhythm")}
          >
            {days.map((day, i) => (
              <div
                key={day}
                tabIndex={0}
                aria-label={`${day}: ${number(values[i])}`}
              >
                <span className="annual-week-track">
                  <i style={{ height: `${(values[i] / maximum) * 100}%` }} />
                </span>
                <b>{day}</b>
                <small title={number(values[i])}>
                  {number(values[i], {
                    notation: "compact",
                    maximumFractionDigits: 0,
                  })}
                </small>
              </div>
            ))}
          </div>
        </div>
        <p className="annual-footnote">
          {t(
            "按所选时区统计消息数量。每个星期，都可以有不同的节奏。",
            "Message counts in your selected timezone. Every week can have a different rhythm.",
          )}
        </p>
      </>
    );
  }
  if (chapter === "months") {
    const months = data.timeline.months.slice(-12);
    const maximum = months.reduce(
      (max, item) => Math.max(max, item.message_count),
      1,
    );
    const peak = data.timeline.most_active_month;
    return (
      <>
        <p className="annual-lede">
          {t(
            "有的月份安静，有的月份热烈。它们一起，组成了这段旅程。",
            "Quiet months and busy months. Together, they made this chapter yours.",
          )}
        </p>
        <div className="annual-month-headline">
          <strong data-testid="story-peak-month">
            {peak?.key.replace("-", ".") || "—"}
          </strong>
          <span>
            {t("最活跃的月份", "Your busiest month")}
            <br />
            <b>{number(peak?.message_count || 0)}</b> {t("条消息", "messages")}
          </span>
        </div>
        <div
          className="annual-landscape"
          role="group"
          tabIndex={0}
          aria-label={t(
            "最近十二个月的消息数",
            "Messages in the latest twelve months",
          )}
        >
          {months.map((month) => (
            <div
              key={month.key}
              tabIndex={0}
              aria-label={`${month.key}: ${number(month.message_count)}`}
              data-peak={month.key === peak?.key}
            >
              <div className="annual-landscape-track">
                <i
                  style={{
                    height: `${(month.message_count / maximum) * 100}%`,
                  }}
                />
              </div>
              <span>{month.key.slice(5)}</span>
            </div>
          ))}
        </div>
        <p className="annual-footnote">
          {months.length ? `${months[0].key} — ${months.at(-1)!.key} · ` : ""}
          {t(
            "图中展示最近十二个已统计月份，最活跃月份按整个所选范围计算。",
            "Chart: latest twelve report months. The busiest month uses your full selected scope.",
          )}
        </p>
      </>
    );
  }
  if (chapter === "dialogues") {
    const conversations = [
      ...(data.conversations.ranking || data.conversations.longest_by_messages),
    ]
      .sort((a, b) => b.message_count - a.message_count)
      .slice(0, 3);
    return (
      <>
        <p className="annual-lede">
          {t(
            "一个问题之后，还有下一个问题。那些长长的来回，是思路继续生长的地方。",
            "One question led to another. These were the conversations you stayed with.",
          )}
        </p>
        <div className="annual-split annual-dialogue-layout">
          <div className="annual-feature-number">
            <strong data-testid="story-longest-dialogue">
              {number(conversations[0]?.message_count || 0)}
            </strong>
            <span>
              {t(
                "条消息，出现在最长的一次对话里",
                "messages in your longest conversation",
              )}
            </span>
          </div>
          <ol
            className="annual-tickets"
            aria-label={t("最长对话前三名", "Three longest conversations")}
          >
            {conversations.map((conversation, i) => (
              <li key={`${conversation.conversation_id}-${i}`}>
                <span className="annual-ticket-rank">0{i + 1}</span>
                <div>
                  <strong>
                    {conversation.title ||
                      t("未命名对话", "Untitled conversation")}
                  </strong>
                  <small>
                    {number(conversation.character_count)}{" "}
                    {t("字符", "characters")}
                  </small>
                </div>
                <b>
                  {number(conversation.message_count)}
                  <small>{t("消息", "messages")}</small>
                </b>
              </li>
            ))}
            {!conversations.length && (
              <li>
                {t(
                  "这个范围内还没有对话。",
                  "No conversations in this scope yet.",
                )}
              </li>
            )}
          </ol>
        </div>
        <p className="annual-footnote">
          {t(
            "标题只在你的本地报告中展示。分享卡默认不包含会话标题。",
            "Titles are visible in your local report. Share cards exclude titles by default.",
          )}
        </p>
      </>
    );
  }
  if (chapter === "expression") {
    const average = data.overview.user_message_count
      ? Math.round(
          data.overview.user_character_count / data.overview.user_message_count,
        )
      : null;
    const buckets: [keyof Distribution, string][] = [
      ["zero", "0"],
      ["one_to_two", "1–2"],
      ["three_to_five", "3–5"],
      ["six_to_ten", "6–10"],
      ["eleven_to_thirty", "11–30"],
      ["thirty_one_to_one_hundred", "31–100"],
      ["over_one_hundred", ">100"],
    ];
    const maximum = buckets.reduce(
      (max, [key]) =>
        Math.max(max, data.messages.user_length_distribution[key]),
      1,
    );
    const longest = data.messages.longest_user_messages.reduce(
      (max, item) => Math.max(max, item.character_count),
      0,
    );
    return (
      <>
        <p className="annual-lede">
          {t(
            "有时一句就够，有时需要铺开来说。每一种长度，都装得下想法。",
            "Sometimes a few words were enough. Sometimes an idea needed more room.",
          )}
        </p>
        <div className="annual-split">
          <div className="annual-feature-number">
            <strong data-testid="story-average-length">
              {average === null ? "—" : number(average)}
              <small>{t("字", "chars")}</small>
            </strong>
            <span>
              {t(
                "平均每条用户消息的字符数",
                "Average characters per message from you",
              )}
            </span>
            <p>
              {t("最长一条", "Your longest message")} <b>{number(longest)}</b>{" "}
              {t("字符", "characters")}
            </p>
          </div>
          <div
            className="annual-length-chart"
            role="group"
            tabIndex={0}
            aria-label={t(
              "用户消息长度分布",
              "Your message length distribution",
            )}
          >
            {buckets.map(([key, label]) => (
              <div
                key={key}
                tabIndex={0}
                aria-label={`${label} ${t("字符", "characters")}: ${number(data.messages.user_length_distribution[key])}`}
              >
                <span>{label}</span>
                <i
                  style={{
                    width: `${(data.messages.user_length_distribution[key] / maximum) * 100}%`,
                  }}
                />
                <b>{number(data.messages.user_length_distribution[key])}</b>
              </div>
            ))}
            <small>
              {t("字符区间 / 消息数", "Character range / messages")}
            </small>
          </div>
        </div>
      </>
    );
  }
  if (chapter === "attachments") {
    const assets = [
      { key: "image", label: t("图片", "Images"), Icon: Image },
      { key: "voice", label: t("音频", "Audio"), Icon: AudioLines },
      { key: "file", label: t("文件", "Files"), Icon: FileText },
    ];
    return (
      <>
        <p className="annual-lede">
          {t(
            "不只有文字。图片、声音和文件，也参与了这场对话。",
            "Beyond words: images, audio and files became part of the conversation.",
          )}
        </p>
        <div className="annual-split annual-attachment-layout">
          <div className="annual-feature-number">
            <strong data-testid="story-asset-count">
              {number(data.assets.total_count)}
            </strong>
            <span>
              {t("个去重后的对话附件", "deduplicated conversation attachments")}
            </span>
          </div>
          <div
            className="annual-file-deck"
            role="group"
            aria-label={t("附件分类", "Attachment categories")}
          >
            {assets.map(({ key, label, Icon }) => (
              <div
                className={`annual-file annual-file-${key}`}
                key={key}
                tabIndex={0}
                aria-label={`${label}: ${number(data.assets.by_category[key] || 0)}`}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
                <strong>{number(data.assets.by_category[key] || 0)}</strong>
              </div>
            ))}
          </div>
        </div>
        <p className="annual-footnote">
          {t(
            "同一消息的重复附件已合并，资料库文件不重复计入。这里不会展示附件文件名。",
            "Duplicates within a message are merged. Library files are not counted twice. Filenames stay out of this page.",
          )}
        </p>
      </>
    );
  }
  if (chapter === "saved") {
    return (
      <>
        <p className="annual-lede">
          {t(
            "收藏、归档，或分享出去。你用不同的方式，为对话做了标记。",
            "Starred, archived or shared. Different ways of marking a conversation.",
          )}
        </p>
        <div className="annual-split annual-keepsake-layout">
          <div className="annual-feature-number">
            <strong data-testid="story-starred-count">
              {number(data.conversations.starred_count)}
            </strong>
            <span>{t("个被收藏的对话", "starred conversations")}</span>
            <div className="annual-pairs">
              <div>
                <b>{number(data.conversations.archived_count)}</b>
                <span>{t("已归档", "Archived")}</span>
              </div>
              <div>
                <b>{number(data.conversations.shared_count)}</b>
                <span>{t("已分享", "Shared")}</span>
              </div>
            </div>
          </div>
          <div className="annual-keepsake" aria-hidden="true">
            <span>KEEP / IDEAS</span>
            <Star />
            <b>
              {t(
                "留一颗星，\n给那些灵感。",
                "A little star.\nAn idea to keep.",
              )}
            </b>
            <small>YOUR PERSONAL ARCHIVE ↗</small>
          </div>
        </div>
        <p className="annual-footnote">
          {t(
            "同一对话可以同时具有多个状态，以上数量分别统计。",
            "One conversation can have several states. Each state is counted separately.",
          )}
        </p>
      </>
    );
  }
  if (chapter === "feedback") {
    const ratings = Object.entries(data.quality.feedback_by_rating).sort(
      (a, b) => b[1] - a[1],
    );
    const top = ratings.slice(0, 4);
    const other = ratings.slice(4).reduce((sum, [, value]) => sum + value, 0);
    const labels = new Map([
      ["thumbsUp", t("赞", "Thumbs up")],
      ["thumbsDown", t("踩", "Thumbs down")],
    ]);
    return (
      <>
        <p className="annual-lede">
          {t(
            "一次赞，一次踩，或者另一种标记。每一次反馈，都是你留下的声音。",
            "A thumbs up, a thumbs down, or another mark. Each piece of feedback was a voice from you.",
          )}
        </p>
        <div className="annual-split">
          <div className="annual-feature-number">
            <strong data-testid="story-feedback-count">
              {number(data.quality.feedback_count)}
            </strong>
            <span>{t("条已记录的反馈", "recorded feedback entries")}</span>
            <p>
              <b>{number(data.quality.conversations_with_feedback_count)}</b>{" "}
              {t("个对话留下过反馈", "conversations received feedback")}
            </p>
          </div>
          <div className="annual-receipt">
            <p>YOUR VOICE / RECEIVED</p>
            <div className="annual-receipt-mark" aria-hidden="true">
              ↗
            </div>
            <dl>
              {top.map(([key, value]) => (
                <div key={key}>
                  <dt>{labels.get(key) || key}</dt>
                  <dd>{number(value)}</dd>
                </div>
              ))}
              {other > 0 && (
                <div>
                  <dt>{t("其他反馈", "Other feedback")}</dt>
                  <dd>{number(other)}</dd>
                </div>
              )}
            </dl>
            {!ratings.length && (
              <p>
                {t(
                  "这个范围内还没有反馈记录。",
                  "No feedback was recorded in this scope.",
                )}
              </p>
            )}
            <small>
              {t(
                "每一种反馈，都有被记录。",
                "Every kind of feedback has a place.",
              )}
            </small>
          </div>
        </div>
        <p className="annual-footnote">
          {t(
            "只统计导出中已有的反馈，不推断满意度或对话质量。",
            "Based on recorded feedback only. No satisfaction or conversation-quality score is inferred.",
          )}
        </p>
      </>
    );
  }
  return null;
}
