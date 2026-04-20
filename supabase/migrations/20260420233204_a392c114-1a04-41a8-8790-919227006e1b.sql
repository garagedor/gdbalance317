CREATE OR REPLACE FUNCTION public.calc_weekly_report_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _eps NUMERIC := 0.01;
  _job_before_fee NUMERIC;
  _job_card_portion NUMERIC;
  _job_cash_portion NUMERIC;
  _tip_is_card BOOLEAN;
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

  -- Tip <= total_job (since total_job may include tip)
  IF NEW.tip_amount > NEW.total_job + _eps THEN
    RAISE EXCEPTION 'tip_amount (%) cannot exceed total_job (%)', NEW.tip_amount, NEW.total_job;
  END IF;

  -- Payment-type rules: card_amount + cash_amount must equal total_job
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
  -- Tip is INCLUDED in total_job. Remove it BEFORE applying fees.
  _tip_is_card := (NEW.tip_type = 'Card');

  -- 1) Remove tip from total_job to get the pure job amount
  _job_before_fee := ROUND(NEW.total_job - NEW.tip_amount, 2);

  -- Determine the card vs cash portion of the JOB (excluding tip).
  -- card_amount/cash_amount include the tip portion; subtract the matching tip side.
  IF _tip_is_card THEN
    _job_card_portion := GREATEST(NEW.card_amount - NEW.tip_amount, 0);
    _job_cash_portion := NEW.cash_amount;
  ELSIF NEW.tip_type = 'Cash' THEN
    _job_card_portion := NEW.card_amount;
    _job_cash_portion := GREATEST(NEW.cash_amount - NEW.tip_amount, 0);
  ELSE
    _job_card_portion := NEW.card_amount;
    _job_cash_portion := NEW.cash_amount;
  END IF;

  -- Card fee diagnostics: applies to card-paid job portion + card-paid tip
  NEW.card_fee_base   := ROUND(_job_card_portion + NEW.card_tip_amount, 2);
  NEW.card_fee_amount := ROUND(NEW.card_fee_base * NEW.card_fee_rate, 2);

  -- 2) Job after fee = card-paid job * (1 - rate) + cash-paid job
  NEW.job_after_fee := ROUND(_job_card_portion * (1 - NEW.card_fee_rate) + _job_cash_portion, 2);

  -- 3) Tip net: 5% fee only if paid by card
  IF _tip_is_card THEN
    NEW.tip_net := ROUND(NEW.tip_amount * (1 - NEW.card_fee_rate), 2);
  ELSE
    NEW.tip_net := ROUND(NEW.tip_amount, 2);
  END IF;

  -- amount_before_parts = job_after_fee (tip already excluded from total_job above)
  NEW.amount_before_parts := NEW.job_after_fee;

  -- 4) Base for split = job_after_fee - my_parts - company_parts
  NEW.base_for_split := ROUND(NEW.job_after_fee - NEW.my_parts - NEW.company_parts, 2);
  NEW.base_amount    := NEW.base_for_split;

  -- 5) 30 / 70
  NEW.tech_30    := ROUND(NEW.base_for_split * 0.30, 2);
  NEW.company_70 := ROUND(NEW.base_for_split * 0.70, 2);

  -- 6) Tech payout = tech_30 + my_parts + tip_net
  NEW.tech_payout := ROUND(NEW.tech_30 + NEW.my_parts + NEW.tip_net, 2);

  -- 7) Company total = company_70 + company_parts
  NEW.company_total := ROUND(NEW.company_70 + NEW.company_parts, 2);

  -- Job balance: positive = company owes tech
  NEW.job_balance := ROUND(NEW.tech_payout - NEW.tech_cash, 2);

  RETURN NEW;
END;
$function$;

-- Force recalc of all existing jobs so totals refresh under the new formula
UPDATE public.weekly_report_jobs SET updated_at = now();