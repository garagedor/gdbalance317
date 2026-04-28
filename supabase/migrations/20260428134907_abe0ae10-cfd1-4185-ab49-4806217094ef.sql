-- Add admin commission override capability per report
-- The override updates the report's commission_rate (the snapshot) and re-snapshots
-- all jobs in that report, then recalculates totals. An audit row is logged.

CREATE OR REPLACE FUNCTION public.admin_override_report_commission(
  _report_id uuid,
  _new_rate numeric,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _old_rate numeric;
  _exists boolean;
BEGIN
  IF NOT public.is_management(_actor) THEN
    RAISE EXCEPTION 'Only management can override report commission';
  END IF;

  IF _new_rate IS NULL OR _new_rate < 0 OR _new_rate > 1 THEN
    RAISE EXCEPTION 'Commission rate must be between 0 and 1';
  END IF;

  SELECT commission_rate INTO _old_rate
  FROM public.weekly_reports WHERE id = _report_id;

  IF _old_rate IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  -- Update the report's snapshot
  UPDATE public.weekly_reports
     SET commission_rate = _new_rate,
         updated_at = now()
   WHERE id = _report_id;

  -- Re-snapshot all jobs (BEFORE UPDATE trigger recalculates each job)
  UPDATE public.weekly_report_jobs
     SET commission_rate = _new_rate
   WHERE weekly_report_id = _report_id;

  -- Recalculate parent report totals
  PERFORM public.recalc_weekly_report_totals(_report_id);

  -- Audit log
  INSERT INTO public.report_activity_log
    (weekly_report_id, action_type, action_by_user_id, note)
  VALUES
    (_report_id,
     'commission_override',
     _actor,
     format('Commission changed from %s%% to %s%%%s',
       ROUND(_old_rate * 100, 2),
       ROUND(_new_rate * 100, 2),
       CASE WHEN _note IS NOT NULL AND length(btrim(_note)) > 0
            THEN ' — ' || _note ELSE '' END));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_override_report_commission(uuid, numeric, text) TO authenticated;