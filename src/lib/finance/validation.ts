/**
 * Zod schemas + validators that mirror the Postgres CHECK constraints
 * and the calc_weekly_report_job() trigger validation rules.
 *
 * Use these client-side BEFORE calling Supabase to fail fast with friendly
 * messages; the database will still re-validate on insert/update.
 */

import { z } from "zod";
import type { JobInput } from "./types";

const EPS = 0.01; // cent tolerance, matches DB trigger
const money = z.number({ message: "Must be a number" }).finite("Must be a finite number");
const nonNegMoney = money.min(0, "Must be >= 0");

export const jobInputSchema = z
  .object({
    job_date: z.string().min(1, "Job date is required"), // ISO yyyy-mm-dd
    customer_name: z.string().trim().max(200).optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
    payment_type: z.enum(["Card", "Cash", "Split"]),
    tip_type: z.enum(["Cash", "Card", "None"]),

    total_job: nonNegMoney,
    tech_cash: nonNegMoney,
    company_cash: nonNegMoney,
    card_amount: nonNegMoney,
    cash_amount: nonNegMoney,
    tip_amount: nonNegMoney,
    card_tip_amount: nonNegMoney,
    cash_tip_amount: nonNegMoney,
    card_fee_rate: money.min(0, "Must be >= 0").max(1, "Must be <= 1"),
    my_parts: nonNegMoney,
    company_parts: nonNegMoney,

    notes: z.string().trim().max(2000).optional().nullable(),
    source_text: z.string().trim().max(5000).optional().nullable(),
  })
  .superRefine((j, ctx) => {
    // Payment-type rules
    if (j.payment_type === "Card") {
      if (Math.abs(j.card_amount - j.total_job) > EPS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["card_amount"],
          message: "Card payment: card_amount must equal total_job",
        });
      }
      if (j.cash_amount !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cash_amount"],
          message: "Card payment: cash_amount must be 0",
        });
      }
    } else if (j.payment_type === "Cash") {
      if (Math.abs(j.cash_amount - j.total_job) > EPS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cash_amount"],
          message: "Cash payment: cash_amount must equal total_job",
        });
      }
      if (j.card_amount !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["card_amount"],
          message: "Cash payment: card_amount must be 0",
        });
      }
    } else if (j.payment_type === "Split") {
      if (Math.abs(j.card_amount + j.cash_amount - j.total_job) > EPS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["card_amount"],
          message: "Split: card_amount + cash_amount must equal total_job",
        });
      }
    }

    // Tip-type rules
    if (j.tip_type === "Card") {
      if (Math.abs(j.card_tip_amount - j.tip_amount) > EPS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["card_tip_amount"],
          message: "Tip = Card: card_tip_amount must equal tip_amount",
        });
      }
      if (j.cash_tip_amount !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cash_tip_amount"],
          message: "Tip = Card: cash_tip_amount must be 0",
        });
      }
    } else if (j.tip_type === "Cash") {
      if (Math.abs(j.cash_tip_amount - j.tip_amount) > EPS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cash_tip_amount"],
          message: "Tip = Cash: cash_tip_amount must equal tip_amount",
        });
      }
      if (j.card_tip_amount !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["card_tip_amount"],
          message: "Tip = Cash: card_tip_amount must be 0",
        });
      }
    } else if (j.tip_type === "None") {
      if (j.tip_amount !== 0 || j.card_tip_amount !== 0 || j.cash_tip_amount !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tip_amount"],
          message: "Tip = None: all tip fields must be 0",
        });
      }
    }
  });

export type ValidatedJob = z.infer<typeof jobInputSchema>;

/**
 * Normalize a job before validating: when payment_type or tip_type forces
 * specific allocations, this writes the implied values so the user doesn't
 * have to maintain them by hand.
 */
export function normalizeJob<T extends Partial<JobInput>>(j: T): T {
  const out = { ...j };

  if (out.payment_type === "Card" && typeof out.total_job === "number") {
    out.card_amount = out.total_job;
    out.cash_amount = 0;
  } else if (out.payment_type === "Cash" && typeof out.total_job === "number") {
    out.cash_amount = out.total_job;
    out.card_amount = 0;
  }

  if (out.tip_type === "None") {
    out.tip_amount = 0;
    out.card_tip_amount = 0;
    out.cash_tip_amount = 0;
  } else if (out.tip_type === "Card" && typeof out.tip_amount === "number") {
    out.card_tip_amount = out.tip_amount;
    out.cash_tip_amount = 0;
  } else if (out.tip_type === "Cash" && typeof out.tip_amount === "number") {
    out.cash_tip_amount = out.tip_amount;
    out.card_tip_amount = 0;
  }

  return out;
}
