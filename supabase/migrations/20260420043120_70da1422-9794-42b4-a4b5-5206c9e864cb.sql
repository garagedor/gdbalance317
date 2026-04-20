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