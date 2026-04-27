-- ============================================================
-- 1. DELETE DEMO USERS AND THEIR DATA
-- ============================================================
-- Demo emails to remove. Site Manager (yehocohen2003@gmail.com) is preserved.
WITH demo AS (
  SELECT id FROM auth.users
  WHERE email IN (
    'techdemo@tally.app',
    'demo.today@lovable.test',
    'managerdemo@tally.app',
    'techdemo2@example.com'
  )
),
demo_reports AS (
  SELECT id FROM public.weekly_reports WHERE technician_id IN (SELECT id FROM demo)
),
del_jobs AS (
  DELETE FROM public.weekly_report_jobs
  WHERE weekly_report_id IN (SELECT id FROM demo_reports)
  RETURNING 1
),
del_activity AS (
  DELETE FROM public.report_activity_log
  WHERE weekly_report_id IN (SELECT id FROM demo_reports)
     OR action_by_user_id IN (SELECT id FROM demo)
  RETURNING 1
),
del_office AS (
  DELETE FROM public.office_jobs
  WHERE technician_id IN (SELECT id FROM demo)
     OR created_by_user_id IN (SELECT id FROM demo)
     OR updated_by_user_id IN (SELECT id FROM demo)
     OR deleted_by_user_id IN (SELECT id FROM demo)
  RETURNING 1
),
del_reports AS (
  DELETE FROM public.weekly_reports
  WHERE id IN (SELECT id FROM demo_reports)
  RETURNING 1
),
clear_am AS (
  -- Any tech currently pointing at a demo area_manager → null it out so the
  -- delete on the user row is not blocked by the assignment trigger.
  UPDATE public.users
  SET area_manager_id = NULL
  WHERE area_manager_id IN (SELECT id FROM demo)
  RETURNING 1
),
del_pub_users AS (
  DELETE FROM public.users WHERE id IN (SELECT id FROM demo) RETURNING 1
)
DELETE FROM auth.users WHERE id IN (SELECT id FROM demo);

-- ============================================================
-- 2. AREAS TIMEZONE
-- ============================================================
ALTER TABLE public.areas
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';

-- Sensible US defaults per existing area
UPDATE public.areas SET timezone = 'America/Chicago'  WHERE name IN ('CHICAGO','SPRINGFIELD','ST LOUIS','MINESOTA');
UPDATE public.areas SET timezone = 'America/New_York' WHERE name IN ('OHIO');
UPDATE public.areas SET timezone = 'America/Indiana/Indianapolis' WHERE name IN ('FORT WAYNE','SOUTH BAND');

