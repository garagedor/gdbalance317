/** Display-only money formatting. Backend remains the source of truth. */
export function fmtMoney(n: number | string | null | undefined, opts?: { sign?: boolean }): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  const safe = Number.isFinite(v) ? v : 0;
  const formatted = safe.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts?.sign && safe > 0) return `+${formatted}`;
  return formatted;
}

export function fmtPct(rate: number | string | null | undefined): string {
  const v = typeof rate === "string" ? parseFloat(rate) : (rate ?? 0);
  const safe = Number.isFinite(v) ? v : 0;
  const pct = safe * 100;
  // Show up to 2 decimals, trim trailing zeros (e.g. 30 -> "30%", 32.5 -> "32.5%")
  const str = pct.toFixed(2).replace(/\.?0+$/, "");
  return `${str}%`;
}

export function moneyClass(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  if (!Number.isFinite(v) || v === 0) return "text-foreground";
  return v > 0 ? "text-money-pos" : "text-money-neg";
}

/**
 * Color class for the Balance / Balance+Tips columns.
 *
 * Accounting convention (UI only, engine numbers untouched):
 *   positive balance → technician holds excess cash → technician OWES company → RED
 *   negative balance → company collected funds for tech → company OWES technician → GREEN
 *   zero            → settled → neutral
 */
export function balanceClass(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  if (!Number.isFinite(v) || Math.abs(v) < 0.005) return "text-foreground";
  return v > 0 ? "text-money-neg" : "text-money-pos";
}
