
-- ============================================================
-- CALCULATION ENGINE & VALIDATION RULES
-- ============================================================

-- ------------------------------------------------------------
-- 1) PER-JOB VALIDATION + CALCULATION TRIGGER
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_weekly_report_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _eps NUMERIC := 0.01;  -- 1 cent tolerance for split/tip equalities
BEGIN
  -- ---------- Non-negativity (defense-in-depth; CHECKs already exist) ----------
  IF NEW.total_job      < 0 THEN RAISE EXCEPTION 'total_job must be >= 0'; END IF;
  IF NEW.tip_amount     < 0 THEN RAISE EXCEPTION 'tip_amount must be >= 0'; END IF;
  IF NEW.my_parts       < 0 THEN RAISE EXCEPTION 'my_parts must be >= 0'; END IF;
  IF NEW.company_parts  < 0 THEN RAISE EXCEPTION 'company_parts must be >= 0'; END IF;
  IF NEW.card_fee_rate  < 0 THEN RAISE EXCEPTION 'card_fee_rate must be >= 0'; END IF;
  IF NEW.tech_cash      < 0 THEN RAISE EXCEPTION 'tech_cash must be >= 0'; END IF;
  IF NEW.company_cash   < 0 THEN RAISE EXCEPTION 'company_cash must be >= 0'; END IF;
  IF NEW.card_amount    < 0 THEN RAISE EXCEPTION 'card_amount must be >= 0'; END IF;
  IF NEW.cash_amount    < 0 THEN RAISE EXCEPTION 'cash_amount must be >= 0'; END IF;
  IF NEW.card_tip_amount < 0 THEN RAISE EXCEPTION 'card_tip_amount must be >= 0'; END IF;
  IF NEW.cash_tip_amount < 0 THEN RAISE EXCEPTION 'cash_tip_amount must be >= 0'; END IF;

  -- ---------- Payment-type rules ----------
  IF NEW.payment_type = 'Card' THEN
    IF ABS(NEW.card_amount - NEW.total_job) > _eps THEN
      RAISE EXCEPTION 'Card payment: card_amount (%) must equal total_job (%)', NEW.card_amount, NEW.total_job;
    END IF;
    IF NEW.cash_amount <> 0 THEN
      RAISE EXCEPTION 'Card payment: cash_amount must be 0';
    END IF;

  ELSIF NEW.payment_type = 'Cash' THEN
    IF ABS(NEW.cash_amount - NEW.total_job) > _eps THEN
      RAISE EXCEPTION 'Cash payment: cash_amount (%) must equal total_job (%)', NEW.cash_amount, NEW.total_job;
    END IF;
    IF NEW.card_amount <> 0 THEN
      RAISE EXCEPTION 'Cash payment: card_amount must be 0';
    END IF;

  ELSIF NEW.payment_type = 'Split' THEN
    IF ABS((NEW.card_amount + NEW.cash_amount) - NEW.total_job) > _eps THEN
      RAISE EXCEPTION 'Split payment: card_amount + cash_amount (%) must equal total_job (%)',
        NEW.card_amount + NEW.cash_amount, NEW.total_job;
    END IF;
  END IF;

  -- ---------- Tip-type rules ----------
  IF NEW.tip_type = 'Card' THEN
    IF ABS(NEW.card_tip_amount - NEW.tip_amount) > _eps THEN
      RAISE EXCEPTION 'Tip = Card: card_tip_amount (%) must equal tip_amount (%)', NEW.card_tip_amount, NEW.tip_amount;
    END IF;
    IF NEW.cash_tip_amount <> 0 THEN
      RAISE EXCEPTION 'Tip = Card: cash_tip_amount must be 0';
    END IF;

  ELSIF NEW.tip_type = 'Cash' THEN
    IF ABS(NEW.cash_tip_amount - NEW.tip_amount) > _eps THEN
      RAISE EXCEPTION 'Tip = Cash: cash_tip_amount (%) must equal tip_amount (%)', NEW.cash_tip_amount, NEW.tip_amount;
    END IF;
    IF NEW.card_tip_amount <> 0 THEN
      RAISE EXCEPTION 'Tip = Cash: card_tip_amount must be 0';
    END IF;

  ELSIF NEW.tip_type = 'None' THEN
    IF NEW.tip_amount <> 0 OR NEW.card_tip_amount <> 0 OR NEW.cash_tip_amount <> 0 THEN
      RAISE EXCEPTION 'Tip = None: tip_amount, card_tip_amount, cash_tip_amount must all be 0';
    END IF;
  END IF;

  -- ---------- Calculations (single source of truth) ----------
  -- Card fee applies to card-paid job portion + card-paid tip portion only.
  NEW.card_fee_base   := ROUND(NEW.card_amount + NEW.card_tip_amount, 2);
  NEW.card_fee_amount := ROUND(NEW.card_fee_base * NEW.card_fee_rate, 2);

  -- TOTAL JOB does NOT include tip. Tip flows 100% to technician separately.
  NEW.base_amount     := ROUND(NEW.total_job - NEW.my_parts - NEW.company_parts - NEW.card_fee_amount, 2);

  NEW.tech_30         := ROUND(NEW.base_amount * 0.30, 2);
  NEW.company_70      := ROUND(NEW.base_amount * 0.70, 2);

  -- Tech gets: 30% of base + reimbursement of own parts + the entire tip
  NEW.tech_payout     := ROUND(NEW.tech_30 + NEW.my_parts + NEW.tip_amount, 2);

  NEW.company_total   := ROUND(NEW.company_70 + NEW.company_parts, 2);

  -- Positive = company owes technician; negative = technician owes company.
  NEW.job_balance     := ROUND(NEW.tech_payout - NEW.tech_cash, 2);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calc_weekly_report_job ON public.weekly_report_jobs;
