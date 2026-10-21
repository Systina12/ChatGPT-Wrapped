export interface ReportOptions {
  timezone: string;
  year: "all" | "custom" | string;
  start: string;
  end: string;
  roles: "user" | "dialogue" | "all";
  branches: "current" | "all";
  includeGroups: boolean;
}
export const DEFAULT_OPTIONS: ReportOptions = {
  timezone: "UTC",
  year: "all",
  start: "",
  end: "",
  roles: "dialogue",
  branches: "current",
  includeGroups: true,
};
