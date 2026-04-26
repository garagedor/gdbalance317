-- 1) Add a stored "company_collected_total" so all surfaces share one source of truth.
ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS company_collected_total numeric NOT NULL DEFAULT 0;

-- 2) Replace the recalc function with the unified formula.
CREATE OR REPLACE FUNCTION public.recalc_weekly_report_totals(_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.weekly_reports r
  SET
    total_sales            = COALESCE(s.total_sales, 0),
    total_card_amount      = COALESCE(s.total_card_amount, 0),
    total_cash_amount      = COALESCE(s.total_cash_amount, 0),
    total_card_tip_amount  = COALESCE(s.total_card_tip_amount, 0),
    total_cash_tip_amount  = COALESCE(s.total_cash_tip_amount, 0),
    total_tips             = COALESCE(s.total_tips, 0),
    total_card_fee         = COALESCE(s.total_card_fee, 0),
    total_my_parts         = COALESCE(s.total_my_parts, 0),
    total_company_parts    = COALESCE(s.total_company_parts, 0),
    total_tech_30          = COALESCE(s.total_tech_30, 0),
    total_company_70       = COALESCE(s.total_company_70, 0),
    tech_gross_payout      = COALESCE(s.tech_gross_payout, 0),
    tech_cash_collected    = COALESCE(s.tech_cash_collected, 0),
    company_cash_collected = COALESCE(s.company_cash_collected, 0),
    company_collected_total = COALESCE(s.company_collected_total, 0),
    -- UNIFIED FORMULA (single source of truth):
    --   tech_entitlement = commission + tech parts + tips owed to tech
    --   net_balance      = tech_entitlement − tech_cash_already_in_hand
    --     positive  ⇒ company owes technician
    --     negative  ⇒ technician owes company
    --     zero      ⇒ settled
    net_balance            = ROUND(
                               COALESCE(s.total_tech_30, 0)
                             + COALESCE(s.total_my_parts, 0)
                             + COALESCE(s.total_tips, 0)
                             - COALESCE(s.tech_cash_collected, 0)
                           , 2),
    tech_net_profit        = COALESCE(s.total_profit, 0),
    updated_at             = now()
  FROM (
    SELECT
      j.weekly_report_id,
      ROUND(SUM(j.job_total),         2) AS total_sales,
      ROUND(SUM(j.paid_card),         2) AS total_card_amount,
      ROUND(SUM(j.tech_paid_cash + j.paid_company_cash), 2) AS total_cash_amount,
      ROUND(SUM(j.tips_card + j.tips_finance),           2) AS total_card_tip_amount,
      ROUND(SUM(j.tips_company_cash + j.tips_check),     2) AS total_cash_tip_amount,
      ROUND(SUM(j.tips_total),        2) AS total_tips,
      ROUND(SUM(j.payment_fee),       2) AS total_card_fee,
      ROUND(SUM(j.tech_parts),        2) AS total_my_parts,
      ROUND(SUM(j.company_parts),     2) AS total_company_parts,
      ROUND(SUM(j.tech_payout_new),   2) AS total_tech_30,
      ROUND(SUM(j.total_profit - j.tech_payout_new), 2) AS total_company_70,
      ROUND(SUM(j.tech_payout_new),   2) AS tech_gross_payout,
      ROUND(SUM(j.cash),              2) AS tech_cash_collected,
      ROUND(SUM(j.paid_company_cash + j.paid_company_check), 2) AS company_cash_collected,
      ROUND(SUM(j.paid_card + j.paid_finance + j.paid_company_cash + j.paid_company_check), 2) AS company_collected_total,
      ROUND(SUM(j.total_profit),      2) AS total_profit
    FROM public.weekly_report_jobs j
    WHERE j.weekly_report_id = _report_id
    GROUP BY j.weekly_report_id
  ) s
  WHERE r.id = _report_id;

  IF NOT FOUND THEN
    UPDATE public.weekly_reports
    SET total_sales = 0, total_card_amount = 0, total_cash_amount = 0,
        total_card_tip_amount = 0, total_cash_tip_amount = 0, total_tips = 0,
        total_card_fee = 0, total_my_parts = 0, total_company_parts = 0,
        total_tech_30 = 0, total_company_70 = 0, tech_gross_payout = 0,
        tech_cash_collected = 0, company_cash_collected = 0,
        company_collected_total = 0,
        net_balance = 0, tech_net_profit = 0, updated_at = now()
    WHERE id = _report_id;
  END IF;
END;
$function$;

-- 3) Recompute every existing report so cached totals match the new formula.
DO $$
DECLARE _id uuid;
BEGIN
  FOR _id IN SELECT id FROM public.weekly_reports LOOP
    PERFORM public.recalc_weekly_report_totals(_id);
  END LOOP;
END $$;
