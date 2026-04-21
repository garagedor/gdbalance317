-- =========================================================
-- 1. users.area_manager_id (technician -> area manager link)
-- =========================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS area_manager_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_area_manager_id ON public.users(area_manager_id);

-- =========================================================
-- 2. weekly_reports — payout tracking columns
-- =========================================================
ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS report_sent_to_technician boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS report_sent_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount_transferred numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS payment_note text NULL,
  ADD COLUMN IF NOT EXISTS balance_direction text NOT NULL DEFAULT 'settled',
  ADD COLUMN IF NOT EXISTS balance_payment_status text NOT NULL DEFAULT 'open';

ALTER TABLE public.weekly_reports
  DROP CONSTRAINT IF EXISTS weekly_reports_balance_direction_check;
ALTER TABLE public.weekly_reports
  ADD CONSTRAINT weekly_reports_balance_direction_check
  CHECK (balance_direction IN ('company_owes_technician','technician_owes_company','settled'));

ALTER TABLE public.weekly_reports
  DROP CONSTRAINT IF EXISTS weekly_reports_balance_payment_status_check;
ALTER TABLE public.weekly_reports
  ADD CONSTRAINT weekly_reports_balance_payment_status_check
  CHECK (balance_payment_status IN ('open','partial','settled'));

ALTER TABLE public.weekly_reports
  DROP CONSTRAINT IF EXISTS weekly_reports_amount_transferred_nonneg;
ALTER TABLE public.weekly_reports
  ADD CONSTRAINT weekly_reports_amount_transferred_nonneg
  CHECK (amount_transferred >= 0);

-- =========================================================
-- 3. Helper functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_area_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND role = 'area_manager' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_technician(_manager_id uuid, _tech_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users t
    WHERE t.id = _tech_id
      AND t.role = 'technician'
      AND t.area_manager_id = _manager_id
  );
$$;

-- =========================================================
-- 4. Trigger: validate area_manager_id assignments
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_area_manager_assignment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.area_manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role <> 'technician' THEN
    RAISE EXCEPTION 'Only technicians can be assigned to an area manager';
  END IF;

  IF NEW.area_manager_id = NEW.id THEN
    RAISE EXCEPTION 'A user cannot be assigned to themselves';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = NEW.area_manager_id AND role = 'area_manager'
  ) THEN
    RAISE EXCEPTION 'area_manager_id must reference a user with role = area_manager';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_area_manager_assignment ON public.users;
CREATE TRIGGER trg_enforce_area_manager_assignment
BEFORE INSERT OR UPDATE OF area_manager_id, role ON public.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_area_manager_assignment();

-- =========================================================
-- 5. Trigger: auto-derive balance_direction & payment_status,
--    and lock financial / status fields against area managers.
-- =========================================================
CREATE OR REPLACE FUNCTION public.weekly_reports_payout_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _is_mgmt boolean := public.is_management(_actor);
  _is_am boolean := public.is_area_manager(_actor);
  _abs_balance numeric;
