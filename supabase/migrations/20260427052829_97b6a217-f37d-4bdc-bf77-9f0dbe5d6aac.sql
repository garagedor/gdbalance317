CREATE OR REPLACE FUNCTION public.weekly_reports_status_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _job_count INT;
  _actor UUID := auth.uid();
  _is_mgmt BOOLEAN := public.is_management(_actor);
  _is_am   BOOLEAN := public.is_area_manager(_actor);
  _is_self BOOLEAN := (NEW.technician_id = _actor);
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Area managers may NOT change status of OTHER people's reports,
  -- but they can change status of their OWN self-report (acts as technician).
  IF _is_am AND NOT _is_mgmt AND NOT _is_self THEN
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
    -- Allow technician owner OR area manager owner (self-report) OR management
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
$function$;