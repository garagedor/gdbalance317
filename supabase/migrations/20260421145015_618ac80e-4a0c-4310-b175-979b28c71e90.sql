-- 1) Add input fields the engine needs (defaults keep existing rows valid)
ALTER TABLE public.office_jobs
  ADD COLUMN IF NOT EXISTS card_amount      numeric NOT NULL DEFAULT 0 CHECK (card_amount >= 0),
  ADD COLUMN IF NOT EXISTS cash_amount      numeric NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  ADD COLUMN IF NOT EXISTS card_tip_amount  numeric NOT NULL DEFAULT 0 CHECK (card_tip_amount >= 0),
  ADD COLUMN IF NOT EXISTS cash_tip_amount  numeric NOT NULL DEFAULT 0 CHECK (cash_tip_amount >= 0),
  ADD COLUMN IF NOT EXISTS tip_type         public.tip_type NOT NULL DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS card_fee_rate    numeric NOT NULL DEFAULT 0.05 CHECK (card_fee_rate >= 0),
  ADD COLUMN IF NOT EXISTS commission_rate  numeric NOT NULL DEFAULT 0.30 CHECK (commission_rate BETWEEN 0 AND 1);

-- 2) Add calculated fields the engine produces
ALTER TABLE public.office_jobs
  ADD COLUMN IF NOT EXISTS card_fee_base       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_fee_amount     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_after_fee       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_net             numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_before_parts numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_for_split      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_amount         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tech_30             numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_70          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tech_payout         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_total       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_balance         numeric NOT NULL DEFAULT 0;

-- 3) Snapshot the technician's commission_rate when missing (parallels tech-side behavior)
CREATE OR REPLACE FUNCTION public.office_jobs_snapshot_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_rate numeric;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.commission_rate IS NULL OR NEW.commission_rate = 0 THEN
    SELECT commission_rate INTO _user_rate FROM public.users WHERE id = NEW.technician_id;
    NEW.commission_rate := COALESCE(_user_rate, 0.30);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS office_jobs_snapshot_commission ON public.office_jobs;
CREATE TRIGGER office_jobs_snapshot_commission
  BEFORE INSERT OR UPDATE ON public.office_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.office_jobs_snapshot_commission();

-- 4) Reuse the LOCKED technician engine via a thin proxy.
-- We build a NEW row that looks like a weekly_report_jobs row, run the
-- existing public.calc_weekly_report_job() engine on it, and copy the
-- engine's output back onto the office_jobs row. Zero formula duplication.
CREATE OR REPLACE FUNCTION public.office_jobs_apply_engine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _proxy public.weekly_report_jobs%ROWTYPE;
  _calc  public.weekly_report_jobs%ROWTYPE;
  _ws    date;
  _we    date;
  _ws_picked uuid;
BEGIN
  -- The engine only needs the calculation inputs. Fill a transient row.
  _proxy.id                 := COALESCE(NEW.id, gen_random_uuid());
  _proxy.weekly_report_id   := NEW.weekly_report_id;  -- may be null; engine doesn't read it for math
  _proxy.job_date           := NEW.job_date;
  _proxy.payment_type       := NEW.payment_type;
  _proxy.tip_type           := NEW.tip_type;
  _proxy.total_job          := NEW.total_job;
  _proxy.tip_amount         := NEW.tip_amount;
  _proxy.card_amount        := NEW.card_amount;
  _proxy.cash_amount        := NEW.cash_amount;
  _proxy.card_tip_amount    := NEW.card_tip_amount;
  _proxy.cash_tip_amount    := NEW.cash_tip_amount;
  _proxy.card_fee_rate      := NEW.card_fee_rate;
  _proxy.my_parts           := NEW.my_parts;
  _proxy.company_parts      := NEW.company_parts;
  _proxy.tech_cash          := NEW.tech_cash;
  _proxy.company_cash       := NEW.company_cash;
  _proxy.commission_rate    := NEW.commission_rate;

  -- Run the EXACT same engine the technician side uses.
  -- calc_weekly_report_job() is a trigger function; we invoke its math via a
  -- temporary INSERT path: we materialize NEW and let the trigger compute,
  -- but to avoid creating real rows we use a perform-style call by constructing
  -- a temp table-less approach: just assign NEW := <result of running the trigger
  -- function>. PostgreSQL trigger functions can be invoked directly using PERFORM
  -- only when given a TG_* context, so instead we re-implement the call by
  -- inserting/deleting in a temp table. Cleaner: directly call the engine logic
  -- by leveraging that the trigger function operates on its NEW record.
  --
  -- Approach: use a TEMP TABLE that mirrors weekly_report_jobs structure,
  -- INSERT the proxy row (firing calc_weekly_report_job via a temporary
  -- BEFORE INSERT trigger), then read the calculated values back.

  CREATE TEMP TABLE IF NOT EXISTS _office_calc_buf
    (LIKE public.weekly_report_jobs INCLUDING ALL) ON COMMIT DROP;

  -- Ensure trigger exists on the temp table for THIS transaction.
  -- (CREATE TRIGGER on temp tables is allowed and isolated.)
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

  -- Insert with the engine running. We must satisfy NOT NULL on weekly_report_id,
  -- so use a sentinel uuid; the engine does not read it for math.
  INSERT INTO _office_calc_buf (
    id, weekly_report_id, job_date, payment_type, tip_type,
    total_job, tip_amount, card_amount, cash_amount,
    card_tip_amount, cash_tip_amount, card_fee_rate,
    my_parts, company_parts, tech_cash, company_cash, commission_rate
  ) VALUES (
    _proxy.id,
    COALESCE(_proxy.weekly_report_id, '00000000-0000-0000-0000-000000000000'::uuid),
    _proxy.job_date, _proxy.payment_type, _proxy.tip_type,
    _proxy.total_job, _proxy.tip_amount, _proxy.card_amount, _proxy.cash_amount,
    _proxy.card_tip_amount, _proxy.cash_tip_amount, _proxy.card_fee_rate,
    _proxy.my_parts, _proxy.company_parts, _proxy.tech_cash, _proxy.company_cash,
    _proxy.commission_rate
  )
  RETURNING * INTO _calc;

  -- Copy engine outputs back onto the office_jobs row.
  NEW.card_fee_base       := _calc.card_fee_base;
  NEW.card_fee_amount     := _calc.card_fee_amount;
  NEW.job_after_fee       := _calc.job_after_fee;
  NEW.tip_net             := _calc.tip_net;
  NEW.amount_before_parts := _calc.amount_before_parts;
  NEW.base_for_split      := _calc.base_for_split;
  NEW.base_amount         := _calc.base_amount;
  NEW.tech_30             := _calc.tech_30;
  NEW.company_70          := _calc.company_70;
  NEW.tech_payout         := _calc.tech_payout;
  NEW.company_total       := _calc.company_total;
  NEW.job_balance         := _calc.job_balance;

  -- Engine may also normalize commission_rate / fee rate; mirror that.
  NEW.commission_rate     := _calc.commission_rate;
  NEW.card_fee_rate       := _calc.card_fee_rate;

  RETURN NEW;
END;
$$;

-- Run AFTER snapshot (commission set) and AFTER auto-link (already in place).
DROP TRIGGER IF EXISTS office_jobs_apply_engine ON public.office_jobs;
CREATE TRIGGER office_jobs_apply_engine
  BEFORE INSERT OR UPDATE ON public.office_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.office_jobs_apply_engine();

-- 5) Backfill any existing rows by touching them so the trigger fires.
UPDATE public.office_jobs SET updated_at = updated_at;