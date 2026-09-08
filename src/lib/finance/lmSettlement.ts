/**
 * Area Manager (LM) ↔ Company settlement.
 *
 *   am_pool         = total_profit * managerProfitPct/100
 *     The AM's FULL entitlement for the period. The technician's commission is
 *     paid OUT OF this pool — it is not an extra cut on top. The AM keeps the
 *     residual (pool − technician commission).
 *
 *   lm_owes_company = lm_cash + lm_check   (at FULL face value)
 *     Money the AM collected on the Company's behalf. The private 10% LM-check
 *     deduction between AM and technician NEVER appears here.
 *
 *   company_owes_lm = am_pool + lm_parts   (parts the AM fronted are reimbursed)
 *
 *   net_lm_balance  = company_owes_lm - lm_owes_company
 *     positive  → Company pays AM
 *     negative  → AM pays Company
 *
 * Intentional double-bookkeeping: the same lm_cash + lm_check dollars are both
 * recognized as job revenue AND tracked as an AM receivable until remitted.
 */

import { r2 } from "./calcNew";

export interface LmSettlementJobInput {
  lm_cash: number;
  lm_check: number;
  lm_parts: number;
  total_profit: number;
  /** @deprecated Profit share is now recognized regardless of approval status. */
  is_approved?: boolean;
}

export interface LmSettlement {
  /** AM's total entitlement (profit × pct) — the pool the tech is paid from. */
  am_pool: number;
  lm_owes_company: number;
  company_owes_lm: number;
  net_lm_balance: number;
}

export function computeLmSettlement(
  jobs: LmSettlementJobInput[],
  managerProfitPct: number,
): LmSettlement {
  const pct = Math.max(0, Math.min(100, managerProfitPct || 0)) / 100;
  let lmOwes = 0;
  let pool = 0;
  let parts = 0;
  for (const j of jobs) {
    lmOwes += (j.lm_cash || 0) + (j.lm_check || 0);
    pool += (j.total_profit || 0) * pct;
    parts += j.lm_parts || 0;
  }
  const am_pool = r2(pool);
  const lm_owes_company = r2(lmOwes);
  const company_owes_lm = r2(am_pool + parts);
  const net_lm_balance = r2(company_owes_lm - lm_owes_company);
  return { am_pool, lm_owes_company, company_owes_lm, net_lm_balance };
}