CREATE TRIGGER trg_calc_weekly_report_job
BEFORE INSERT OR UPDATE ON public.weekly_report_jobs
FOR EACH ROW EXECUTE FUNCTION public.calc_weekly_report_job();

-- ------------------------------------------------------------
-- 2) WEEKLY REPORT SUMMARY ROLLUP
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_weekly_report_totals(_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    tech_net_profit        = COALESCE(s.tech_gross_payout, 0) - COALESCE(s.total_my_parts, 0),
    updated_at             = now()
  FROM (
    SELECT
      j.weekly_report_id,
      ROUND(SUM(j.total_job),        2) AS total_sales,
      ROUND(SUM(j.card_amount),      2) AS total_card_amount,
      ROUND(SUM(j.cash_amount),      2) AS total_cash_amount,
      ROUND(SUM(j.card_tip_amount),  2) AS total_card_tip_amount,
      ROUND(SUM(j.cash_tip_amount),  2) AS total_cash_tip_amount,
      ROUND(SUM(j.tip_amount),       2) AS total_tips,
      ROUND(SUM(j.card_fee_amount),  2) AS total_card_fee,
      ROUND(SUM(j.my_parts),         2) AS total_my_parts,
      ROUND(SUM(j.company_parts),    2) AS total_company_parts,
      ROUND(SUM(j.tech_30),          2) AS total_tech_30,
      ROUND(SUM(j.company_70),       2) AS total_company_70,
      ROUND(SUM(j.tech_payout),      2) AS tech_gross_payout,
      ROUND(SUM(j.tech_cash),        2) AS tech_cash_collected,
      ROUND(SUM(j.company_cash),     2) AS company_cash_collected
    FROM public.weekly_report_jobs j
    WHERE j.weekly_report_id = _report_id
    GROUP BY j.weekly_report_id
  ) s
  WHERE r.id = _report_id;

  -- If the report has zero jobs, zero everything out.
  IF NOT FOUND THEN
    UPDATE public.weekly_reports
    SET total_sales = 0, total_card_amount = 0, total_cash_amount = 0,
        total_card_tip_amount = 0, total_cash_tip_amount = 0, total_tips = 0,
        total_card_fee = 0, total_my_parts = 0, total_company_parts = 0,
        total_tech_30 = 0, total_company_70 = 0, tech_gross_payout = 0,
        tech_cash_collected = 0, company_cash_collected = 0,
        net_balance = 0, tech_net_profit = 0,
        updated_at = now()
    WHERE id = _report_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_parent_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_weekly_report_totals(OLD.weekly_report_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_weekly_report_totals(NEW.weekly_report_id);
    -- If a job was moved between reports, refresh the old parent too.
    IF TG_OP = 'UPDATE' AND OLD.weekly_report_id IS DISTINCT FROM NEW.weekly_report_id THEN
      PERFORM public.recalc_weekly_report_totals(OLD.weekly_report_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_parent_report ON public.weekly_report_jobs;
CREATE TRIGGER trg_recalc_parent_report
AFTER INSERT OR UPDATE OR DELETE ON public.weekly_report_jobs
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_parent_report();

-- ------------------------------------------------------------
-- 3) STATUS TRANSITION GUARD + LIFECYCLE TIMESTAMPS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.weekly_reports_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_count INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New reports always start as Draft (or stay whatever was set, but stamp nothing).
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Allowed transitions
  -- Draft        -> Submitted
  -- Submitted    -> Under Review | Returned | Approved
  -- Under Review -> Returned | Approved
  -- Returned     -> Submitted
  -- Approved     -> (terminal)
  IF NOT (
       (OLD.status = 'Draft'        AND NEW.status = 'Submitted')
    OR (OLD.status = 'Submitted'    AND NEW.status IN ('Under Review','Returned','Approved'))
    OR (OLD.status = 'Under Review' AND NEW.status IN ('Returned','Approved'))
    OR (OLD.status = 'Returned'     AND NEW.status = 'Submitted')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
  END IF;

  -- Block submission if report has no jobs
  IF NEW.status = 'Submitted' THEN
    SELECT COUNT(*) INTO _job_count
    FROM public.weekly_report_jobs
    WHERE weekly_report_id = NEW.id;

    IF _job_count = 0 THEN
      RAISE EXCEPTION 'Cannot submit a weekly report with zero jobs';
    END IF;

    NEW.submitted_at := now();
  END IF;

  IF NEW.status = 'Under Review' THEN NEW.under_review_at := now(); END IF;
  IF NEW.status = 'Returned'     THEN NEW.returned_at     := now(); END IF;
  IF NEW.status = 'Approved'     THEN NEW.approved_at     := now(); END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weekly_reports_status_guard ON public.weekly_reports;
CREATE TRIGGER trg_weekly_reports_status_guard
BEFORE UPDATE OF status ON public.weekly_reports
FOR EACH ROW EXECUTE FUNCTION public.weekly_reports_status_guard();

-- ------------------------------------------------------------
-- 4) PUBLIC RPC: validate a report for submission
--    Returns an array of human-readable issues (empty = valid).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_report_for_submission(_report_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _issues TEXT[] := ARRAY[]::TEXT[];
  _r public.weekly_reports%ROWTYPE;
  _job_count INT;
  _bad RECORD;
BEGIN
  SELECT * INTO _r FROM public.weekly_reports WHERE id = _report_id;
  IF NOT FOUND THEN
    RETURN ARRAY['Report not found'];
  END IF;

  -- Caller must be the owner technician or management
  IF NOT (_r.technician_id = auth.uid() OR public.is_management(auth.uid())) THEN
    RETURN ARRAY['Not authorized'];
  END IF;

  SELECT COUNT(*) INTO _job_count
  FROM public.weekly_report_jobs WHERE weekly_report_id = _report_id;

  IF _job_count = 0 THEN
    _issues := array_append(_issues, 'Report has no jobs');
  END IF;

  -- Per-job required-field checks
  FOR _bad IN
    SELECT id, job_date, customer_name, payment_type, total_job
    FROM public.weekly_report_jobs
    WHERE weekly_report_id = _report_id
      AND (job_date IS NULL OR payment_type IS NULL OR total_job IS NULL OR total_job < 0)
  LOOP
    _issues := array_append(_issues,
      format('Job %s is missing required fields (job_date, payment_type, or total_job)', _bad.id));
  END LOOP;

  RETURN _issues;
END;
$$;

-- ------------------------------------------------------------
-- 5) Backfill any existing job rows so calculated fields match
-- ------------------------------------------------------------
UPDATE public.weekly_report_jobs SET updated_at = updated_at;
