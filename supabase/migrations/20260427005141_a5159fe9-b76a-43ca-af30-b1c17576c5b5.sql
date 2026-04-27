-- Update report opening time from 8:30 PM (20:30) to 9:30 PM (21:30) local time per area timezone
CREATE OR REPLACE FUNCTION public.current_week_for_area(_area_id uuid)
RETURNS TABLE(week_start date, week_end date, opens_at timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _tz text;
  _now_local timestamp;
  _today_local date;
  _dow int;
  _prev_sunday date;
  _prev_monday date;
BEGIN
  SELECT COALESCE(timezone, 'America/Chicago') INTO _tz FROM public.areas WHERE id = _area_id;
  IF _tz IS NULL THEN _tz := 'America/Chicago'; END IF;

  _now_local := (now() AT TIME ZONE _tz);
  _today_local := _now_local::date;
  _dow := EXTRACT(ISODOW FROM _today_local)::int; -- 1=Mon..7=Sun

  -- Previous (most recent) Sunday (the closing day)
  _prev_sunday := _today_local - ((_dow % 7))::int;
  -- Monday before that Sunday
  _prev_monday := _prev_sunday - 6;

  week_start := _prev_monday;
  week_end   := _prev_sunday;
  -- 9:30 PM on the closing Sunday, in the local timezone
  opens_at   := ((_prev_sunday::text || ' 21:30')::timestamp) AT TIME ZONE _tz;
  RETURN NEXT;
END;
$$;