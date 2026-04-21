-- 1) Add commission_rate to users (default 30%)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0.30;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_commission_rate_range;
ALTER TABLE public.users
  ADD CONSTRAINT users_commission_rate_range
  CHECK (commission_rate >= 0 AND commission_rate <= 1);

-- 2) Add commission_rate to weekly_reports (snapshot at creation)
ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0.30;

ALTER TABLE public.weekly_reports
  DROP CONSTRAINT IF EXISTS weekly_reports_commission_rate_range;
ALTER TABLE public.weekly_reports
  ADD CONSTRAINT weekly_reports_commission_rate_range
  CHECK (commission_rate >= 0 AND commission_rate <= 1);

-- 3) Add commission_rate to weekly_report_jobs (snapshot per row)
ALTER TABLE public.weekly_report_jobs
  ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0.30;

ALTER TABLE public.weekly_report_jobs
  DROP CONSTRAINT IF EXISTS weekly_report_jobs_commission_rate_range;
ALTER TABLE public.weekly_report_jobs
  ADD CONSTRAINT weekly_report_jobs_commission_rate_range
  CHECK (commission_rate >= 0 AND commission_rate <= 1);

-- 4) Trigger: snapshot user's rate onto a new weekly_report
CREATE OR REPLACE FUNCTION public.snapshot_commission_rate_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_rate numeric;
BEGIN
  -- Only override if caller didn't explicitly set a non-default rate.
  -- We treat the table default (0.30) as "not explicitly set" only when
  -- the user's stored rate differs; otherwise leave NEW.commission_rate alone.
  SELECT commission_rate INTO _user_rate FROM public.users WHERE id = NEW.technician_id;
  IF _user_rate IS NOT NULL THEN
    -- Always snapshot from user on insert (single source of truth at creation time)
    NEW.commission_rate := _user_rate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_commission_on_report ON public.weekly_reports;
CREATE TRIGGER trg_snapshot_commission_on_report
  BEFORE INSERT ON public.weekly_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_commission_rate_on_report();

-- 5) Update calc_weekly_report_job to copy rate from parent report and use it for the split
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
  _rate NUMERIC;
  _company_share NUMERIC;
BEGIN
  -- Snapshot commission_rate from parent report on INSERT (or if zero/null)
  IF TG_OP = 'INSERT' OR NEW.commission_rate IS NULL OR NEW.commission_rate = 0 THEN
    SELECT commission_rate INTO _rate FROM public.weekly_reports WHERE id = NEW.weekly_report_id;
    NEW.commission_rate := COALESCE(_rate, 0.30);
  END IF;

  IF NEW.commission_rate < 0 OR NEW.commission_rate > 1 THEN
    RAISE EXCEPTION 'commission_rate must be between 0 and 1';
  END IF;

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

  IF NEW.tip_amount > NEW.total_job + _eps THEN
    RAISE EXCEPTION 'tip_amount (%) cannot exceed total_job (%)', NEW.tip_amount, NEW.total_job;
  END IF;

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

  _tip_is_card := (NEW.tip_type = 'Card');
  _job_before_fee := ROUND(NEW.total_job - NEW.tip_amount, 2);

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

  NEW.card_fee_base   := ROUND(_job_card_portion + NEW.card_tip_amount, 2);
  NEW.card_fee_amount := ROUND(NEW.card_fee_base * NEW.card_fee_rate, 2);

  NEW.job_after_fee := ROUND(_job_card_portion * (1 - NEW.card_fee_rate) + _job_cash_portion, 2);

  IF _tip_is_card THEN
    NEW.tip_net := ROUND(NEW.tip_amount * (1 - NEW.card_fee_rate), 2);
  ELSE
    NEW.tip_net := ROUND(NEW.tip_amount, 2);
  END IF;

  NEW.amount_before_parts := NEW.job_after_fee;
  NEW.base_for_split := ROUND(NEW.job_after_fee - NEW.my_parts - NEW.company_parts, 2);
  NEW.base_amount    := NEW.base_for_split;

  -- Use snapshotted commission_rate instead of hardcoded 0.30 / 0.70
  _company_share := 1 - NEW.commission_rate;
  NEW.tech_30    := ROUND(NEW.base_for_split * NEW.commission_rate, 2);
  NEW.company_70 := ROUND(NEW.base_for_split * _company_share, 2);

  NEW.tech_payout := ROUND(NEW.tech_30 + NEW.my_parts + NEW.tip_net, 2);
  NEW.company_total := ROUND(NEW.company_70 + NEW.company_parts, 2);
  NEW.job_balance := ROUND(NEW.tech_payout - NEW.tech_cash, 2);

  RETURN NEW;
END;
$function$;

-- 6) Update open_weekly_reports_for_previous_week to snapshot rate
CREATE OR REPLACE FUNCTION public.open_weekly_reports_for_previous_week()
 RETURNS TABLE(created_report_id uuid, technician_id uuid, week_start date, week_end date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ws DATE;
  _we DATE;
BEGIN
  SELECT w.week_start, w.week_end
    INTO _ws, _we
  FROM public.previous_chicago_work_week() w;

  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.weekly_reports
      (technician_id, area_id, week_start, week_end, opens_at, status, commission_rate)
    SELECT
      u.id,
      u.area_id,
      _ws,
      _we,
      now(),
      'Draft'::public.report_status,
      u.commission_rate
    FROM public.users u
    WHERE u.role = 'technician'
      AND u.is_active = true
      AND u.area_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_reports r
        WHERE r.technician_id = u.id
          AND r.week_start = _ws
      )
    RETURNING
      weekly_reports.id            AS created_report_id,
      weekly_reports.technician_id AS technician_id,
      weekly_reports.week_start    AS week_start,
      weekly_reports.week_end      AS week_end
  )
  SELECT ins.created_report_id, ins.technician_id, ins.week_start, ins.week_end
  FROM ins;
END;
$function$;
