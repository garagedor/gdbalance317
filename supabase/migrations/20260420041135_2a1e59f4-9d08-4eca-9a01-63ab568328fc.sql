
-- Re-create the two reminder views with security_invoker so they enforce
-- the caller's RLS instead of the view owner's privileges.
DROP VIEW IF EXISTS public.reports_pending_submission;
DROP VIEW IF EXISTS public.reports_pending_review;

CREATE VIEW public.reports_pending_submission
WITH (security_invoker = true) AS
SELECT r.id, r.technician_id, r.area_id, r.week_start, r.week_end, r.status, r.opens_at
FROM public.weekly_reports r
WHERE r.status IN ('Draft', 'Returned');

CREATE VIEW public.reports_pending_review
WITH (security_invoker = true) AS
SELECT r.id, r.technician_id, r.area_id, r.week_start, r.week_end, r.status, r.submitted_at
FROM public.weekly_reports r
WHERE r.status = 'Submitted';
