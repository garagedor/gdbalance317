/**
 * Week + local-date helpers.
 *
 * Backend is the canonical source of truth for week boundaries (each area has
 * its own IANA timezone and weeks are Monday→Sunday in that local zone).
 * The helpers here are display-only and for UI defaults.
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

/**
 * Returns today's date in `YYYY-MM-DD` for an IANA timezone (e.g.
 * "America/Chicago"). Falls back to the browser's local date if the timezone
 * is missing or invalid. Never uses UTC and never uses the browser's locale.
 */
export function todayInTimezone(tz?: string | null): string {
  try {
    if (tz) {
      // en-CA gives ISO-style YYYY-MM-DD output deterministically.
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return fmt.format(new Date());
    }
  } catch {
    /* fall through */
  }
  // Browser-local fallback
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Clamp a date string to the closest day inside [weekStart, weekEnd]. Useful
 * when defaulting the JobSheet's date so that the auto-suggestion always lands
 * inside the report's week (Monday → Sunday in local time).
 */
export function clampToWeek(d: string, weekStart: string, weekEnd: string): string {
  if (d < weekStart) return weekStart;
  if (d > weekEnd) return weekEnd;
  return d;
}
