/**
 * Finance calculation engine — TypeScript mirror of the Postgres triggers.
 *
 * IMPORTANT: The DATABASE is the source of truth. These functions exist so the
 * UI can show live previews while the user types. On save, the database trigger
 * recomputes everything and overrides whatever the client sent.
 *
 * RULES IMPLEMENTED HERE:
 *   - total_job does NOT include tip; tip flows 100% to the technician.
 *   - card_fee applies to the card-paid portion of BOTH the job AND the tip.
 *   - All money rounded to 2 decimals (cents).
 */

import type { JobCalculated, JobInput, JobComputed, WeeklySummary } from "./types";

/** Round to 2 decimals using banker-safe half-away-from-zero. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const TECH_SHARE = 0.3;
const COMPANY_SHARE = 0.7;

/** Compute all calculated fields for a single job row. */
export function computeJob(input: JobInput): JobCalculated {
  const card_fee_base = round2(input.card_amount + input.card_tip_amount);
  const card_fee_amount = round2(card_fee_base * input.card_fee_rate);

  const base_amount = round2(
    input.total_job - input.my_parts - input.company_parts - card_fee_amount
  );

  const tech_30 = round2(base_amount * TECH_SHARE);
  const company_70 = round2(base_amount * COMPANY_SHARE);

  // Tech receives: 30% of base + their reimbursable parts + 100% of the tip.
  const tech_payout = round2(tech_30 + input.my_parts + input.tip_amount);
  const company_total = round2(company_70 + input.company_parts);

  // Positive => company owes tech. Negative => tech owes company.
  const job_balance = round2(tech_payout - input.tech_cash);

  return {
    card_fee_base,
    card_fee_amount,
    base_amount,
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
