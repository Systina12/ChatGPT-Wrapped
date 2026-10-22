import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormatter(locale: string, options?: Intl.NumberFormatOptions) {
  const key = `${locale}:${JSON.stringify(Object.entries(options || {}).sort(([a], [b]) => a.localeCompare(b)))}`;
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    if (numberFormats.size >= 64) numberFormats.clear();
    numberFormats.set(key, formatter);
  }
  return formatter;
}
export type Language = "zh" | "en";
interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (zh: string, en: string) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  date: (value: string | null | undefined, timezone?: string) => string;
}
const Context = createContext<I18n | null>(null);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("zh");
  const locale = language === "zh" ? "zh-CN" : "en-US";
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);
  const value: I18n = {
    language,
    setLanguage,
    t: (zh, en) => (language === "zh" ? zh : en),
    number: (value, options) => numberFormatter(locale, options).format(value),
    date: (value, timezone = "UTC") => {
      if (!value) return "—";
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return "—";
      return new Intl.DateTimeFormat(locale, {
        timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : timezone,
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n(): I18n {
  const context = useContext(Context);
  if (!context) throw new Error("Missing I18nProvider");
  return context;
}
