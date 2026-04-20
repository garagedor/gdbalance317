import { describe, it, expect } from "vitest";
import {
  computeJob,
  computeWeeklySummary,
  withCalculations,
  jobInputSchema,
  normalizeJob,
  type JobInput,
} from "@/lib/finance";

const baseJob = (over: Partial<JobInput> = {}): JobInput => ({
  total_job: 0,
  payment_type: "Card",
  tech_cash: 0,
  company_cash: 0,
  card_amount: 0,
  cash_amount: 0,
  tip_amount: 0,
  tip_type: "None",
  card_tip_amount: 0,
  cash_tip_amount: 0,
  card_fee_rate: 0,
  my_parts: 0,
  company_parts: 0,
  ...over,
});

describe("computeJob — Card payment, no tip, no parts", () => {
  it("splits 30/70 with card fee on full amount", () => {
    const j = baseJob({
      total_job: 1000,
      payment_type: "Card",
      card_amount: 1000,
      card_fee_rate: 0.03, // 3%
    });
    const c = computeJob(j);
    expect(c.card_fee_base).toBe(1000);
    expect(c.card_fee_amount).toBe(30);
    expect(c.base_amount).toBe(970);
    expect(c.tech_30).toBe(291);
    expect(c.company_70).toBe(679);
    expect(c.tech_payout).toBe(291); // no parts, no tip
    expect(c.company_total).toBe(679);
    expect(c.job_balance).toBe(291); // tech took no cash → company owes 291
  });
});

describe("computeJob — Cash payment, no card fee even with rate set", () => {
  it("ignores card fee when nothing was paid by card", () => {
    const j = baseJob({
      total_job: 500,
      payment_type: "Cash",
      cash_amount: 500,
      card_fee_rate: 0.03,
    });
    const c = computeJob(j);
    expect(c.card_fee_base).toBe(0);
    expect(c.card_fee_amount).toBe(0);
    expect(c.base_amount).toBe(500);
    expect(c.tech_30).toBe(150);
    expect(c.company_70).toBe(350);
  });
});

describe("computeJob — Split payment with parts", () => {
  it("only fees the card portion and reimburses my_parts to tech", () => {
    const j = baseJob({
      total_job: 800,
      payment_type: "Split",
      card_amount: 500,
      cash_amount: 300,
      card_fee_rate: 0.03,
      my_parts: 100,
      company_parts: 50,
      tech_cash: 300, // tech kept all the cash
    });
    const c = computeJob(j);
    expect(c.card_fee_base).toBe(500);
    expect(c.card_fee_amount).toBe(15);
    // base = 800 - 100 - 50 - 15 = 635
    expect(c.base_amount).toBe(635);
    expect(c.tech_30).toBe(190.5);
    expect(c.company_70).toBe(444.5);
    // tech_payout = 190.5 + 100 (parts reimb) + 0 tip = 290.5
    expect(c.tech_payout).toBe(290.5);
    expect(c.company_total).toBe(494.5);
    // tech already pocketed 300 cash, so balance = 290.5 - 300 = -9.5 (tech owes co.)
    expect(c.job_balance).toBe(-9.5);
  });
});

describe("computeJob — Card tip adds to fee base", () => {
  it("fees both card-paid job and card tip", () => {
    const j = baseJob({
      total_job: 200,
      payment_type: "Card",
      card_amount: 200,
      tip_amount: 20,
      tip_type: "Card",
      card_tip_amount: 20,
      card_fee_rate: 0.05, // 5%
    });
    const c = computeJob(j);
    expect(c.card_fee_base).toBe(220); // 200 + 20
    expect(c.card_fee_amount).toBe(11); // 220 * 0.05
    expect(c.base_amount).toBe(189); // 200 - 0 - 0 - 11
    expect(c.tech_30).toBe(56.7);
    expect(c.tech_payout).toBe(76.7); // 56.7 + 0 parts + 20 tip
  });
});

describe("computeJob — Cash tip is NOT fee-charged", () => {
  it("excludes cash tip from card_fee_base", () => {
    const j = baseJob({
      total_job: 200,
      payment_type: "Card",
      card_amount: 200,
      tip_amount: 20,
      tip_type: "Cash",
      cash_tip_amount: 20,
      card_fee_rate: 0.05,
    });
    const c = computeJob(j);
    expect(c.card_fee_base).toBe(200);
    expect(c.card_fee_amount).toBe(10);
    expect(c.tech_payout).toBe(57); // (200-10)*0.3 + 0 + 20 = 57
  });
});

describe("computeWeeklySummary", () => {
  it("rolls up totals and computes net_balance + tech_net_profit", () => {
    const a = withCalculations(
      baseJob({
        total_job: 1000,
        payment_type: "Card",
        card_amount: 1000,
        card_fee_rate: 0.03,
        my_parts: 50,
      })
    );
    const b = withCalculations(
      baseJob({
        total_job: 500,
        payment_type: "Cash",
        cash_amount: 500,
        tech_cash: 500,
        tip_amount: 20,
        tip_type: "Cash",
        cash_tip_amount: 20,
      })
    );

    const s = computeWeeklySummary([a, b]);
    expect(s.total_sales).toBe(1500);
    expect(s.total_card_amount).toBe(1000);
    expect(s.total_cash_amount).toBe(500);
    expect(s.total_tips).toBe(20);
    expect(s.total_my_parts).toBe(50);
    expect(s.tech_cash_collected).toBe(500);
    // net_balance = gross_payout - tech_cash_collected
    expect(s.net_balance).toBe(
      Math.round((a.tech_payout + b.tech_payout - 500) * 100) / 100
    );
    expect(s.tech_net_profit).toBe(
      Math.round((a.tech_payout + b.tech_payout - 50) * 100) / 100
    );
  });
});

describe("validation — payment_type rules", () => {
  it("rejects Card payment whose card_amount != total_job", () => {
    const r = jobInputSchema.safeParse({
      job_date: "2026-04-20",
      ...baseJob({ total_job: 100, payment_type: "Card", card_amount: 50 }),
    });
    expect(r.success).toBe(false);
  });

  it("accepts a Split that sums to total_job", () => {
    const r = jobInputSchema.safeParse({
      job_date: "2026-04-20",
      ...baseJob({
        total_job: 100,
        payment_type: "Split",
        card_amount: 60,
        cash_amount: 40,
      }),
    });
    expect(r.success).toBe(true);
  });
});

describe("validation — tip_type rules", () => {
  it("rejects Tip=None with non-zero tip", () => {
    const r = jobInputSchema.safeParse({
      job_date: "2026-04-20",
      ...baseJob({
        total_job: 0,
        payment_type: "Cash",
        cash_amount: 0,
        tip_type: "None",
        tip_amount: 5,
      }),
    });
    expect(r.success).toBe(false);
  });
});

describe("normalizeJob", () => {
  it("auto-fills card/cash split from payment_type", () => {
    const n = normalizeJob<Partial<JobInput>>({
      total_job: 200,
      payment_type: "Card",
    });
    expect(n.card_amount).toBe(200);
    expect(n.cash_amount).toBe(0);
  });

  it("zeros tip fields when tip_type=None", () => {
    const n = normalizeJob({
      tip_type: "None",
      tip_amount: 99,
      card_tip_amount: 50,
      cash_tip_amount: 49,
    });
    expect(n.tip_amount).toBe(0);
    expect(n.card_tip_amount).toBe(0);
    expect(n.cash_tip_amount).toBe(0);
  });
});
