/**
 * Finance calculation engine — TypeScript mirror of the Postgres trigger
 * `calc_weekly_report_job()`.
 *
 * IMPORTANT: The DATABASE is the source of truth. These functions exist so the
 * UI can show a live preview while the user types. On save, the database
 * trigger recomputes everything and overrides whatever the client sent.
 *
 * STEP-BY-STEP RULES (must match DB):
 *   1. job_after_fee       = card_amount * (1 - rate) + cash_amount
 *      (5% fee applies only to the card-paid portion of the job)
 *   2. tip_net             = card_tip_amount * (1 - rate) + cash_tip_amount
 *      (5% fee also applies to the card-paid portion of the tip)
 *   3. amount_before_parts = job_after_fee
 *      (total_job does NOT include tip per spec, so nothing to subtract)
 *   4. base_for_split      = amount_before_parts - my_parts - company_parts
 *   5. tech_30   = base_for_split * 0.30
 *      company_70 = base_for_split * 0.70
 *   6. tech_payout    = tech_30 + my_parts + tip_net
 *   7. company_total  = company_70 + company_parts
 *
 * All money rounded to 2 decimals (cents).
 */

import type { JobCalculated, JobInput, JobComputed, WeeklySummary } from "./types";

/** Round to 2 decimals using half-away-from-zero. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const DEFAULT_TECH_SHARE = 0.3;

/** Compute all calculated fields for a single job row. */
export function computeJob(input: JobInput): JobCalculated {
  const rate = input.card_fee_rate;
  const techShare =
    typeof input.commission_rate === "number" && Number.isFinite(input.commission_rate)
      ? input.commission_rate
      : DEFAULT_TECH_SHARE;
  const companyShare = 1 - techShare;
  const tipIsCard = input.tip_type === "Card";
  const tipIsCash = input.tip_type === "Cash";

  // total_job INCLUDES tip. Strip tip out of the card/cash portions of the JOB.
  const job_card_portion = tipIsCard
    ? Math.max(input.card_amount - input.tip_amount, 0)
    : input.card_amount;
  const job_cash_portion = tipIsCash
    ? Math.max(input.cash_amount - input.tip_amount, 0)
    : input.cash_amount;

  // Card-fee diagnostics: card-paid job portion + card-paid tip
  const card_fee_base = round2(job_card_portion + input.card_tip_amount);
  const card_fee_amount = round2(card_fee_base * rate);

  // 1) Job after fee = card-paid job * (1 - rate) + cash-paid job
  const job_after_fee = round2(
    job_card_portion * (1 - rate) + job_cash_portion
  );

  // 2) Tip net: 5% fee only if tip was paid by card
  const tip_net = tipIsCard
    ? round2(input.tip_amount * (1 - rate))
    : round2(input.tip_amount);

  // Amount before parts = job_after_fee (tip already removed from total_job above)
  const amount_before_parts = job_after_fee;

  // 4) Base for split
  const base_for_split = round2(
    job_after_fee - input.my_parts - input.company_parts
  );

  // 5) Tech / company split using snapshotted commission_rate
  const tech_30 = round2(base_for_split * techShare);
  const company_70 = round2(base_for_split * companyShare);

  // 6) Tech payout = 30% + own parts reimbursement + 100% of net tip
  const tech_payout = round2(tech_30 + input.my_parts + tip_net);

  // 7) Company total = 70% + company parts
  const company_total = round2(company_70 + input.company_parts);

  // Positive => company owes tech. Negative => tech owes company.
  const job_balance = round2(tech_payout - input.tech_cash);

  return {
    card_fee_base,
    card_fee_amount,
    job_after_fee,
    tip_net,
    amount_before_parts,
    base_for_split,
    base_amount: base_for_split, // legacy alias
    tech_30,
    company_70,
    tech_payout,
    company_total,
    job_balance,
  };
}

/** Convenience: input + calculated together. */
export function withCalculations(input: JobInput): JobComputed {
  return { ...input, ...computeJob(input) };
}

/** Roll up an array of jobs into the weekly summary. */
export function computeWeeklySummary(jobs: JobComputed[]): WeeklySummary {
  const sum = (sel: (j: JobComputed) => number) =>
    round2(jobs.reduce((acc, j) => acc + (sel(j) || 0), 0));

  const total_sales = sum((j) => j.total_job);
  const total_card_amount = sum((j) => j.card_amount);
  const total_cash_amount = sum((j) => j.cash_amount);
  const total_card_tip_amount = sum((j) => j.card_tip_amount);
  const total_cash_tip_amount = sum((j) => j.cash_tip_amount);
  const total_tips = sum((j) => j.tip_amount);
  const total_card_fee = sum((j) => j.card_fee_amount);
  const total_my_parts = sum((j) => j.my_parts);
  const total_company_parts = sum((j) => j.company_parts);
  const total_tech_30 = sum((j) => j.tech_30);
  const total_company_70 = sum((j) => j.company_70);
  const tech_gross_payout = sum((j) => j.tech_payout);
  const tech_cash_collected = sum((j) => j.tech_cash);
  const company_cash_collected = sum((j) => j.company_cash);

  return {
    total_sales,
    total_card_amount,
    total_cash_amount,
    total_card_tip_amount,
    total_cash_tip_amount,
    total_tips,
    total_card_fee,
    total_my_parts,
    total_company_parts,
    total_tech_30,
    total_company_70,
    tech_gross_payout,
    tech_cash_collected,
    company_cash_collected,
    net_balance: round2(tech_gross_payout - tech_cash_collected),
    tech_net_profit: round2(tech_gross_payout - total_my_parts),
  };
}
