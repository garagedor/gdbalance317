-- When admin updates a user's commission_rate, propagate to their
-- editable (Draft / Returned) weekly reports and the jobs inside them
-- so the new rate takes effect immediately for in-progress reports.
-- Submitted, Under Review, and Approved reports keep their snapshot.

CREATE OR REPLACE FUNCTION public.propagate_user_commission_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_rate numeric;
  _r record;
BEGIN
  IF NEW.commission_rate IS NULL OR NEW.commission_rate = OLD.commission_rate THEN
    RETURN NEW;
  END IF;

  -- For area managers, the self-job rate falls back to 0.40 only when
  -- still at the technician default (0.30). Once admin sets an explicit
  -- rate, that exact rate is used.
  IF NEW.role = 'area_manager' THEN
    _new_rate := COALESCE(NULLIF(NEW.commission_rate, 0.30), 0.40);
  ELSE
    _new_rate := NEW.commission_rate;
  END IF;

  -- Update editable reports' snapshot
  UPDATE public.weekly_reports
     SET commission_rate = _new_rate,
         updated_at = now()
   WHERE technician_id = NEW.id
     AND status IN ('Draft'::public.report_status, 'Returned'::public.report_status);

  -- Re-snapshot jobs for those reports and recalc parent totals
  FOR _r IN
    SELECT id FROM public.weekly_reports
     WHERE technician_id = NEW.id
       AND status IN ('Draft'::public.report_status, 'Returned'::public.report_status)
  LOOP
    -- Touching each job re-runs calc_weekly_report_job (BEFORE UPDATE)
    -- which honors the parent report's snapshotted commission_rate.
    UPDATE public.weekly_report_jobs
       SET commission_rate = _new_rate
     WHERE weekly_report_id = _r.id;

    PERFORM public.recalc_weekly_report_totals(_r.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_user_commission_rate ON public.users;
CREATE TRIGGER trg_propagate_user_commission_rate
AFTER UPDATE OF commission_rate ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.propagate_user_commission_rate();