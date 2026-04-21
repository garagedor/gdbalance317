-- =========================================================================
-- PHASE 4 MIGRATION — New per-job calculation engine
-- Safe: keeps all old columns, derives payment_type/tip_type, backfills.
-- =========================================================================

-- 1. Add new input + output columns to weekly_report_jobs ----------------
ALTER TABLE public.weekly_report_jobs
  ADD COLUMN IF NOT EXISTS tech_paid_cash      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_card           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_company_cash   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_company_check  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_finance        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tech_parts          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_card           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_finance        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_company_cash   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_check          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_total           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_profit        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tech_payout_new     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash                numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance             numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_total          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_plus_tips   numeric NOT NULL DEFAULT 0;

-- 2. Same on office_jobs --------------------------------------------------
ALTER TABLE public.office_jobs
  ADD COLUMN IF NOT EXISTS tech_paid_cash      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_card           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_company_cash   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_company_check  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_finance        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tech_parts          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_card           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_finance        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_company_cash   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_check          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_total           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_profit        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tech_payout_new     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash                numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance             numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tips_total          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_plus_tips   numeric NOT NULL DEFAULT 0;

-- 3. Backfill from old fields --------------------------------------------
UPDATE public.weekly_report_jobs
SET
  paid_card         = COALESCE(card_amount, 0),
  tech_paid_cash    = COALESCE(cash_amount, 0),
  tips_card         = COALESCE(card_tip_amount, 0),
  tips_company_cash = COALESCE(cash_tip_amount, 0),
  tech_parts        = COALESCE(my_parts, 0)
WHERE tech_paid_cash = 0 AND paid_card = 0
  AND tips_card = 0 AND tips_company_cash = 0
  AND tech_parts = 0;

UPDATE public.office_jobs
SET
  paid_card         = COALESCE(card_amount, 0),
  tech_paid_cash    = COALESCE(cash_amount, 0),
  tips_card         = COALESCE(card_tip_amount, 0),
  tips_company_cash = COALESCE(cash_tip_amount, 0),
  tech_parts        = COALESCE(my_parts, 0)
WHERE tech_paid_cash = 0 AND paid_card = 0
  AND tips_card = 0 AND tips_company_cash = 0
  AND tech_parts = 0;

-- 4. NEW LOCKED CALCULATION ENGINE ---------------------------------------
-- Replaces the math in calc_weekly_report_job(). Old derived columns are
-- written to 0 (kept for backward read compatibility). payment_type and
-- tip_type are derived from the new fields.
CREATE OR REPLACE FUNCTION public.calc_weekly_report_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _rate numeric;
  _job_total numeric;
  _payment_fee numeric;
  _total_profit numeric;
  _tech_payout numeric;
  _cash numeric;
  _balance numeric;
  _tips numeric;
  _balance_plus_tips numeric;
  _new_pay public.payment_type;
  _new_tip public.tip_type;
