import { describe, it, expect } from "vitest";
import { computeNewJob, computeLmCheckTechFee, type NewJobInput } from "@/lib/finance/calcNew";
import { computeLmSettlement } from "@/lib/finance/lmSettlement";

const base = (over: Partial<NewJobInput> = {}): NewJobInput => ({
  tech_paid_cash: 0,
  paid_card: 0,
  paid_company_cash: 0,
  paid_company_check: 0,
  paid_finance: 0,
  tech_parts: 0,
  company_parts: 0,
  tips_card: 0,
  tips_finance: 0,
  tips_company_cash: 0,
  tips_check: 0,
  commission_rate: 0.3,
  lm_cash: 0,
  lm_check: 0,
  lm_parts: 0,
  ...over,
});

describe("computeNewJob — LM fields", () => {
  it("no LM activity matches legacy totals", () => {
    const c = computeNewJob(base({ tech_paid_cash: 500 }));
    expect(c.job_total).toBe(500);
    expect(c.payment_fee).toBe(0);
    expect(c.total_profit).toBe(500);
  });

  it("lm_cash only → counted at full value, no fee", () => {
    const c = computeNewJob(base({ lm_cash: 100 }));
    expect(c.job_total).toBe(100);
    expect(c.payment_fee).toBe(0);
    expect(c.total_profit).toBe(100);
  });

  it("lm_check only → counted at full value, no fee", () => {
    const c = computeNewJob(base({ lm_check: 100 }));
    expect(c.job_total).toBe(100);
    expect(c.payment_fee).toBe(0);
    expect(c.total_profit).toBe(100);
  });

  it("lm_parts only → deducted from profit, no fee", () => {
    const c = computeNewJob(base({ tech_paid_cash: 200, lm_parts: 50 }));
    expect(c.job_total).toBe(200);
    expect(c.payment_fee).toBe(0);
    expect(c.total_profit).toBe(150);
  });

  it("combined LM fields", () => {
    const c = computeNewJob(
      base({
        paid_card: 100,
        lm_cash: 50,
        lm_check: 50,
        lm_parts: 20,
        company_parts: 10,
      }),
    );
    // job_total = 100 + 50 + 50 = 200
    expect(c.job_total).toBe(200);
    // fee = 100*0.05 = 5
    expect(c.payment_fee).toBe(5);
    // profit = 200 - 5 (fee) - 10 (company parts) - 20 (lm parts) = 165
    expect(c.total_profit).toBe(165);
  });
});

describe("computeLmSettlement", () => {
  it("AM pool is the full profit share, net subtracts LM collected at face value", () => {
    // $1,000 profit, AM 40%, one $250 LM check
    const s = computeLmSettlement(
      [{ lm_cash: 0, lm_check: 250, lm_parts: 0, total_profit: 1000 }],
      40,
    );
    expect(s.am_pool).toBe(400);
    expect(s.lm_owes_company).toBe(250);
    expect(s.company_owes_lm).toBe(400);
    expect(s.net_lm_balance).toBe(150);
  });

  it("profit share is not gated on approval and parts are reimbursed", () => {
    const s = computeLmSettlement(
      [
        { lm_cash: 50, lm_check: 0, lm_parts: 20, total_profit: 100 },
        { lm_cash: 0, lm_check: 30, lm_parts: 10, total_profit: 80 },
      ],
      40,
    );
    expect(s.lm_owes_company).toBe(80);
    expect(s.am_pool).toBe(72); // (100+80)*0.40
    expect(s.company_owes_lm).toBe(102); // 72 + 30 parts
    expect(s.net_lm_balance).toBe(22);
  });

  it("zero LM activity → pool only", () => {
    const s = computeLmSettlement(
      [{ lm_cash: 0, lm_check: 0, lm_parts: 0, total_profit: 500 }],
      40,
    );
    expect(s.lm_owes_company).toBe(0);
    expect(s.company_owes_lm).toBe(200);
    expect(s.net_lm_balance).toBe(200);
  });
});

describe("LM Check Fee — technician-only deduction", () => {
  it("does not affect job/company figures", () => {
    const c = computeNewJob(base({ lm_check: 100 }));
    expect(c.job_total).toBe(100);
    expect(c.payment_fee).toBe(0);
    expect(c.total_profit).toBe(100);
    expect(c.tech_payout).toBe(30);
  });

  it("takes exactly 10% of the LM check from the technician", () => {
    expect(computeLmCheckTechFee(100)).toBe(10);
    expect(computeLmCheckTechFee(0)).toBe(0);
    expect(computeLmCheckTechFee(33.33)).toBe(3.33);
  });
});

describe("LM check settlement ignores the technician-only 10%", () => {
  it("$100 LM check: company sees $100, tech loses $10", () => {
    const c = computeNewJob(base({ lm_check: 100 }));
    expect(c.payment_fee).toBe(0);
    const s = computeLmSettlement(
      [{ lm_cash: 0, lm_check: 100, lm_parts: 0, total_profit: c.total_profit }],
      40,
    );
    expect(s.lm_owes_company).toBe(100);
    expect(computeLmCheckTechFee(100)).toBe(10);
  });
});
