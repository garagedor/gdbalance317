// Shared finance types — mirrors public enums in the database.

export type PaymentType = "Card" | "Cash" | "Split";
export type TipType = "Cash" | "Card" | "None";
export type ReportStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Returned"
  | "Approved";

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
  card_fee_rate: number; // e.g. 0.03 for 3%
  my_parts: number;
  company_parts: number;
}

/** Per-job CALCULATED fields produced by the engine. */
export interface JobCalculated {
  card_fee_base: number;
  card_fee_amount: number;
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
