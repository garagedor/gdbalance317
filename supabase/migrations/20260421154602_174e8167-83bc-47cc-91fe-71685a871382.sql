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

  -- LOCKED FORMULA (updated fee rates: card=5%, finance=10%)
  _job_total := ROUND(
      NEW.tech_paid_cash + NEW.paid_card + NEW.paid_company_cash
    + NEW.paid_company_check + NEW.paid_finance, 2);

  _payment_fee := ROUND(NEW.paid_card * 0.05 + NEW.paid_finance * 0.10, 2);

  _total_profit := ROUND(_job_total - NEW.tech_parts - NEW.company_parts - _payment_fee, 2);

  _tech_payout := ROUND(_total_profit * NEW.commission_rate, 2);

  _cash := ROUND(NEW.tech_paid_cash, 2);

  _balance := ROUND(_cash - (_tech_payout + NEW.tech_parts), 2);

  _tips := ROUND(
      NEW.tips_card * 0.95
    + NEW.tips_finance * 0.90
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

  -- Mirror new outputs into legacy headline columns
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
  NEW.card_fee_base      := NEW.paid_card + NEW.paid_finance;
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