BEGIN
  -- Snapshot commission_rate
  IF TG_OP = 'INSERT' OR NEW.commission_rate IS NULL OR NEW.commission_rate = 0 THEN
    SELECT commission_rate INTO _rate FROM public.weekly_reports WHERE id = NEW.weekly_report_id;
    NEW.commission_rate := COALESCE(_rate, 0.30);
  END IF;
  IF NEW.commission_rate < 0 OR NEW.commission_rate > 1 THEN
    RAISE EXCEPTION 'commission_rate must be between 0 and 1';
  END IF;

  -- Non-negativity on new fields
  IF NEW.tech_paid_cash      < 0 THEN RAISE EXCEPTION 'tech_paid_cash must be >= 0'; END IF;
  IF NEW.paid_card           < 0 THEN RAISE EXCEPTION 'paid_card must be >= 0'; END IF;
  IF NEW.paid_company_cash   < 0 THEN RAISE EXCEPTION 'paid_company_cash must be >= 0'; END IF;
  IF NEW.paid_company_check  < 0 THEN RAISE EXCEPTION 'paid_company_check must be >= 0'; END IF;
  IF NEW.paid_finance        < 0 THEN RAISE EXCEPTION 'paid_finance must be >= 0'; END IF;
  IF NEW.tech_parts          < 0 THEN RAISE EXCEPTION 'tech_parts must be >= 0'; END IF;
  IF NEW.company_parts       < 0 THEN RAISE EXCEPTION 'company_parts must be >= 0'; END IF;
  IF NEW.tips_card           < 0 THEN RAISE EXCEPTION 'tips_card must be >= 0'; END IF;
  IF NEW.tips_finance        < 0 THEN RAISE EXCEPTION 'tips_finance must be >= 0'; END IF;
  IF NEW.tips_company_cash   < 0 THEN RAISE EXCEPTION 'tips_company_cash must be >= 0'; END IF;
  IF NEW.tips_check          < 0 THEN RAISE EXCEPTION 'tips_check must be >= 0'; END IF;

  -- LOCKED FORMULA
  _job_total := ROUND(
      NEW.tech_paid_cash + NEW.paid_card + NEW.paid_company_cash
    + NEW.paid_company_check + NEW.paid_finance, 2);

  _payment_fee := ROUND(NEW.paid_card * 0.05, 2);

  _total_profit := ROUND(_job_total - NEW.tech_parts - NEW.company_parts - _payment_fee, 2);

  _tech_payout := ROUND(_total_profit * NEW.commission_rate, 2);

  _cash := ROUND(NEW.tech_paid_cash, 2);

  _balance := ROUND(_cash - (_tech_payout + NEW.tech_parts), 2);

  _tips := ROUND(
      NEW.tips_card * 0.95
    + NEW.tips_finance * 0.95
    + NEW.tips_company_cash
    + NEW.tips_check, 2);

  _balance_plus_tips := ROUND(_balance - _tips, 2);

  -- Write new outputs
  NEW.job_total          := _job_total;
  NEW.payment_fee        := _payment_fee;
  NEW.total_profit       := _total_profit;
  NEW.tech_payout_new    := _tech_payout;
  NEW.cash               := _cash;
  NEW.balance            := _balance;
  NEW.tips_total         := _tips;
  NEW.balance_plus_tips  := _balance_plus_tips;

  -- Derive payment_type / tip_type for downstream code that still reads them
  IF NEW.tech_paid_cash > 0 AND NEW.paid_card = 0 AND NEW.paid_company_cash = 0
     AND NEW.paid_company_check = 0 AND NEW.paid_finance = 0 THEN
    _new_pay := 'Cash';
  ELSIF NEW.paid_card > 0 AND NEW.tech_paid_cash = 0 AND NEW.paid_company_cash = 0
     AND NEW.paid_company_check = 0 AND NEW.paid_finance = 0 THEN
    _new_pay := 'Card';
  ELSE
    _new_pay := 'Split';
  END IF;

  IF NEW.tips_card > 0 OR NEW.tips_finance > 0 THEN
    _new_tip := 'Card';
  ELSIF NEW.tips_company_cash > 0 OR NEW.tips_check > 0 THEN
    _new_tip := 'Cash';
  ELSE
    _new_tip := 'None';
  END IF;

  NEW.payment_type := _new_pay;
  NEW.tip_type     := _new_tip;

  -- Mirror new outputs into the legacy "headline" columns so the rest of the
  -- app (totals, summary cards, existing reads) keeps working without code
  -- changes — they now reflect the NEW formula.
  NEW.total_job          := _job_total;
  NEW.tech_payout        := _tech_payout;
  NEW.tip_amount         := _tips;
  NEW.tip_net            := _tips;
  NEW.job_balance        := _balance;
  NEW.my_parts           := NEW.tech_parts;

  -- Mirror "raw" allocations so existing reads keep returning a sensible value.
  NEW.card_amount        := NEW.paid_card;
  NEW.cash_amount        := NEW.tech_paid_cash;
  NEW.card_tip_amount    := NEW.tips_card + NEW.tips_finance;
  NEW.cash_tip_amount    := NEW.tips_company_cash + NEW.tips_check;
  NEW.card_fee_rate      := 0.05;
  NEW.card_fee_base      := NEW.paid_card;
  NEW.card_fee_amount    := _payment_fee;

  -- Old "split" diagnostics — set to neutral values, no longer used by UI.
  NEW.job_after_fee       := _job_total - _payment_fee;
  NEW.amount_before_parts := _job_total - _payment_fee;
  NEW.base_for_split      := _total_profit;
  NEW.base_amount         := _total_profit;
  NEW.tech_30             := _tech_payout;
  NEW.company_70          := ROUND(_total_profit * (1 - NEW.commission_rate), 2);
  NEW.company_total       := ROUND(_total_profit * (1 - NEW.commission_rate) + NEW.company_parts, 2);

  RETURN NEW;
END;
$function$;

-- 5. Update weekly totals to roll up the new fields ----------------------
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
    net_balance            = COALESCE(s.tech_gross_payout, 0) - COALESCE(s.tech_cash_collected, 0),
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
        net_balance = 0, tech_net_profit = 0, updated_at = now()
    WHERE id = _report_id;
  END IF;
END;
$function$;

-- 6. Recompute every existing job + parent report totals -----------------
-- Touch each job so the new trigger fires with the (now backfilled) inputs.
UPDATE public.weekly_report_jobs SET updated_at = now();
UPDATE public.office_jobs        SET updated_at = now();

-- Refresh every weekly_reports total
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.weekly_reports LOOP
    PERFORM public.recalc_weekly_report_totals(r.id);
  END LOOP;
END$$;
