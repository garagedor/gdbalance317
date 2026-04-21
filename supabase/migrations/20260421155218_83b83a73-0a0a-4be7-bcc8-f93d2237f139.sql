-- Force re-run of calc trigger on all existing rows
UPDATE public.weekly_report_jobs SET updated_at = now();
UPDATE public.office_jobs SET updated_at = now();