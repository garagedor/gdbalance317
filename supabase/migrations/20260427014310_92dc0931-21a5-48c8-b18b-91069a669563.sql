-- 1) Master timezone helper: current week (Mon..Sun) + 8:00 PM Indiana threshold
CREATE OR REPLACE FUNCTION public.indiana_current_week(_now timestamptz DEFAULT now())
RETURNS TABLE(
  current_local_time timestamp,
  week_start date,
  week_end date,
  opens_at timestamptz,
  open_threshold_local timestamp,
  allowed boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _tz   text := 'America/Indiana/Indianapolis';
  _today date := (_now AT TIME ZONE _tz)::date;
  _dow   int  := EXTRACT(ISODOW FROM _today)::int;        -- 1=Mon..7=Sun
  _sunday date := _today - ((_dow % 7))::int;             -- most-recent Sunday (today if Sun)
  _monday date := _sunday - 6;
  _opens timestamptz := ((_sunday::text || ' 20:00')::timestamp) AT TIME ZONE _tz;
BEGIN
  current_local_time   := (_now AT TIME ZONE _tz)::timestamp;
  week_start           := _monday;
  week_end             := _sunday;
  opens_at             := _opens;
  open_threshold_local := (_opens AT TIME ZONE _tz)::timestamp;
  allowed              := (_now >= _opens);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.indiana_current_week(timestamptz) TO authenticated;

-- 2) Replace opener: single Indiana gate, no per-area timezone math.
--    `_force = true` bypasses the time gate (used by the "Open Now" button).
CREATE OR REPLACE FUNCTION public.open_weekly_reports_for_previous_week(_force boolean DEFAULT false)
RETURNS TABLE(created_report_id uuid, technician_id uuid, week_start date, week_end date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _w record;
BEGIN
  SELECT * INTO _w FROM public.indiana_current_week(now());

  IF NOT _force AND NOT _w.allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH per_user AS (
    SELECT
      u.id              AS uid,
      u.area_id         AS aid,
      u.commission_rate AS rate
    FROM public.users u
    WHERE u.role IN ('technician','area_manager')
      AND u.is_active = true
      AND u.area_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_reports r
        WHERE r.technician_id = u.id AND r.week_start = _w.week_start
      )
  ),
  ins AS (
    INSERT INTO public.weekly_reports
      (technician_id, area_id, week_start, week_end, opens_at, status, commission_rate)
    SELECT uid, aid, _w.week_start, _w.week_end, _w.opens_at, 'Draft'::public.report_status, rate
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

-- 3) Drop the per-area debug helper (no longer used)
DROP FUNCTION IF EXISTS public.debug_report_open_status(uuid);