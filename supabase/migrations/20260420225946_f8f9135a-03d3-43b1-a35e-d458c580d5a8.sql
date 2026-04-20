-- 1) Add new derived columns (nullable→default 0, NOT NULL)
ALTER TABLE public.weekly_report_jobs
  ADD COLUMN IF NOT EXISTS job_after_fee        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_net              numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_before_parts  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_for_split       numeric NOT NULL DEFAULT 0;

-- 2) Lock default card fee at 5% for new rows. Existing rows keep their stored rate.
ALTER TABLE public.weekly_report_jobs
  ALTER COLUMN card_fee_rate SET DEFAULT 0.05;

-- 3) Replace the per-job calc trigger to populate the new fields.
--    Keeps existing payment_type / tip_type validation. Fee still applies
--    only to the card-paid portion of job + tip (per product decision).
CREATE OR REPLACE FUNCTION public.calc_weekly_report_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _eps NUMERIC := 0.01;
BEGIN
  -- Non-negativity
  IF NEW.total_job       < 0 THEN RAISE EXCEPTION 'total_job must be >= 0'; END IF;
  IF NEW.tip_amount      < 0 THEN RAISE EXCEPTION 'tip_amount must be >= 0'; END IF;
  IF NEW.my_parts        < 0 THEN RAISE EXCEPTION 'my_parts must be >= 0'; END IF;
  IF NEW.company_parts   < 0 THEN RAISE EXCEPTION 'company_parts must be >= 0'; END IF;
  IF NEW.card_fee_rate   < 0 THEN RAISE EXCEPTION 'card_fee_rate must be >= 0'; END IF;
  IF NEW.tech_cash       < 0 THEN RAISE EXCEPTION 'tech_cash must be >= 0'; END IF;
  IF NEW.company_cash    < 0 THEN RAISE EXCEPTION 'company_cash must be >= 0'; END IF;
  IF NEW.card_amount     < 0 THEN RAISE EXCEPTION 'card_amount must be >= 0'; END IF;
  IF NEW.cash_amount     < 0 THEN RAISE EXCEPTION 'cash_amount must be >= 0'; END IF;
  IF NEW.card_tip_amount < 0 THEN RAISE EXCEPTION 'card_tip_amount must be >= 0'; END IF;
  IF NEW.cash_tip_amount < 0 THEN RAISE EXCEPTION 'cash_tip_amount must be >= 0'; END IF;

  -- Payment-type rules
  IF NEW.payment_type = 'Card' THEN
    IF ABS(NEW.card_amount - NEW.total_job) > _eps THEN
      RAISE EXCEPTION 'Card payment: card_amount (%) must equal total_job (%)', NEW.card_amount, NEW.total_job;
    END IF;
    IF NEW.cash_amount <> 0 THEN RAISE EXCEPTION 'Card payment: cash_amount must be 0'; END IF;
  ELSIF NEW.payment_type = 'Cash' THEN
    IF ABS(NEW.cash_amount - NEW.total_job) > _eps THEN
      RAISE EXCEPTION 'Cash payment: cash_amount (%) must equal total_job (%)', NEW.cash_amount, NEW.total_job;
    END IF;
    IF NEW.card_amount <> 0 THEN RAISE EXCEPTION 'Cash payment: card_amount must be 0'; END IF;
  ELSIF NEW.payment_type = 'Split' THEN
    IF ABS((NEW.card_amount + NEW.cash_amount) - NEW.total_job) > _eps THEN
      RAISE EXCEPTION 'Split payment: card_amount + cash_amount (%) must equal total_job (%)',
        NEW.card_amount + NEW.cash_amount, NEW.total_job;
    END IF;
  END IF;

  -- Tip-type rules
  IF NEW.tip_type = 'Card' THEN
    IF ABS(NEW.card_tip_amount - NEW.tip_amount) > _eps THEN
      RAISE EXCEPTION 'Tip = Card: card_tip_amount (%) must equal tip_amount (%)', NEW.card_tip_amount, NEW.tip_amount;
    END IF;
    IF NEW.cash_tip_amount <> 0 THEN RAISE EXCEPTION 'Tip = Card: cash_tip_amount must be 0'; END IF;
  ELSIF NEW.tip_type = 'Cash' THEN
    IF ABS(NEW.cash_tip_amount - NEW.tip_amount) > _eps THEN
      RAISE EXCEPTION 'Tip = Cash: cash_tip_amount (%) must equal tip_amount (%)', NEW.cash_tip_amount, NEW.tip_amount;
    END IF;
    IF NEW.card_tip_amount <> 0 THEN RAISE EXCEPTION 'Tip = Cash: card_tip_amount must be 0'; END IF;
  ELSIF NEW.tip_type = 'None' THEN
    IF NEW.tip_amount <> 0 OR NEW.card_tip_amount <> 0 OR NEW.cash_tip_amount <> 0 THEN
      RAISE EXCEPTION 'Tip = None: tip_amount, card_tip_amount, cash_tip_amount must all be 0';
    END IF;
  END IF;

  -- ===== NEW STEP-BY-STEP CALCULATION =====
  -- Card fee applies only to card-paid portion of job + tip (per product rule).
  NEW.card_fee_base   := ROUND(NEW.card_amount + NEW.card_tip_amount, 2);
  NEW.card_fee_amount := ROUND(NEW.card_fee_base * NEW.card_fee_rate, 2);

  -- 1) Job after fee  = card-paid * (1 - rate)  +  cash-paid (no fee)
  NEW.job_after_fee   := ROUND(NEW.card_amount * (1 - NEW.card_fee_rate) + NEW.cash_amount, 2);

  -- 2) Tip net        = card tip * (1 - rate)   +  cash tip (no fee)
  NEW.tip_net         := ROUND(NEW.card_tip_amount * (1 - NEW.card_fee_rate) + NEW.cash_tip_amount, 2);

  -- 3) Amount before parts = job_after_fee (tip is NOT in total_job by spec, so nothing to remove)
  NEW.amount_before_parts := NEW.job_after_fee;

  -- 4) Base for split = amount_before_parts - my_parts - company_parts
  NEW.base_for_split  := ROUND(NEW.amount_before_parts - NEW.my_parts - NEW.company_parts, 2);
  NEW.base_amount     := NEW.base_for_split; -- legacy alias kept in sync

  -- 5) 30 / 70 split
  NEW.tech_30         := ROUND(NEW.base_for_split * 0.30, 2);
  NEW.company_70      := ROUND(NEW.base_for_split * 0.70, 2);

  -- 6) Tech payout    = tech_30 + my_parts + tip_net
  NEW.tech_payout     := ROUND(NEW.tech_30 + NEW.my_parts + NEW.tip_net, 2);

  -- 7) Company total  = company_70 + company_parts
  NEW.company_total   := ROUND(NEW.company_70 + NEW.company_parts, 2);

  -- Job balance: positive = company owes tech
  NEW.job_balance     := ROUND(NEW.tech_payout - NEW.tech_cash, 2);

  RETURN NEW;
END;
$function$;

-- 4) Backfill: re-run the trigger on every existing job so derived columns
--    populate and old rows match the new formula.
UPDATE public.weekly_report_jobs SET updated_at = updated_at;

-- 5) Recalc parent weekly_reports totals from the freshly updated jobs.
DO $$
DECLARE _r UUID;
BEGIN
  FOR _r IN SELECT id FROM public.weekly_reports LOOP
    PERFORM public.recalc_weekly_report_totals(_r);
  END LOOP;
END$$;