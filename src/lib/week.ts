/**
 * Chicago-week helpers (display only). The DB owns the canonical week
 * via previous_chicago_work_week(); this just formats existing values.
 */
import { format, parseISO } from "date-fns";

export function fmtWeekRange(weekStart: string, weekEnd: string): string {
  try {
    const s = parseISO(weekStart);
    const e = parseISO(weekEnd);
    const sameMonth = s.getUTCMonth() === e.getUTCMonth();
    return sameMonth
      ? `${format(s, "MMM d")} – ${format(e, "d, yyyy")}`
      : `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
  } catch {
    return `${weekStart} – ${weekEnd}`;
  }
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(parseISO(d), "EEE, MMM d"); } catch { return d; }
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(parseISO(d), "MMM d, p"); } catch { return d; }
}
