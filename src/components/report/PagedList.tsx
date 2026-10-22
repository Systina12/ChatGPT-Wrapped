import { useState, type ReactNode } from "react";
import { useI18n } from "../../lib/report/i18n";

export function PagedList<T>({
  items,
  label,
  size = 25,
  children,
}: {
  items: T[];
  label: string;
  size?: number;
  children: (items: T[]) => ReactNode;
}) {
  const { t, number } = useI18n();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages - 1);
  return (
    <>
      {children(items.slice(current * size, (current + 1) * size))}
      {pages > 1 && (
        <nav
          className="list-pagination"
          aria-label={`${label} ${t("分页", "pages")}`}
        >
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            {t("上一页", "Previous page")}
          </button>
          <span role="status">
            {number(current + 1)} / {number(pages)} · {number(items.length)}{" "}
            {t("项", "items")}
          </span>
          <button
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            {t("下一页", "Next page")}
          </button>
        </nav>
      )}
    </>
  );
}
