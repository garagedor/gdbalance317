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

/* -------------------------------------------------------------------------- */
/*  Balance direction — single source of truth for who-owes-who.              */
/* -------------------------------------------------------------------------- */

export type BalanceDirection =
  | "COMPANY_OWES_TECH"
  | "TECH_OWES_COMPANY"
  | "SETTLED";

export interface BalanceResolution {
  /** Always non-negative. The display amount. */
  amount: number;
  /** Explicit direction — never inferred from a signed number at the UI layer. */
  direction: BalanceDirection;
  /** Ready-to-render label for management/admin/office views. */
  labelManager: string;
  /** Ready-to-render label for the technician's own views. */
  labelTechnician: string;
  /** Tone for color classes ("pos" = green, "neg" = red, "neutral" = gray). */
  tone: "pos" | "neg" | "neutral";
}

/**
 * Normalize a DB-stored direction string into our enum, if recognizable.
 */
function normalizeRawDirection(
  raw: string | null | undefined,
): BalanceDirection | null {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase();
  if (k === "company_owes_technician" || k === "company_owes_tech") return "COMPANY_OWES_TECH";
  if (k === "technician_owes_company" || k === "tech_owes_company") return "TECH_OWES_COMPANY";
  if (k === "settled" || k === "balanced" || k === "even") return "SETTLED";
  return null;
}

function buildResolution(direction: BalanceDirection, amount: number): BalanceResolution {
  if (direction === "SETTLED" || amount < 0.005) {
    return {
      amount: 0,
      direction: "SETTLED",
      labelManager: "Settled",
      labelTechnician: "Settled",
      tone: "neutral",
    };
  }
  if (direction === "COMPANY_OWES_TECH") {
    return {
      amount,
      direction: "COMPANY_OWES_TECH",
      labelManager: "Company owes technician",
      labelTechnician: "Company owes you",
      tone: "pos",
    };
  }
  return {
    amount,
    direction: "TECH_OWES_COMPANY",
    labelManager: "Technician owes company",
    labelTechnician: "You owe the company",
    tone: "neg",
  };
}

/**
 * Resolve a balance into an explicit direction + non-negative display amount.
 *
 * IMPORTANT: there are two different sign conventions in this app:
 *
 *  • Per-job `balance` (calcNew.ts and DB trigger) uses:
 *       balance = cash − (tech_payout + tech_parts)
 *       → POSITIVE means technician holds excess cash → TECH_OWES_COMPANY
 *       → NEGATIVE means company collected funds      → COMPANY_OWES_TECH
 *
 *  • Report-level `net_balance` (the aggregate stored on weekly_reports) has
 *    historically been stored with the OPPOSITE sign — the authoritative
 *    direction at the report level lives in the `balance_direction` column.
 *
 * Therefore: when calling this with a report-level number, ALWAYS pass the
 * DB `balance_direction` as the second argument. Sign inference is only
 * safe for per-job calcNew outputs.
 */
export function resolveBalance(
  net: number | string | null | undefined,
  rawDirection?: string | null,
): BalanceResolution {
  const raw = typeof net === "string" ? parseFloat(net) : (net ?? 0);
  const v = Number.isFinite(raw) ? raw : 0;
  const amount = Math.abs(v);

  // 1) If the caller gave us an explicit direction (from the DB), trust it —
  //    it is the authoritative source at the report level.
  const explicit = normalizeRawDirection(rawDirection);
  if (explicit) {
    return buildResolution(explicit, amount);
  }

  // 2) Otherwise fall back to sign inference using the per-job convention.
  if (amount < 0.005) return buildResolution("SETTLED", 0);
  if (v > 0) return buildResolution("TECH_OWES_COMPANY", amount);
  return buildResolution("COMPANY_OWES_TECH", amount);
}
