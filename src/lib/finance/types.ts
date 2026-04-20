// Shared finance types — mirrors public enums in the database.

export type PaymentType = "Card" | "Cash" | "Split";
export type TipType = "Cash" | "Card" | "None";
export type ReportStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Returned"
  | "Approved";

/** Default card-processing fee. Locked at 5% per current product rule. */
export const DEFAULT_CARD_FEE_RATE = 0.05;

/** Per-job INPUT fields the technician (or management) enters. */
export interface JobInput {
  total_job: number;
  payment_type: PaymentType;
  tech_cash: number;
  company_cash: number;
  card_amount: number;
  cash_amount: number;
  tip_amount: number;
  tip_type: TipType;
  card_tip_amount: number;
  cash_tip_amount: number;
  card_fee_rate: number; // e.g. 0.05 for 5%
  my_parts: number;
  company_parts: number;
}

/**
 * Per-job CALCULATED fields produced by the engine.
 *
 * Step-by-step (matches DB trigger):
 *   1. job_after_fee       = card_amount * (1 - rate) + cash_amount
 *   2. tip_net             = card_tip_amount * (1 - rate) + cash_tip_amount
 *   3. amount_before_parts = job_after_fee   (tip is NOT in total_job)
 *   4. base_for_split      = amount_before_parts - my_parts - company_parts
 *   5. tech_30 / company_70 = base_for_split * 0.30 / 0.70
 *   6. tech_payout         = tech_30 + my_parts + tip_net
 *   7. company_total       = company_70 + company_parts
 */
export interface JobCalculated {
  card_fee_base: number;
  card_fee_amount: number;
  job_after_fee: number;
  tip_net: number;
  amount_before_parts: number;
  base_for_split: number;
  /** Legacy alias — kept in sync with base_for_split for back-compat. */
  base_amount: number;
  tech_30: number;
  company_70: number;
  tech_payout: number;
  company_total: number;
  job_balance: number;
}

export type JobComputed = JobInput & JobCalculated;

/** Aggregated weekly summary produced from job rows. */
export interface WeeklySummary {
  total_sales: number;
  total_card_amount: number;
  total_cash_amount: number;
  total_card_tip_amount: number;
  total_cash_tip_amount: number;
  total_tips: number;
  total_card_fee: number;
  total_my_parts: number;
  total_company_parts: number;
  total_tech_30: number;
  total_company_70: number;
  tech_gross_payout: number;
  tech_cash_collected: number;
  company_cash_collected: number;
  net_balance: number;
  tech_net_profit: number;
}
