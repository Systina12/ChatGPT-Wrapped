import { useEffect, useId, useState, type FormEvent } from "react";
import { DEFAULT_OPTIONS, type ReportOptions } from "../../types/options";
import { validateOptions } from "../../lib/stats/scope";
import { useI18n } from "../../lib/report/i18n";
export function ReportControls({
  options = DEFAULT_OPTIONS,
  years = [],
  disabled,
  onApply,
}: {
  options?: ReportOptions;
  years?: string[];
  disabled: boolean;
  onApply: (options: ReportOptions) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [draft, setDraft] = useState(options),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(options);
    setError("");
  }, [options]);
  function apply(event: FormEvent) {
    event.preventDefault();
    try {
      const valid = validateOptions(draft);
      setError("");
      onApply(valid);
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <details className="feature-panel controls-panel">
      <summary>{t("统计范围与时区", "Scope & timezone")}</summary>
      {disabled && (
        <p>
          {t(
            "汇总报告没有原始数据，无法重新筛选。请导入原始 ZIP 或文件夹。",
            "This summary has no original data. Import the original ZIP or folder to filter again.",
          )}
        </p>
      )}
      <form onSubmit={apply}>
        <fieldset disabled={disabled}>
          <legend>{t("统计选项", "Report options")}</legend>
          <div className="controls-grid">
            <label htmlFor={`${id}-timezone`}>
              {t("时区", "Timezone")}
              <input
                aria-label={t("时区", "Timezone")}
                id={`${id}-timezone`}
                list={`${id}-zones`}
                value={draft.timezone}
                onChange={(e) =>
                  setDraft({ ...draft, timezone: e.target.value })
                }
              />
            </label>
            <datalist id={`${id}-zones`}>
              {[
                "UTC",
                "Asia/Shanghai",
                "Asia/Tokyo",
                "America/New_York",
                "America/Los_Angeles",
                "Europe/London",
              ].map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </datalist>
            <label htmlFor={`${id}-year`}>
              {t("年份", "Year")}
              <select
                aria-label={t("年份", "Year")}
                id={`${id}-year`}
                value={draft.year}
                onChange={(e) => setDraft({ ...draft, year: e.target.value })}
              >
                <option value="all">{t("全部年份", "All years")}</option>
                <option value="custom">
                  {t("自定义日期", "Custom dates")}
                </option>
                {[
                  ...new Set([
                    ...years,
                    ...(/^\d{4}$/.test(draft.year) ? [draft.year] : []),
                  ]),
                ].map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-start`}>
              {t("起始日期", "Start date")}
              <input
                aria-label={t("起始日期", "Start date")}
                id={`${id}-start`}
                type="date"
                value={draft.start}
                disabled={disabled || draft.year !== "custom"}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </label>
            <label htmlFor={`${id}-end`}>
              {t("结束日期", "End date")}
              <input
                aria-label={t("结束日期", "End date")}
                id={`${id}-end`}
                type="date"
                value={draft.end}
                disabled={disabled || draft.year !== "custom"}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </label>
            <label htmlFor={`${id}-roles`}>
              {t("消息角色", "Message roles")}
              <select
                aria-label={t("消息角色", "Message roles")}
                id={`${id}-roles`}
                value={draft.roles}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    roles: e.target.value as ReportOptions["roles"],
                  })
                }
              >
                <option value="user">{t("仅用户", "User only")}</option>
                <option value="dialogue">
                  {t("用户与助手", "User & assistant")}
                </option>
                <option value="all">{t("全部角色", "All roles")}</option>
              </select>
            </label>
            <label htmlFor={`${id}-branches`}>
              {t("对话分支", "Conversation branches")}
              <select
                aria-label={t("对话分支", "Conversation branches")}
                id={`${id}-branches`}
                value={draft.branches}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    branches: e.target.value as ReportOptions["branches"],
                  })
                }
              >
                <option value="current">
                  {t("当前分支", "Current branch")}
                </option>
                <option value="all">{t("全部分支", "All branches")}</option>
              </select>
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.includeGroups}
              onChange={(e) =>
                setDraft({ ...draft, includeGroups: e.target.checked })
              }
            />
            {t("包含群聊", "Include group chats")}
          </label>
          <button type="submit">{t("重新计算", "Recalculate")}</button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
