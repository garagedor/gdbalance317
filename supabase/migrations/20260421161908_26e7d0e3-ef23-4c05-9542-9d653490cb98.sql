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
  IF TG_OP = 'INSERT' THEN
    SELECT commission_rate INTO _user_rate FROM public.users WHERE id = NEW.technician_id;
    NEW.commission_rate := COALESCE(_user_rate, NULLIF(NEW.commission_rate, 0), 0.30);
  ELSIF NEW.commission_rate IS NULL
     OR NEW.commission_rate = 0
     OR NEW.technician_id IS DISTINCT FROM OLD.technician_id
  THEN
    SELECT commission_rate INTO _user_rate FROM public.users WHERE id = NEW.technician_id;
    NEW.commission_rate := COALESCE(_user_rate, NULLIF(NEW.commission_rate, 0), 0.30);
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