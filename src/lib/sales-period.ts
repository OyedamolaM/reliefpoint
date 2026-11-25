// Sales days follow Nigeria time, independent of the browser/server timezone.
const dayMs = 86400000;
export const nigeriaDate = (now = new Date()) =>
  new Date(now.getTime() + 3600000).toISOString().slice(0, 10);
export function salesPeriod(
  params: URLSearchParams,
  now = new Date(),
): { from: string | null; to: string | null } {
  const period = params.get("period") ?? "month";
  const invalid = () => {
    throw new Error("Choose a valid sales period and date range.");
  };
  const date = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > "2100-12-31")
      return invalid();
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
      return invalid();
    return parsed;
  };
  const nigeriaMidnight = (value: Date) => new Date(value.getTime() - 3600000).toISOString();
  if (period === "all") return { from: null, to: null };
  let start: Date, end: Date;
  if (period === "month") {
    const month = params.get("month") ?? nigeriaDate(now).slice(0, 7);
    start = date(`${month}-01`);
    end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else if (period === "week") {
    start = date(params.get("week") ?? nigeriaDate(now));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end = new Date(start.getTime() + 7 * dayMs);
  } else if (period === "custom") {
    start = date(params.get("from") ?? "");
    end = date(params.get("to") ?? "");
    if (end < start) return invalid();
    end = new Date(end.getTime() + dayMs);
  } else return invalid();
  return { from: nigeriaMidnight(start), to: nigeriaMidnight(end) };
}
