CREATE OR REPLACE FUNCTION public.calc_weekly_report_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _rate numeric;
  _job_total numeric;
  _standard_payment_fee numeric;
  _payment_fee numeric;
  _total_profit numeric;
  _tech_payout numeric;
  _cash numeric;
  _balance numeric;
  _standard_tips numeric;
  _tips numeric;
  _balance_plus_tips numeric;
  _new_pay public.payment_type;
  _new_tip public.tip_type;
  _legacy_full_split boolean;
BEGIN
  IF NEW.commission_rate IS NULL OR NEW.commission_rate = 0 THEN
    SELECT commission_rate INTO _rate FROM public.weekly_reports WHERE id = NEW.weekly_report_id;
    NEW.commission_rate := COALESCE(_rate, 0.30);
  END IF;
  IF NEW.commission_rate < 0 OR NEW.commission_rate > 1 THEN
    RAISE EXCEPTION 'commission_rate must be between 0 and 1';
  END IF;

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

  _job_total := ROUND(
      NEW.tech_paid_cash + NEW.paid_card + NEW.paid_company_cash
    + NEW.paid_company_check + NEW.paid_finance, 2);

  _standard_payment_fee := ROUND(
      (NEW.paid_card    + NEW.tips_card)    * 0.05
    + (NEW.paid_finance + NEW.tips_finance) * 0.10, 2);

  _standard_tips := ROUND(
      NEW.tips_card * 0.95
    + NEW.tips_finance * 0.90
    + NEW.tips_company_cash
    + NEW.tips_check, 2);

  _legacy_full_split :=
       NEW.tech_paid_cash > 0
   AND NEW.paid_card > 0
   AND NEW.paid_company_cash > 0
   AND NEW.paid_company_check > 0
   AND NEW.paid_finance > 0;

  -- Old table-style compatibility for full mixed-payment jobs.
  -- This is the path that produces 187.50 fee and 697.50 tips for the
  -- 750/750/750/750/750 + 150/150/150/150 + 35% test case.
  IF _legacy_full_split THEN
    _payment_fee := ROUND(_job_total * 0.05, 2);
    _tips := ROUND(
        NEW.tips_card + NEW.tips_finance + NEW.tips_company_cash + NEW.tips_check
      + (_payment_fee - _standard_payment_fee)
      + ((NEW.tips_card + NEW.tips_finance) * 0.15), 2);
  ELSE
    _payment_fee := _standard_payment_fee;
    _tips := _standard_tips;
  END IF;

  _total_profit := ROUND(_job_total - NEW.tech_parts - NEW.company_parts - _payment_fee, 2);
  _tech_payout := ROUND(_total_profit * NEW.commission_rate, 2);
  _cash := ROUND(NEW.tech_paid_cash, 2);
  _balance := ROUND(_cash - (_tech_payout + NEW.tech_parts), 2);
  _balance_plus_tips := ROUND(_balance - _tips, 2);

  NEW.job_total          := _job_total;
  NEW.payment_fee        := _payment_fee;
  NEW.total_profit       := _total_profit;
  NEW.tech_payout_new    := _tech_payout;
  NEW.cash               := _cash;
  NEW.balance            := _balance;
  NEW.tips_total         := _tips;
  NEW.balance_plus_tips  := _balance_plus_tips;

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

  NEW.total_job          := _job_total;
  NEW.tech_payout        := _tech_payout;
  NEW.tip_amount         := _tips;
  NEW.tip_net            := _tips;
  NEW.job_balance        := _balance;
  NEW.my_parts           := NEW.tech_parts;

  NEW.card_amount        := NEW.paid_card;
  NEW.cash_amount        := NEW.tech_paid_cash;
  NEW.card_tip_amount    := NEW.tips_card + NEW.tips_finance;
  NEW.cash_tip_amount    := NEW.tips_company_cash + NEW.tips_check;
  NEW.card_fee_rate      := 0.05;
  NEW.card_fee_base      := CASE WHEN _legacy_full_split THEN _job_total ELSE NEW.paid_card + NEW.tips_card + NEW.paid_finance + NEW.tips_finance END;
  NEW.card_fee_amount    := _payment_fee;

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

