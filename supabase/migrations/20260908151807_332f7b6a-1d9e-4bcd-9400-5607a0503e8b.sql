DO $$
DECLARE d text; p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['calc_weekly_report_job','office_jobs_apply_engine'] LOOP
    SELECT pg_get_functiondef(pr.oid) INTO d
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname='public' AND pr.proname = p;
    IF d IS NULL THEN CONTINUE; END IF;
    d := replace(d, '+ COALESCE(NEW.lm_check, 0) * 0.10', '+ 0');
    d := replace(d, '+ COALESCE(NEW.lm_check,0) * 0.10', '+ 0');
    EXECUTE d;
  END LOOP;
END $$;

UPDATE public.weekly_report_jobs SET updated_at = now() WHERE COALESCE(lm_check,0) > 0;
UPDATE public.office_jobs SET updated_at = now() WHERE COALESCE(lm_check,0) > 0;