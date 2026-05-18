/**
 * NEW per-job calculation engine — TypeScript mirror of the Postgres trigger
 * `calc_weekly_report_job()` (FINAL LOCKED formula).
 *
 * The DATABASE is the source of truth. This file exists ONLY so the UI can
 * show a live preview while the user types. On save, the DB trigger
 * recomputes everything and overrides whatever the client sent.
 *
 * LOCKED FORMULA — must match DB exactly:
 *   job_total          = tech_paid_cash + paid_card + paid_company_cash
 *                      + paid_company_check + paid_finance
 *                      + lm_cash + lm_check
 *                      (tips are NOT part of job_total)
 *
 *   payment_fee        = paid_card * 0.05
 *                      + paid_finance * 0.10
 *                      + paid_company_check * 0.10
 *                      + lm_check * 0.10        // HARD RULE — always 10%
 *                      (cash, company cash, lm_cash = 0%; tips not fee'd here)
 *
 *   tips (net)         = tips_card * 0.95
 *                      + tips_finance * 0.90
 *                      + tips_check * 0.90
 *                      + tips_company_cash
 *
 *   total_profit       = job_total - tech_parts - company_parts - lm_parts - payment_fee
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
  /** Cash collected directly by the Location Manager. Counts toward job_total, no fee. */
  lm_cash?: number;
  /** Check received by the Location Manager. Counts toward job_total, no fee. */
  lm_check?: number;
  /** Parts supplied/paid by the Location Manager. Deducted from profit. */
  lm_parts?: number;
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
export const CHECK_FEE_RATE = 0.10;
export const TIPS_CARD_NET_RATE = 0.95;
export const TIPS_FINANCE_NET_RATE = 0.90;
export const TIPS_CHECK_NET_RATE = 0.90;
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
      (i.paid_finance || 0) +
      (i.lm_cash || 0) +
      (i.lm_check || 0),
  );
  // Card 5%, Finance 10%, Company Check 10%, LM Check 10% (hard rule).
  // Cash, Company Cash, and LM Cash are 0%.
  // Tips are NOT fee'd here — they are netted directly in `tips` below.
  const payment_fee = r2(
    (i.paid_card || 0) * CARD_FEE_RATE +
      (i.paid_finance || 0) * FINANCE_FEE_RATE +
      (i.paid_company_check || 0) * CHECK_FEE_RATE +
      (i.lm_check || 0) * CHECK_FEE_RATE,
  );
  const tips = r2(
    (i.tips_card || 0) * TIPS_CARD_NET_RATE +
      (i.tips_finance || 0) * TIPS_FINANCE_NET_RATE +
      (i.tips_check || 0) * TIPS_CHECK_NET_RATE +
      (i.tips_company_cash || 0),
  );
  const total_profit = r2(
    job_total - (i.tech_parts || 0) - (i.company_parts || 0) - (i.lm_parts || 0) - payment_fee,
  );
  const tech_payout = r2(total_profit * (i.commission_rate || 0));
  const cash = r2(i.tech_paid_cash || 0);
  const balance = r2(cash - (tech_payout + (i.tech_parts || 0)));
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
