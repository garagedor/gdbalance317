-- 1) week_locks table
CREATE TABLE IF NOT EXISTS public.week_locks (
  week_start    date PRIMARY KEY,
  locked_at     timestamptz NOT NULL DEFAULT now(),
  locked_by     uuid,
  note          text
);

ALTER TABLE public.week_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS week_locks_select_authenticated ON public.week_locks;
CREATE POLICY week_locks_select_authenticated
  ON public.week_locks FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS week_locks_insert_management ON public.week_locks;
CREATE POLICY week_locks_insert_management
  ON public.week_locks FOR INSERT TO authenticated
  WITH CHECK (public.is_management(auth.uid()));

DROP POLICY IF EXISTS week_locks_delete_management ON public.week_locks;
CREATE POLICY week_locks_delete_management
  ON public.week_locks FOR DELETE TO authenticated
  USING (public.is_management(auth.uid()));

-- 2) open time on app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS open_hour   smallint NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS open_minute smallint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_open_hour_chk'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_open_hour_chk CHECK (open_hour BETWEEN 0 AND 23);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_open_minute_chk'
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_open_minute_chk CHECK (open_minute BETWEEN 0 AND 59);
  END IF;
END $$;

DROP POLICY IF EXISTS app_settings_select_authenticated ON public.app_settings;
CREATE POLICY app_settings_select_authenticated
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);

-- 3) Helper to check whether a given week is locked
CREATE OR REPLACE FUNCTION public.is_week_locked(_week_start date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.week_locks WHERE week_start = _week_start);
$$;

-- 4) Updated indiana_current_week — must drop first (return shape changed)
DROP FUNCTION IF EXISTS public.indiana_current_week(timestamp with time zone);

CREATE OR REPLACE FUNCTION public.indiana_current_week(_now timestamp with time zone DEFAULT now())
RETURNS TABLE (
  current_local_time timestamp without time zone,
  week_start date,
  week_end date,
  opens_at timestamp with time zone,
  open_threshold_local timestamp without time zone,
  allowed boolean,
  is_locked boolean,
  open_hour smallint,
  open_minute smallint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _tz   text := 'America/Indiana/Indianapolis';
  _today date := (_now AT TIME ZONE _tz)::date;
  _dow   int  := EXTRACT(ISODOW FROM _today)::int;
  _sunday date := _today - ((_dow % 7))::int;
  _monday date := _sunday - 6;
  _h smallint;
  _m smallint;
  _opens timestamptz;
  _locked boolean;
BEGIN
  SELECT s.open_hour, s.open_minute
    INTO _h, _m
  FROM public.app_settings s
  WHERE s.id = true;
  _h := COALESCE(_h, 20);
  _m := COALESCE(_m, 0);

  _opens := ((_sunday::text || ' ' || lpad(_h::text, 2, '0') || ':' || lpad(_m::text, 2, '0'))::timestamp)
            AT TIME ZONE _tz;

  SELECT EXISTS (SELECT 1 FROM public.week_locks wl WHERE wl.week_start = _monday)
    INTO _locked;

  current_local_time   := (_now AT TIME ZONE _tz)::timestamp;
  week_start           := _monday;
  week_end             := _sunday;
  opens_at             := _opens;
  open_threshold_local := (_opens AT TIME ZONE _tz)::timestamp;
  allowed              := (_now >= _opens) AND NOT _locked;
  is_locked            := _locked;
  open_hour            := _h;
  open_minute          := _m;
  RETURN NEXT;
END;
$$;

-- 5) Block tech / area-manager edits on locked weeks via RLS
DROP POLICY IF EXISTS weekly_reports_update_tech ON public.weekly_reports;
CREATE POLICY weekly_reports_update_tech
  ON public.weekly_reports FOR UPDATE TO authenticated
  USING (
    technician_id = auth.uid()
    AND status IN ('Draft','Returned')
    AND NOT public.is_week_locked(week_start)
  )
  WITH CHECK (technician_id = auth.uid());

DROP POLICY IF EXISTS weekly_reports_update_area_manager_self ON public.weekly_reports;
CREATE POLICY weekly_reports_update_area_manager_self
  ON public.weekly_reports FOR UPDATE TO authenticated
  USING (
    technician_id = auth.uid()
    AND status IN ('Draft','Returned')
    AND NOT public.is_week_locked(week_start)
  )
  WITH CHECK (technician_id = auth.uid());

DROP POLICY IF EXISTS weekly_reports_insert_tech ON public.weekly_reports;
CREATE POLICY weekly_reports_insert_tech
  ON public.weekly_reports FOR INSERT TO authenticated
  WITH CHECK (
    technician_id = auth.uid()
    AND public.is_technician(auth.uid())
    AND NOT public.is_week_locked(week_start)
  );

DROP POLICY IF EXISTS weekly_reports_insert_area_manager ON public.weekly_reports;
CREATE POLICY weekly_reports_insert_area_manager
  ON public.weekly_reports FOR INSERT TO authenticated
  WITH CHECK (
    technician_id = auth.uid()
    AND public.is_area_manager(auth.uid())
    AND NOT public.is_week_locked(week_start)
  );

DROP POLICY IF EXISTS jobs_insert_tech ON public.weekly_report_jobs;
CREATE POLICY jobs_insert_tech
  ON public.weekly_report_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status IN ('Draft','Returned')
        AND NOT public.is_week_locked(r.week_start)
    )
  );

DROP POLICY IF EXISTS jobs_update_tech ON public.weekly_report_jobs;
CREATE POLICY jobs_update_tech
  ON public.weekly_report_jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status IN ('Draft','Returned')
        AND NOT public.is_week_locked(r.week_start)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status IN ('Draft','Returned')
        AND NOT public.is_week_locked(r.week_start)
    )
  );

DROP POLICY IF EXISTS jobs_delete_tech ON public.weekly_report_jobs;
CREATE POLICY jobs_delete_tech
  ON public.weekly_report_jobs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status IN ('Draft','Returned')
        AND NOT public.is_week_locked(r.week_start)
    )
  );

DROP POLICY IF EXISTS jobs_insert_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_insert_area_manager_self
  ON public.weekly_report_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status IN ('Draft','Returned')
        AND NOT public.is_week_locked(r.week_start)
    )
  );

DROP POLICY IF EXISTS jobs_update_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_update_area_manager_self
  ON public.weekly_report_jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status IN ('Draft','Returned')
        AND NOT public.is_week_locked(r.week_start)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status IN ('Draft','Returned')
        AND NOT public.is_week_locked(r.week_start)
    )
  );

DROP POLICY IF EXISTS jobs_delete_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_delete_area_manager_self
  ON public.weekly_report_jobs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status IN ('Draft','Returned')
        AND NOT public.is_week_locked(r.week_start)
    )
  );