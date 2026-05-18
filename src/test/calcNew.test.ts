import { describe, it, expect } from "vitest";
import { computeNewJob, type NewJobInput } from "@/lib/finance/calcNew";
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

  it("lm_check only → 10% fee applied", () => {
    const c = computeNewJob(base({ lm_check: 100 }));
    expect(c.job_total).toBe(100);
    expect(c.payment_fee).toBe(10);
    expect(c.total_profit).toBe(90);
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
    // fee = 100*0.05 + 50*0.10 = 5 + 5 = 10
    expect(c.payment_fee).toBe(10);
    // profit = 200 - 10 (fee) - 10 (company parts) - 20 (lm parts) = 160
    expect(c.total_profit).toBe(160);
  });
});

describe("computeLmSettlement", () => {
  it("computes net balance per spec", () => {
    const s = computeLmSettlement(
      [
        // Approved job: profit 100, lm_cash 50, lm_parts 20
        { lm_cash: 50, lm_check: 0, lm_parts: 20, total_profit: 100, is_approved: true },
        // Draft job: profit ignored, lm_check 30, lm_parts 10
        { lm_cash: 0, lm_check: 30, lm_parts: 10, total_profit: 80, is_approved: false },
      ],
      40,
    );
    // lm_owes = 50 + 30 = 80
    expect(s.lm_owes_company).toBe(80);
    // company_owes = 100*0.40 (approved) + 20 + 10 = 70
    expect(s.company_owes_lm).toBe(70);
    // net = 70 - 80 = -10 (LM pays Company)
    expect(s.net_lm_balance).toBe(-10);
  });

  it("zero LM activity → zeroed settlement", () => {
    const s = computeLmSettlement(
      [{ lm_cash: 0, lm_check: 0, lm_parts: 0, total_profit: 500, is_approved: true }],
      40,
    );
    expect(s.lm_owes_company).toBe(0);
    expect(s.company_owes_lm).toBe(200); // 500*0.40
    expect(s.net_lm_balance).toBe(200);
  });
});