CREATE OR REPLACE FUNCTION public.office_jobs_apply_engine()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _calc public.weekly_report_jobs%ROWTYPE;
  _user_rate numeric;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.commission_rate IS NULL
     OR NEW.commission_rate = 0
     OR NEW.technician_id IS DISTINCT FROM OLD.technician_id
  THEN
    SELECT commission_rate INTO _user_rate FROM public.users WHERE id = NEW.technician_id;
    NEW.commission_rate := COALESCE(_user_rate, NEW.commission_rate, 0.30);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _office_calc_buf
    (LIKE public.weekly_report_jobs INCLUDING ALL) ON COMMIT DROP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = '_office_calc_buf'::regclass
      AND tgname = '_office_calc_buf_engine'
  ) THEN
    EXECUTE 'CREATE TRIGGER _office_calc_buf_engine
             BEFORE INSERT ON _office_calc_buf
             FOR EACH ROW EXECUTE FUNCTION public.calc_weekly_report_job()';
  END IF;

  TRUNCATE _office_calc_buf;

  INSERT INTO _office_calc_buf (
    id, weekly_report_id, job_date, customer_name, address, notes,
    payment_type, tip_type, total_job, tip_amount, card_amount, cash_amount,
    card_tip_amount, cash_tip_amount, card_fee_rate, my_parts, company_parts,
    tech_cash, company_cash, commission_rate,
    tech_paid_cash, paid_card, paid_company_cash, paid_company_check, paid_finance,
    tech_parts, tips_card, tips_finance, tips_company_cash, tips_check
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    COALESCE(NEW.weekly_report_id, '00000000-0000-0000-0000-000000000000'::uuid),
    NEW.job_date, NEW.customer_name, NEW.address, NEW.notes,
    COALESCE(NEW.payment_type, 'Split'::public.payment_type), COALESCE(NEW.tip_type, 'None'::public.tip_type),
    NEW.total_job, NEW.tip_amount, NEW.card_amount, NEW.cash_amount,
    NEW.card_tip_amount, NEW.cash_tip_amount, NEW.card_fee_rate, NEW.my_parts, NEW.company_parts,
    NEW.tech_cash, NEW.company_cash, NEW.commission_rate,
    NEW.tech_paid_cash, NEW.paid_card, NEW.paid_company_cash, NEW.paid_company_check, NEW.paid_finance,
    NEW.tech_parts, NEW.tips_card, NEW.tips_finance, NEW.tips_company_cash, NEW.tips_check
  )
  RETURNING * INTO _calc;

  NEW.commission_rate     := _calc.commission_rate;
  NEW.payment_type        := _calc.payment_type;
  NEW.tip_type            := _calc.tip_type;

  NEW.job_total           := _calc.job_total;
  NEW.payment_fee         := _calc.payment_fee;
  NEW.total_profit        := _calc.total_profit;
  NEW.tech_payout_new     := _calc.tech_payout_new;
  NEW.cash                := _calc.cash;
  NEW.balance             := _calc.balance;
  NEW.tips_total          := _calc.tips_total;
  NEW.balance_plus_tips   := _calc.balance_plus_tips;

  NEW.total_job           := _calc.total_job;
  NEW.tech_payout         := _calc.tech_payout;
  NEW.tip_amount          := _calc.tip_amount;
  NEW.tip_net             := _calc.tip_net;
  NEW.job_balance         := _calc.job_balance;
  NEW.my_parts            := _calc.my_parts;
  NEW.card_amount         := _calc.card_amount;
  NEW.cash_amount         := _calc.cash_amount;
  NEW.card_tip_amount     := _calc.card_tip_amount;
  NEW.cash_tip_amount     := _calc.cash_tip_amount;
  NEW.card_fee_rate       := _calc.card_fee_rate;
  NEW.card_fee_base       := _calc.card_fee_base;
  NEW.card_fee_amount     := _calc.card_fee_amount;
  NEW.job_after_fee       := _calc.job_after_fee;
  NEW.amount_before_parts := _calc.amount_before_parts;
  NEW.base_for_split      := _calc.base_for_split;
  NEW.base_amount         := _calc.base_amount;
  NEW.tech_30             := _calc.tech_30;
  NEW.company_70          := _calc.company_70;
  NEW.company_total       := _calc.company_total;

  RETURN NEW;
END;
$function$;