BEGIN
  IF NEW.net_balance > 0.005 THEN
    NEW.balance_direction := 'company_owes_technician';
  ELSIF NEW.net_balance < -0.005 THEN
    NEW.balance_direction := 'technician_owes_company';
  ELSE
    NEW.balance_direction := 'settled';
  END IF;

  _abs_balance := ABS(NEW.net_balance);

  IF TG_OP = 'INSERT'
     OR NEW.amount_transferred IS DISTINCT FROM OLD.amount_transferred
     OR NEW.net_balance        IS DISTINCT FROM OLD.net_balance
  THEN
    IF _abs_balance < 0.005 THEN
      NEW.balance_payment_status := 'settled';
    ELSIF NEW.amount_transferred < 0.005 THEN
      NEW.balance_payment_status := 'open';
    ELSIF NEW.amount_transferred + 0.005 >= _abs_balance THEN
      NEW.balance_payment_status := 'settled';
    ELSE
      NEW.balance_payment_status := 'partial';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND _is_am AND NOT _is_mgmt THEN
    IF OLD.status <> 'Approved' THEN
      RAISE EXCEPTION 'Area managers can only update reports after they are Approved';
    END IF;

    IF NOT public.manages_technician(_actor, NEW.technician_id) THEN
      RAISE EXCEPTION 'Area manager does not manage this technician';
    END IF;

    IF NEW.status        IS DISTINCT FROM OLD.status        OR
       NEW.technician_id IS DISTINCT FROM OLD.technician_id OR
       NEW.area_id       IS DISTINCT FROM OLD.area_id       OR
       NEW.week_start    IS DISTINCT FROM OLD.week_start    OR
       NEW.week_end      IS DISTINCT FROM OLD.week_end      OR
       NEW.manager_note  IS DISTINCT FROM OLD.manager_note  OR
       NEW.total_sales            IS DISTINCT FROM OLD.total_sales            OR
       NEW.total_card_amount      IS DISTINCT FROM OLD.total_card_amount      OR
       NEW.total_cash_amount      IS DISTINCT FROM OLD.total_cash_amount      OR
       NEW.total_card_tip_amount  IS DISTINCT FROM OLD.total_card_tip_amount  OR
       NEW.total_cash_tip_amount  IS DISTINCT FROM OLD.total_cash_tip_amount  OR
       NEW.total_tips             IS DISTINCT FROM OLD.total_tips             OR
       NEW.total_card_fee         IS DISTINCT FROM OLD.total_card_fee         OR
       NEW.total_my_parts         IS DISTINCT FROM OLD.total_my_parts         OR
       NEW.total_company_parts    IS DISTINCT FROM OLD.total_company_parts    OR
       NEW.total_tech_30          IS DISTINCT FROM OLD.total_tech_30          OR
       NEW.total_company_70       IS DISTINCT FROM OLD.total_company_70       OR
       NEW.tech_gross_payout      IS DISTINCT FROM OLD.tech_gross_payout      OR
       NEW.tech_cash_collected    IS DISTINCT FROM OLD.tech_cash_collected    OR
       NEW.company_cash_collected IS DISTINCT FROM OLD.company_cash_collected OR
       NEW.net_balance            IS DISTINCT FROM OLD.net_balance            OR
       NEW.tech_net_profit        IS DISTINCT FROM OLD.tech_net_profit
    THEN
      RAISE EXCEPTION 'Area managers may only update payout tracking fields';
    END IF;

    IF NEW.report_sent_to_technician IS DISTINCT FROM OLD.report_sent_to_technician
       AND NEW.report_sent_to_technician = true THEN
      NEW.report_sent_at := COALESCE(NEW.report_sent_at, now());
      NEW.report_sent_by_user_id := COALESCE(NEW.report_sent_by_user_id, _actor);
    END IF;

    IF NEW.amount_transferred IS DISTINCT FROM OLD.amount_transferred
       AND NEW.amount_transferred > 0 THEN
      NEW.payment_sent_at := COALESCE(NEW.payment_sent_at, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weekly_reports_payout_guard ON public.weekly_reports;
CREATE TRIGGER trg_weekly_reports_payout_guard
BEFORE INSERT OR UPDATE ON public.weekly_reports
FOR EACH ROW EXECUTE FUNCTION public.weekly_reports_payout_guard();

-- =========================================================
-- 6. Update status guard to forbid area_manager status changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.weekly_reports_status_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job_count INT;
  _actor UUID := auth.uid();
  _is_mgmt BOOLEAN := public.is_management(_actor);
  _is_am   BOOLEAN := public.is_area_manager(_actor);
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF _is_am AND NOT _is_mgmt THEN
    RAISE EXCEPTION 'Area managers cannot change report status';
  END IF;

  IF NOT (
       (OLD.status = 'Draft'        AND NEW.status = 'Submitted')
    OR (OLD.status = 'Submitted'    AND NEW.status IN ('Under Review','Returned','Approved'))
    OR (OLD.status = 'Under Review' AND NEW.status IN ('Returned','Approved'))
    OR (OLD.status = 'Returned'     AND NEW.status = 'Submitted')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'Approved' THEN
    RAISE EXCEPTION 'Approved reports are locked and cannot change status';
  END IF;

  IF NEW.status IN ('Under Review','Returned','Approved') THEN
    IF NOT _is_mgmt THEN
      RAISE EXCEPTION 'Only management can move a report to %', NEW.status;
    END IF;
  END IF;

  IF NEW.status = 'Submitted' THEN
    IF NOT (NEW.technician_id = _actor OR _is_mgmt) THEN
      RAISE EXCEPTION 'Only the owning technician can submit this report';
    END IF;

    SELECT COUNT(*) INTO _job_count
    FROM public.weekly_report_jobs
    WHERE weekly_report_id = NEW.id;

    IF _job_count = 0 THEN
      RAISE EXCEPTION 'Cannot submit a weekly report with zero jobs';
    END IF;

    NEW.submitted_at := now();
  END IF;

  IF NEW.status = 'Returned' THEN
    IF NEW.manager_note IS NULL OR length(btrim(NEW.manager_note)) = 0 THEN
      RAISE EXCEPTION 'Returning a report requires a manager_note';
    END IF;
    NEW.returned_at := now();
  END IF;

  IF NEW.status = 'Under Review' THEN NEW.under_review_at := now(); END IF;
  IF NEW.status = 'Approved'     THEN NEW.approved_at     := now(); END IF;

  RETURN NEW;
END;
$$;

-- =========================================================
-- 7. RLS — extend SELECT policies to include area managers
-- =========================================================
DROP POLICY IF EXISTS users_select_self_or_management ON public.users;
CREATE POLICY users_select_self_or_management
ON public.users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_management(auth.uid())
  OR (
    public.is_area_manager(auth.uid())
    AND (area_manager_id = auth.uid() OR id = auth.uid())
  )
);

DROP POLICY IF EXISTS weekly_reports_select ON public.weekly_reports;
CREATE POLICY weekly_reports_select
ON public.weekly_reports
FOR SELECT
TO authenticated
USING (
  technician_id = auth.uid()
  OR public.is_management(auth.uid())
  OR public.manages_technician(auth.uid(), technician_id)
);

DROP POLICY IF EXISTS weekly_reports_update_area_manager ON public.weekly_reports;
CREATE POLICY weekly_reports_update_area_manager
ON public.weekly_reports
FOR UPDATE
TO authenticated
USING (
  status = 'Approved'
  AND public.manages_technician(auth.uid(), technician_id)
)
WITH CHECK (
  status = 'Approved'
  AND public.manages_technician(auth.uid(), technician_id)
);

DROP POLICY IF EXISTS jobs_select ON public.weekly_report_jobs;
CREATE POLICY jobs_select
ON public.weekly_report_jobs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND (
        r.technician_id = auth.uid()
        OR public.is_management(auth.uid())
        OR public.manages_technician(auth.uid(), r.technician_id)
      )
  )
);

DROP POLICY IF EXISTS activity_select ON public.report_activity_log;
CREATE POLICY activity_select
ON public.report_activity_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = report_activity_log.weekly_report_id
      AND (
        r.technician_id = auth.uid()
        OR public.is_management(auth.uid())
        OR public.manages_technician(auth.uid(), r.technician_id)
      )
  )
);

DROP POLICY IF EXISTS activity_insert_self ON public.report_activity_log;
CREATE POLICY activity_insert_self
ON public.report_activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  action_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = report_activity_log.weekly_report_id
      AND (
        r.technician_id = auth.uid()
        OR public.is_management(auth.uid())
        OR public.manages_technician(auth.uid(), r.technician_id)
      )
  )
);

-- =========================================================
-- 8. Backfill balance_direction for existing rows
-- =========================================================
UPDATE public.weekly_reports
SET balance_direction = CASE
    WHEN net_balance >  0.005 THEN 'company_owes_technician'
    WHEN net_balance < -0.005 THEN 'technician_owes_company'
    ELSE 'settled'
  END,
  balance_payment_status = CASE
    WHEN ABS(net_balance) < 0.005 THEN 'settled'
    ELSE 'open'
  END;
