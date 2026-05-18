ALTER TABLE public.weekly_report_jobs
  ADD COLUMN IF NOT EXISTS lm_cash numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lm_check numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lm_parts numeric NOT NULL DEFAULT 0;

ALTER TABLE public.weekly_report_jobs
  ADD CONSTRAINT weekly_report_jobs_lm_cash_nonneg CHECK (lm_cash >= 0),
  ADD CONSTRAINT weekly_report_jobs_lm_check_nonneg CHECK (lm_check >= 0),
  ADD CONSTRAINT weekly_report_jobs_lm_parts_nonneg CHECK (lm_parts >= 0);