-- ============================================================
-- 3. WEEK HELPER: Monday → Sunday, in a given local timezone
-- ============================================================
-- Returns the most-recently-completed Monday→Sunday week for the given tz.
-- "Completed" means the week whose Sunday is yesterday or earlier in local time.
CREATE OR REPLACE FUNCTION public.previous_local_work_week(_tz text DEFAULT 'America/Chicago', _now timestamptz DEFAULT now())
RETURNS TABLE(week_start date, week_end date, opens_at timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  _today DATE := (_now AT TIME ZONE _tz)::date;
  _dow   INT  := EXTRACT(ISODOW FROM _today)::int;     -- Monday=1 … Sunday=7
  _this_monday DATE := _today - (_dow - 1);
  _prev_monday DATE := _this_monday - 7;
  _prev_sunday DATE := _prev_monday + 6;
BEGIN
  week_start := _prev_monday;
  week_end   := _prev_sunday;
  -- 8:30 PM on the closing Sunday, in the local timezone
  opens_at   := ((_prev_sunday::text || ' 20:30')::timestamp) AT TIME ZONE _tz;
  RETURN NEXT;
END;
$$;

-- Keep the legacy chicago helper as a thin wrapper for backward compat
CREATE OR REPLACE FUNCTION public.previous_chicago_work_week(_now timestamptz DEFAULT now())
RETURNS TABLE(week_start date, week_end date)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT week_start, week_end FROM public.previous_local_work_week('America/Chicago', _now);
$$;

-- ============================================================
-- 4. BULK OPEN WEEKLY REPORTS — per-area timezone, Mon→Sun, 8:30 PM local
-- ============================================================
CREATE OR REPLACE FUNCTION public.open_weekly_reports_for_previous_week()
RETURNS TABLE(created_report_id uuid, technician_id uuid, week_start date, week_end date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH per_user AS (
    SELECT
      u.id            AS uid,
      u.area_id       AS aid,
      u.commission_rate AS rate,
      w.week_start    AS ws,
      w.week_end      AS we,
      w.opens_at      AS oa
    FROM public.users u
    JOIN public.areas a ON a.id = u.area_id
    CROSS JOIN LATERAL public.previous_local_work_week(a.timezone, now()) w
    WHERE u.role IN ('technician','area_manager')
      AND u.is_active = true
      AND u.area_id IS NOT NULL
      -- Only open after the local 8:30 PM has actually passed
      AND now() >= w.opens_at
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_reports r
        WHERE r.technician_id = u.id AND r.week_start = w.ws
      )
  ),
  ins AS (
    INSERT INTO public.weekly_reports
      (technician_id, area_id, week_start, week_end, opens_at, status, commission_rate)
    SELECT uid, aid, ws, we, oa, 'Draft'::public.report_status, rate
    FROM per_user
    RETURNING
      weekly_reports.id            AS created_report_id,
      weekly_reports.technician_id AS technician_id,
      weekly_reports.week_start    AS week_start,
      weekly_reports.week_end      AS week_end
  )
  SELECT ins.created_report_id, ins.technician_id, ins.week_start, ins.week_end FROM ins;
END;
$$;

-- ============================================================
-- 5. AREA MANAGERS CAN CREATE THEIR OWN REPORTS
-- ============================================================
-- The legacy enforce_technician_role trigger forces report.technician_id to
-- reference a user with role='technician'. Relax to also accept area_manager
-- so an AM can submit reports for themselves.
CREATE OR REPLACE FUNCTION public.enforce_technician_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = NEW.technician_id
      AND role IN ('technician','area_manager')
  ) THEN
    RAISE EXCEPTION 'technician_id must reference a technician or area manager';
  END IF;
  RETURN NEW;
END;
$$;

-- Add an INSERT policy so an area manager can create their own draft report.
DROP POLICY IF EXISTS weekly_reports_insert_area_manager ON public.weekly_reports;
CREATE POLICY weekly_reports_insert_area_manager
  ON public.weekly_reports FOR INSERT TO authenticated
  WITH CHECK (technician_id = auth.uid() AND public.is_area_manager(auth.uid()));

-- Allow an AM to update their own DRAFT/RETURNED report (same as technicians).
DROP POLICY IF EXISTS weekly_reports_update_area_manager_self ON public.weekly_reports;
CREATE POLICY weekly_reports_update_area_manager_self
  ON public.weekly_reports FOR UPDATE TO authenticated
  USING (technician_id = auth.uid() AND status = ANY (ARRAY['Draft'::report_status, 'Returned'::report_status]))
  WITH CHECK (technician_id = auth.uid());

-- Job-level CRUD policies for AM on their own report (mirroring the tech ones).
DROP POLICY IF EXISTS jobs_insert_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_insert_area_manager_self
  ON public.weekly_report_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND r.technician_id = auth.uid()
      AND r.status = ANY (ARRAY['Draft'::report_status, 'Returned'::report_status])
  ));

DROP POLICY IF EXISTS jobs_update_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_update_area_manager_self
  ON public.weekly_report_jobs FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND r.technician_id = auth.uid()
      AND r.status = ANY (ARRAY['Draft'::report_status, 'Returned'::report_status])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND r.technician_id = auth.uid()
      AND r.status = ANY (ARRAY['Draft'::report_status, 'Returned'::report_status])
  ));

DROP POLICY IF EXISTS jobs_delete_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_delete_area_manager_self
  ON public.weekly_report_jobs FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND r.technician_id = auth.uid()
      AND r.status = ANY (ARRAY['Draft'::report_status, 'Returned'::report_status])
  ));

-- The status guard already permits "owning technician" to submit; broaden the
-- name only — the existing check `NEW.technician_id = _actor` already covers
-- area managers who own the row. No further change needed there.

-- The validate_report_for_submission function checks ownership the same way.
-- The weekly_reports_payout_guard uses manages_technician for AM-on-someone-else's-report
-- which doesn't apply when the AM is operating on their own report — fine.