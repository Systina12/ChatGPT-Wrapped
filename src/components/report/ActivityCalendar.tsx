import { useState } from "react";
import { useI18n } from "../../lib/report/i18n";

export function ActivityCalendar({
  days,
}: {
  days: { key: string; count: number }[];
}) {
  const { t, number } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="annual-calendar"
        role="img"
        tabIndex={0}
        aria-label={t(
          "最近十周的日历活动；可在下方按日期查看数值。",
          "Calendar activity in the latest ten weeks. View daily values below.",
        )}
      >
        {days.map((day) => (
          <span
            key={day.key}
            aria-hidden="true"
            data-active={day.count > 0}
            title={`${day.key}: ${number(day.count)}`}
          />
        ))}
      </div>
      <details
        className="annual-calendar-data"
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>{t("按日期查看活动", "View activity by date")}</summary>
        {open && (
          <table>
            <caption>
              {t(
                "最近十周的每日消息数",
                "Daily messages in the latest ten weeks",
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("日期", "Date")}</th>
                <th scope="col">{t("消息", "Messages")}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.key}>
                  <th scope="row">{day.key}</th>
                  <td>{number(day.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </>
  );
}
