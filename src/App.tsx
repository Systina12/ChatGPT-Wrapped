import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarDays,
  Clock3,
  Download,
  FileArchive,
  FileJson,
  FolderOpen,
  Languages,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import type { WrappedData } from "./types/wrapped";
import type { WorkerResponse } from "./workers/wrappedWorker";

type Status = "idle" | "reading" | "done" | "error";
type AnyRecord = Record<string, unknown>;
type CountItem = { key: string; count: number };

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PERIOD_LABELS: Record<string, string> = {
  late_night: "Late night",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

function App() {
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [statusText, setStatusText] = useState("Choose a ChatGPT export ZIP or folder.");
  const [data, setData] = useState<WrappedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overview = asRecord(data?.overview);
  const timeline = asRecord(data?.timeline);
  const activity = asRecord(data?.activity);
  const conversations = asRecord(data?.conversations);
  const models = asRecord(data?.models);
  const language = asRecord(data?.language);
  const frequentWords = asRecord(data?.frequent_words);
  const highlights = asRecord(data?.highlights);
  const preview = useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);

  const monthly = records(timeline.months).slice(-12);
  const hourly = counts(activity.by_hour).sort((left, right) => left.key.localeCompare(right.key));
  const weekday = counts(activity.by_weekday).sort((left, right) => Number(left.key) - Number(right.key));
  const dayPeriods = counts(activity.by_day_period);
  const modelRows = records(models.models).slice(0, 7);
  const languageRows = counts(language.message_buckets);
  const topConversations = records(conversations.longest_by_messages).slice(0, 5);
  const topWords = records(frequentWords.user).slice(0, 20);

  function run(files: File[]) {
    if (files.length === 0) {
      return;
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./workers/wrappedWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setStatus("reading");
    setStatusText(`Reading ${files.length.toLocaleString()} file${files.length > 1 ? "s" : ""} locally...`);
    setData(null);
    setError(null);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === "done") {
        setData(event.data.data);
        setStatus("done");
        setStatusText("Your local report is ready.");
        worker.terminate();
        workerRef.current = null;
      } else {
        setError(event.data.message);
        setStatus("error");
        setStatusText("Could not parse this export.");
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (event) => {
      setError(event.message || "The parser worker stopped unexpectedly.");
      setStatus("error");
      setStatusText("Could not finish reading this export.");
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({ files });
  }

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    run(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function reset() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setData(null);
    setError(null);
    setStatus("idle");
    setStatusText("Choose a ChatGPT export ZIP or folder.");
  }

  function downloadJson() {
    if (!data) {
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "chatgpt-wrapped-data.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const userMessages = number(overview.user_message_count);
  const conversationCount = number(overview.conversation_count);
  const totalCharacters = number(overview.total_character_count);
  const dateSpan = number(overview.known_days);
  const assetCount = number(asRecord(data?.assets).total_count);
  const warningCount = number(data?.meta.parse_warning_count);
  const firstSeen = formatDate(overview.first_seen_at);
  const lastSeen = formatDate(overview.last_seen_at);
  const activeHour = asRecord(activity.most_active_hour);
  const mostUsedModel = asRecord(models.most_used_model);
  const streak = asRecord(timeline.longest_active_streak);
  const activeDay = asRecord(highlights.most_active_day);

  return (
    <main className="app-shell">
      <header className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles size={15} /> ChatGPT Wrapped</p>
          <h1>Meet your ChatGPT year.</h1>
          <p className="lede">
            Turn an official ChatGPT export into a quiet, personal report about what you asked,
            when you showed up, and how your conversations grew.
          </p>
          <div className="privacy-pill">
            <ShieldCheck size={16} />
            <span>Local by design — your export never leaves this device.</span>
          </div>
        </div>
        <div className="hero-poster" aria-label="Privacy promise">
          <div className="poster-orbit poster-orbit-one" />
          <div className="poster-orbit poster-orbit-two" />
          <span className="poster-kicker">A personal archive</span>
          <strong>Make the invisible<br />patterns visible.</strong>
          <small>No account. No upload. No backend.</small>
        </div>
      </header>

      <section className={`status-band status-${status}`} aria-live="polite">
        <div className="status-copy">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>{statusText}</strong>
            {error ? <p>{error}</p> : null}
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={() => zipInputRef.current?.click()} disabled={status === "reading"}>
            <FileArchive size={17} />
            Choose ZIP
          </button>
          <button type="button" onClick={() => folderInputRef.current?.click()} disabled={status === "reading"}>
            <FolderOpen size={17} />
            Choose folder
          </button>
          {data ? (
            <button type="button" onClick={downloadJson}>
              <Download size={17} />
              Download data
            </button>
          ) : null}
          <button type="button" onClick={reset} disabled={status === "reading" && !data}>
            <RotateCcw size={17} />
            Reset
          </button>
        </div>
        <input ref={zipInputRef} className="hidden-input" type="file" accept=".zip,application/zip" onChange={onFilesSelected} />
        <input
          ref={folderInputRef}
          className="hidden-input"
          type="file"
          multiple
          onChange={onFilesSelected}
          {...{ webkitdirectory: "true" }}
        />
      </section>

      {!data ? (
        <EmptyState />
      ) : (
        <>
          <section className="report-heading">
            <div>
              <p className="eyebrow">Personal report</p>
              <h2>Here&apos;s what your archive says.</h2>
            </div>
            <p className="report-range">
              {firstSeen || "Unknown start"}
              <span aria-hidden="true">→</span>
              {lastSeen || "Unknown end"}
            </p>
          </section>

          <section className="metrics-grid" aria-label="Overview metrics">
            <MetricCard icon={<MessageCircle size={18} />} label="Conversations" value={conversationCount} />
            <MetricCard icon={<Bot size={18} />} label="Your messages" value={userMessages} />
            <MetricCard icon={<CalendarDays size={18} />} label="Date span" value={dateSpan} suffix="days" />
            <MetricCard icon={<Activity size={18} />} label="Characters" value={totalCharacters} />
            <MetricCard icon={<Languages size={18} />} label="Assets found" value={assetCount} />
            <MetricCard
              icon={<AlertTriangle size={18} />}
              label="Parse warnings"
              value={warningCount}
              tone={warningCount ? "warning" : "calm"}
            />
          </section>

          <section className="spotlight-grid">
            <article className="spotlight-card">
              <div className="spotlight-icon"><Trophy size={22} /></div>
              <div>
                <p className="eyebrow">The headline</p>
                <h2>{headline({ userMessages, conversationCount, dateSpan })}</h2>
                <p className="muted">
                  The report is computed entirely in your browser, with the raw export available only to this page.
                </p>
              </div>
            </article>
            <div className="quick-insights">
              <Insight label="Most active hour" value={formatHour(activeHour.key)} detail={`${number(activeHour.count)} messages`} />
              <Insight label="Most used model" value={modelLabel(mostUsedModel.model)} detail={`${number(mostUsedModel.message_count)} assistant messages`} />
              <Insight label="Longest active streak" value={`${number(streak.days)} days`} detail={`${text(streak.start, "No dated streak")} → ${text(streak.end, "-")}`} />
              <Insight label="Busiest day" value={formatDate(activeDay.key, { month: "short", day: "numeric", year: "numeric" }) || "Unknown"} detail={`${number(activeDay.message_count)} messages`} />
            </div>
          </section>

          <section className="chart-grid">
            <Panel title="Monthly rhythm" subtitle="Messages across the last twelve active months" icon={<Activity size={18} />}>
              {monthly.length ? (
                <div className="chart-scroll">
                  <div className="month-chart" aria-label="Monthly message counts">
                    {monthly.map((item) => (
                      <BarColumn
                        key={text(item.key)}
                        label={monthLabel(item.key)}
                        value={number(item.message_count)}
                        max={maxValue(monthly, "message_count")}
                        title={`${monthLabel(item.key)}: ${number(item.message_count).toLocaleString()} messages`}
                      />
                    ))}
                  </div>
                </div>
              ) : <EmptyChart message="No dated messages were found." />}
            </Panel>

            <Panel title="When you show up" subtitle="Message volume by hour (UTC in the export)" icon={<Clock3 size={18} />}>
              {hourly.length ? (
                <div className="chart-scroll">
                  <div className="hour-chart" aria-label="Hourly message counts">
                    {hourly.map((item) => (
                      <BarColumn
                        key={item.key}
                        label={item.key}
                        value={item.count}
                        max={maxCount(hourly)}
                        title={`${formatHour(item.key)}: ${item.count.toLocaleString()} messages`}
                      />
                    ))}
                  </div>
                </div>
              ) : <EmptyChart message="No hourly activity was found." />}
            </Panel>
          </section>

          <section className="chart-grid">
            <Panel title="Models in the room" subtitle="Assistant messages grouped by model slug" icon={<Bot size={18} />}>
              {modelRows.length ? (
                <div className="rank-list">
                  {modelRows.map((item) => (
                    <RankRow
                      key={text(item.model)}
                      label={modelLabel(item.model)}
                      value={number(item.message_count)}
                      max={maxValue(modelRows, "message_count")}
                    />
                  ))}
                </div>
              ) : <EmptyChart message="No assistant model metadata was found." />}
            </Panel>

            <Panel title="Language and time of day" subtitle="A lightweight view of how the archive reads" icon={<Languages size={18} />}>
              <div className="split-panel">
                <div>
                  <p className="mini-label">Message language buckets</p>
                  <SegmentedBar items={languageRows} palette={["violet", "blue", "mint", "amber"]} />
                  <div className="legend-list">
                    {languageRows.map((item) => (
                      <div className="legend-row" key={item.key}>
                        <span><i className={`legend-dot legend-${legendTone(item.key)}`} />{languageLabel(item.key)}</span>
                        <strong>{formatPercent(item.count, sumCounts(languageRows))}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mini-label">Day periods</p>
                  <div className="period-list">
                    {dayPeriods.length ? dayPeriods.map((item) => (
                      <RankRow
                        key={item.key}
                        label={PERIOD_LABELS[item.key] || item.key}
                        value={item.count}
                        max={maxCount(dayPeriods)}
                        compact
                      />
                    )) : <EmptyChart message="No time-of-day data." />}
                  </div>
                </div>
              </div>
              <div className="weekday-strip" aria-label="Messages by weekday">
                {DAY_LABELS.map((label, index) => {
                  const item = weekday.find((entry) => entry.key === String(index));
                  const value = item?.count || 0;
                  const opacity = value ? 0.35 + value / Math.max(maxCount(weekday), 1) * 0.65 : 0.18;
                  return <span key={label} title={`${label}: ${value.toLocaleString()} messages`} style={{ opacity }}>{label}</span>;
                })}
              </div>
            </Panel>
          </section>

          <section className="detail-grid">
            <Panel title="Conversations you stayed with" subtitle="Longest threads by message count" icon={<MessageCircle size={18} />}>
              {topConversations.length ? (
                <div className="conversation-list">
                  {topConversations.map((item, index) => (
                    <div className="conversation-row" key={`${text(item.conversation_id)}-${index}`}>
                      <span className="conversation-rank">{String(index + 1).padStart(2, "0")}</span>
                      <div className="conversation-copy">
                        <strong>{text(item.title, "Untitled conversation")}</strong>
                        <span>{formatDate(item.created_at, { month: "short", day: "numeric", year: "numeric" }) || "Unknown date"}</span>
                      </div>
                      <span className="conversation-count">{number(item.message_count).toLocaleString()} <small>msgs</small></span>
                    </div>
                  ))}
                </div>
              ) : <EmptyChart message="No conversation summaries were found." />}
            </Panel>

            <Panel title="Words that kept returning" subtitle="Frequent terms in your messages" icon={<Sparkles size={18} />}>
              {topWords.length ? (
                <div className="word-cloud" aria-label="Frequent words">
                  {topWords.map((item) => (
                    <span key={text(item.term)} style={{ fontSize: `${wordSize(number(item.count), maxValue(topWords, "count"))}rem` }} title={`${text(item.term)}: ${number(item.count)} occurrences`}>
                      {text(item.term)}
                    </span>
                  ))}
                </div>
              ) : <EmptyChart message="No frequent terms were found." />}
            </Panel>
          </section>

          <details className="raw-details">
            <summary><FileJson size={17} /> Open raw WrappedData JSON</summary>
            <pre>{preview}</pre>
          </details>

          <footer className="report-footer">
            <ShieldCheck size={16} />
            This report was generated locally from your export. Nothing was uploaded.
          </footer>
        </>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <section className="empty-state">
      <div className="empty-orb"><Sparkles size={28} /></div>
      <p className="eyebrow">Ready when you are</p>
      <h2>Your archive is still private and untouched.</h2>
      <p>Choose the ZIP file from your official ChatGPT data export, or select the extracted folder. Parsing happens in a Web Worker on this device.</p>
      <div className="steps">
        <div><span>01</span><strong>Export</strong><small>Request your data from ChatGPT.</small></div>
        <div><span>02</span><strong>Choose</strong><small>Load the ZIP or extracted folder here.</small></div>
        <div><span>03</span><strong>Explore</strong><small>Read your local report and download the JSON.</small></div>
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value, suffix, tone = "default" }: { icon: ReactNode; label: string; value: number; suffix?: string; tone?: "default" | "warning" | "calm" }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-label">{icon}<span>{label}</span></div>
      <strong>{value.toLocaleString()}</strong>
      {suffix ? <small>{suffix}</small> : null}
    </div>
  );
}

function Insight({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="insight">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Panel({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <div className="panel-title"><span className="panel-icon">{icon}</span><h3>{title}</h3></div>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function BarColumn({ label, value, max, title }: { label: string; value: number; max: number; title: string }) {
  const height = max ? Math.max((value / max) * 100, value ? 5 : 0) : 0;
  return (
    <div className="bar-column" title={title}>
      <div className="bar-track"><span style={{ height: `${height}%` }} /></div>
      <strong>{value ? compactNumber(value) : ""}</strong>
      <small>{label}</small>
    </div>
  );
}

function RankRow({ label, value, max, compact = false }: { label: string; value: number; max: number; compact?: boolean }) {
  const width = max ? Math.max((value / max) * 100, value ? 3 : 0) : 0;
  return (
    <div className={`rank-row${compact ? " rank-row-compact" : ""}`}>
      <div className="rank-label"><span>{label}</span><strong>{value.toLocaleString()}</strong></div>
      <div className="rank-track"><span style={{ width: `${width}%` }} /></div>
    </div>
  );
}

function SegmentedBar({ items, palette }: { items: CountItem[]; palette: string[] }) {
  const total = sumCounts(items);
  return (
    <div className="segmented-bar" aria-label="Language distribution">
      {items.map((item, index) => (
        <span key={item.key} className={`segment segment-${palette[index % palette.length]}`} style={{ width: `${total ? (item.count / total) * 100 : 0}%` }} title={`${languageLabel(item.key)}: ${item.count.toLocaleString()}`} />
      ))}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return <div className="empty-chart">{message}</div>;
}

function headline({ userMessages, conversationCount, dateSpan }: { userMessages: number; conversationCount: number; dateSpan: number }) {
  if (!userMessages && !conversationCount) return "A blank canvas, waiting for its first question.";
  if (dateSpan > 365) return `A year-spanning archive with ${userMessages.toLocaleString()} questions in it.`;
  if (conversationCount > 1000) return `${conversationCount.toLocaleString()} conversations made it into the archive.`;
  return `${userMessages.toLocaleString()} messages shaped this little corner of your life.`;
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function records(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((item): item is AnyRecord => Boolean(item) && typeof item === "object") : [];
}

function counts(value: unknown): CountItem[] {
  const record = asRecord(value);
  return Object.entries(record)
    .map(([key, value]) => ({ key, count: number(value) }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function number(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function text(value: unknown, fallback = "-"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatDate(value: unknown, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? new Date(value * 1000) : new Date(String(value));
  return Number.isNaN(raw.getTime()) ? null : new Intl.DateTimeFormat(undefined, options).format(raw);
}

function formatHour(value: unknown): string {
  const hour = Number.parseInt(text(value, ""), 10);
  return Number.isFinite(hour) ? `${String(hour).padStart(2, "0")}:00` : "Unknown";
}

function monthLabel(value: unknown): string {
  const key = text(value, "");
  const date = new Date(`${key}-01T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? key : new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
}

function modelLabel(value: unknown): string {
  const model = text(value, "Unknown model");
  return model.replace(/^text-/, "").replace(/[-_]/g, " ");
}

function languageLabel(value: string): string {
  return ({ chinese: "Chinese", english: "English", mixed: "Mixed", other: "Other" } as Record<string, string>)[value] || value;
}

function legendTone(value: string): string {
  return ({ chinese: "violet", english: "blue", mixed: "mint", other: "amber" } as Record<string, string>)[value] || "violet";
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function maxCount(items: CountItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.count), 0);
}

function maxValue(items: AnyRecord[], field: string): number {
  return items.reduce((max, item) => Math.max(max, number(item[field])), 0);
}

function sumCounts(items: CountItem[]): number {
  return items.reduce((total, item) => total + item.count, 0);
}

function formatPercent(value: number, total: number): string {
  return total ? `${Math.round((value / total) * 100)}%` : "0%";
}

function wordSize(value: number, max: number): number {
  if (!max) return 1.05;
  return 0.92 + (value / max) * 0.86;
}

export default App;
