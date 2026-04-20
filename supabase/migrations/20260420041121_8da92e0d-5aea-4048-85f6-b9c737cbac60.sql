
-- ============================================================
-- WORKFLOW, PERMISSIONS & AUTOMATION
-- ============================================================

-- ------------------------------------------------------------
-- 1) STATUS GUARD v2 — require manager_note on Return,
--    require manager identity on review actions, auto-log changes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.weekly_reports_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job_count INT;
  _actor UUID := auth.uid();
  _is_mgmt BOOLEAN := public.is_management(_actor);
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Allowed transitions
  IF NOT (
       (OLD.status = 'Draft'        AND NEW.status = 'Submitted')
    OR (OLD.status = 'Submitted'    AND NEW.status IN ('Under Review','Returned','Approved'))
    OR (OLD.status = 'Under Review' AND NEW.status IN ('Returned','Approved'))
    OR (OLD.status = 'Returned'     AND NEW.status = 'Submitted')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
  END IF;

  -- Approved is terminal (extra guard — already covered above, but explicit)
  IF OLD.status = 'Approved' THEN
    RAISE EXCEPTION 'Approved reports are locked and cannot change status';
  END IF;

  -- Role gates for transitions
  IF NEW.status IN ('Under Review','Returned','Approved') THEN
    IF NOT _is_mgmt THEN
      RAISE EXCEPTION 'Only management can move a report to %', NEW.status;
    END IF;
  END IF;

  IF NEW.status = 'Submitted' THEN
    -- Only the owning technician (or management acting on their behalf) may submit.
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

  -- Mandatory manager_note when returning a report
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

-- AFTER trigger: append an activity log row for every status change.
CREATE OR REPLACE FUNCTION public.log_weekly_report_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND _actor IS NOT NULL THEN
    INSERT INTO public.report_activity_log
      (weekly_report_id, action_type, action_by_user_id, note)
    VALUES
      (NEW.id,
       'status:' || NEW.status::text,
       _actor,
       CASE WHEN NEW.status = 'Returned' THEN NEW.manager_note ELSE NULL END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_weekly_report_status ON public.weekly_reports;
CREATE TRIGGER trg_log_weekly_report_status
AFTER UPDATE OF status ON public.weekly_reports
FOR EACH ROW EXECUTE FUNCTION public.log_weekly_report_status_change();

-- ------------------------------------------------------------
-- 2) CHICAGO-WEEK HELPER
--    Returns previous *completed* Mon–Sun work week in America/Chicago.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.previous_chicago_work_week(_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (week_start DATE, week_end DATE)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _today_chi DATE := (_now AT TIME ZONE 'America/Chicago')::date;
  -- ISO: Monday=1 .. Sunday=7
  _dow INT := EXTRACT(ISODOW FROM _today_chi)::int;
  _this_monday DATE := _today_chi - (_dow - 1);
  _prev_monday DATE := _this_monday - 7;
  _prev_sunday DATE := _prev_monday + 6;
BEGIN
  week_start := _prev_monday;
  week_end   := _prev_sunday;
  RETURN NEXT;
END;
$$;

-- ------------------------------------------------------------
-- 3) WEEKLY OPENER — creates Draft reports for each active technician
--    for the previous completed Chicago work week. Idempotent.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_weekly_reports_for_previous_week()
RETURNS TABLE (created_report_id UUID, technician_id UUID, week_start DATE, week_end DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      (technician_id, area_id, week_start, week_end, opens_at, status)
    SELECT
      u.id,
      u.area_id,
      _ws,
      _we,
      now(),
      'Draft'::public.report_status
    FROM public.users u
    WHERE u.role = 'technician'
      AND u.is_active = true
      AND u.area_id IS NOT NULL
      -- Skip technicians that already have a report for this week
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_reports r
        WHERE r.technician_id = u.id
          AND r.week_start = _ws
      )
    RETURNING id, technician_id, week_start, week_end
  )
  SELECT ins.id, ins.technician_id, ins.week_start, ins.week_end FROM ins;
END;
$$;

-- ------------------------------------------------------------
-- 4) REMINDER-SUPPORT VIEWS (queryable by future jobs)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.reports_pending_submission AS
SELECT r.id, r.technician_id, r.area_id, r.week_start, r.week_end, r.status, r.opens_at
FROM public.weekly_reports r
WHERE r.status IN ('Draft', 'Returned');

CREATE OR REPLACE VIEW public.reports_pending_review AS
SELECT r.id, r.technician_id, r.area_id, r.week_start, r.week_end, r.status, r.submitted_at
FROM public.weekly_reports r
WHERE r.status = 'Submitted';
