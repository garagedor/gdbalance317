/**
 * LM ↔ Company settlement math (separate accounting layer on top of per-job).
 *
 *   lm_owes_company = lm_cash + lm_check
 *     (LM collected this on Company's behalf; owes it back)
 *
 *   company_owes_lm = (approved jobs only) total_profit * managerProfitPct/100
 *                   + lm_parts
 *     (LM profit share on closed jobs + reimbursement for parts they fronted)
 *
 *   net_lm_balance  = company_owes_lm - lm_owes_company
 *     positive  → Company pays LM
 *     negative  → LM pays Company
 *
 * Intentional double-bookkeeping: same lm_cash + lm_check dollars are both
 * recognized as job revenue AND tracked as an LM receivable until remitted.
 */

import { r2 } from "./calcNew";

export interface LmSettlementJobInput {
  lm_cash: number;
  lm_check: number;
  lm_parts: number;
  total_profit: number;
  /** Whether the parent report is Approved (only approved jobs share profit). */
  is_approved: boolean;
}

export interface LmSettlement {
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
  let companyOwes = 0;
  for (const j of jobs) {
    lmOwes += (j.lm_cash || 0) + (j.lm_check || 0);
    if (j.is_approved) companyOwes += (j.total_profit || 0) * pct;
    companyOwes += j.lm_parts || 0;
  }
  const lm_owes_company = r2(lmOwes);
  const company_owes_lm = r2(companyOwes);
  const net_lm_balance = r2(company_owes_lm - lm_owes_company);
  return { lm_owes_company, company_owes_lm, net_lm_balance };
}
