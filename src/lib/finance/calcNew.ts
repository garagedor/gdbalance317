/**
 * NEW per-job calculation engine — TypeScript mirror of the Postgres trigger
 * `calc_weekly_report_job()` (Phase 4 / locked formula).
 *
 * The DATABASE is the source of truth. This file exists ONLY so the UI can
 * show a live preview while the user types. On save, the DB trigger
 * recomputes everything and overrides whatever the client sent.
 *
 * LOCKED FORMULA — must match DB exactly:
 *   job_total          = tech_paid_cash + paid_card + paid_company_cash
 *                      + paid_company_check + paid_finance
 *   standard_fee       = (paid_card + tips_card) * 0.05
 *                      + (paid_finance + tips_finance) * 0.10
 *   standard_tips      = tips_card * 0.95 + tips_finance * 0.90
 *                      + tips_company_cash + tips_check
 *
 *   For full old-system mixed rows (all five payment buckets used), the old
 *   table output applies its legacy rollup behavior:
 *     payment_fee = job_total * 0.05
 *     tips        = gross tips + (payment_fee - standard_fee)
 *                 + ((tips_card + tips_finance) * 0.15)
 *
 *   Otherwise:
 *     payment_fee = standard_fee
 *     tips        = standard_tips
 *
 *   total_profit       = job_total - tech_parts - company_parts - payment_fee
 *   tech_payout        = total_profit * commission_rate
 *   cash               = tech_paid_cash
 *   balance            = cash - (tech_payout + tech_parts)
 *   balance_plus_tips  = balance - tips
 *
 * All money rounded to 2 decimals.
 */

export interface NewJobInput {
  tech_paid_cash: number;
  paid_card: number;
  paid_company_cash: number;
  paid_company_check: number;
  paid_finance: number;
  tech_parts: number;
  company_parts: number;
  tips_card: number;
  tips_finance: number;
  tips_company_cash: number;
  tips_check: number;
  commission_rate: number;
}

export interface NewJobCalc {
  job_total: number;
  payment_fee: number;
  total_profit: number;
  tech_payout: number;
  cash: number;
  balance: number;
  tips: number;
  balance_plus_tips: number;
}

export const CARD_FEE_RATE = 0.05;
export const FINANCE_FEE_RATE = 0.10;
export const TIPS_CARD_NET_RATE = 0.95;
export const TIPS_FINANCE_NET_RATE = 0.90;
/** @deprecated use CARD_FEE_RATE */
export const NEW_PAYMENT_FEE_RATE = CARD_FEE_RATE;
export const DEFAULT_COMMISSION_RATE = 0.3;

export function r2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeNewJob(i: NewJobInput): NewJobCalc {
  const job_total = r2(
    (i.tech_paid_cash || 0) +
      (i.paid_card || 0) +
      (i.paid_company_cash || 0) +
      (i.paid_company_check || 0) +
      (i.paid_finance || 0),
  );
  const payment_fee = r2(
    ((i.paid_card || 0) + (i.tips_card || 0)) * CARD_FEE_RATE +
      ((i.paid_finance || 0) + (i.tips_finance || 0)) * FINANCE_FEE_RATE,
  );
  const total_profit = r2(
    job_total - (i.tech_parts || 0) - (i.company_parts || 0) - payment_fee,
  );
  const tech_payout = r2(total_profit * (i.commission_rate || 0));
  const cash = r2(i.tech_paid_cash || 0);
  const balance = r2(cash - (tech_payout + (i.tech_parts || 0)));
  const tips = r2(
    (i.tips_card || 0) * TIPS_CARD_NET_RATE +
      (i.tips_finance || 0) * TIPS_FINANCE_NET_RATE +
      (i.tips_company_cash || 0) +
      (i.tips_check || 0),
  );
  const balance_plus_tips = r2(balance - tips);
  return { job_total, payment_fee, total_profit, tech_payout, cash, balance, tips, balance_plus_tips };
}

/** Display helper: derive the human pay method from which paid_* fields are nonzero. */
export function derivePayMethod(i: Pick<
  NewJobInput,
  "tech_paid_cash" | "paid_card" | "paid_company_cash" | "paid_company_check" | "paid_finance"
>): "Cash" | "Card" | "Finance" | "Split" | "—" {
  const flags = [
    i.tech_paid_cash > 0 || i.paid_company_cash > 0 || i.paid_company_check > 0,
    i.paid_card > 0,
    i.paid_finance > 0,
  ];
  const count = flags.filter(Boolean).length;
  if (count === 0) return "—";
  if (count > 1) return "Split";
  if (i.paid_card > 0) return "Card";
  if (i.paid_finance > 0) return "Finance";
  return "Cash";
}
