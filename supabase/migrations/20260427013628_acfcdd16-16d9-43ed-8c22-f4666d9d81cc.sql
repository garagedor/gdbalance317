-- 1) Fix previous_local_work_week:
--    a) Use 21:30 (9:30 PM) instead of 20:30
--    b) Correct Sunday week math: on the closing Sunday, week_end = today
CREATE OR REPLACE FUNCTION public.previous_local_work_week(
  _tz text DEFAULT 'America/Chicago',
  _now timestamptz DEFAULT now()
)
RETURNS TABLE(week_start date, week_end date, opens_at timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _today_local date := (_now AT TIME ZONE _tz)::date;
  _dow         int  := EXTRACT(ISODOW FROM _today_local)::int;  -- 1=Mon..7=Sun
  -- Most-recent Sunday (today if today IS Sunday)
  _prev_sunday date := _today_local - ((_dow % 7))::int;
  -- Monday that opens that week
  _prev_monday date := _prev_sunday - 6;
BEGIN
  week_start := _prev_monday;
  week_end   := _prev_sunday;
  -- 9:30 PM on the closing Sunday, in the area's local timezone
  opens_at   := ((_prev_sunday::text || ' 21:30')::timestamp) AT TIME ZONE _tz;
  RETURN NEXT;
END;
$$;

-- 2) previous_chicago_work_week wrapper stays in sync (already delegates).
--    Recreate just to be explicit and keep search_path locked.
CREATE OR REPLACE FUNCTION public.previous_chicago_work_week(
  _now timestamptz DEFAULT now()
)
RETURNS TABLE(week_start date, week_end date)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT week_start, week_end FROM public.previous_local_work_week('America/Chicago', _now);
$$;

-- 3) Debug helper: per assigned area, show all the inputs that drive the gate.
--    Usable by management and by the user themselves.
CREATE OR REPLACE FUNCTION public.debug_report_open_status(_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  user_id uuid,
  area_id uuid,
  area_name text,
  area_timezone text,
  is_primary boolean,
  current_local_time timestamp,
  week_start date,
  week_end date,
  opens_at timestamptz,
  open_threshold_local timestamp,
  allowed boolean,
  report_already_exists boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT (auth.uid() = _user_id OR public.is_management(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH areas_for_user AS (
    SELECT a.id AS aid, a.name AS aname, a.timezone AS tz,
           COALESCE(ua.is_primary, (u.area_id = a.id)) AS is_prim
    FROM public.users u
    LEFT JOIN public.user_areas ua ON ua.user_id = u.id
    LEFT JOIN public.areas a ON a.id = COALESCE(ua.area_id, u.area_id)
    WHERE u.id = _user_id AND a.id IS NOT NULL
  )
  SELECT
    _user_id,
    afu.aid,
    afu.aname,
    afu.tz,
    afu.is_prim,
    (now() AT TIME ZONE afu.tz)::timestamp AS current_local_time,
    w.week_start,
    w.week_end,
    w.opens_at,
    (w.opens_at AT TIME ZONE afu.tz)::timestamp AS open_threshold_local,
    (now() >= w.opens_at) AS allowed,
    EXISTS (
      SELECT 1 FROM public.weekly_reports r
      WHERE r.technician_id = _user_id AND r.week_start = w.week_start
    ) AS report_already_exists
  FROM areas_for_user afu
  CROSS JOIN LATERAL public.previous_local_work_week(afu.tz, now()) w;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_report_open_status(uuid) TO authenticated;