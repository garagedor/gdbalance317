-- Helper: is_office_staff
CREATE OR REPLACE FUNCTION public.is_office_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND role = 'office_staff'::public.app_role AND is_active = true
  );
$$;

-- office_jobs table
CREATE TABLE IF NOT EXISTS public.office_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  weekly_report_id uuid NULL REFERENCES public.weekly_reports(id) ON DELETE SET NULL,
  job_date date NOT NULL,
  customer_name text NULL,
  address text NULL,
  payment_type public.payment_type NOT NULL,
  total_job numeric NOT NULL DEFAULT 0 CHECK (total_job >= 0),
  tip_amount numeric NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
  my_parts numeric NOT NULL DEFAULT 0 CHECK (my_parts >= 0),
  company_parts numeric NOT NULL DEFAULT 0 CHECK (company_parts >= 0),
  tech_cash numeric NOT NULL DEFAULT 0 CHECK (tech_cash >= 0),
  company_cash numeric NOT NULL DEFAULT 0 CHECK (company_cash >= 0),
  notes text NULL,

  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NULL,
  deleted_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,

  reconciliation_status text NOT NULL DEFAULT 'unmatched',

  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_jobs_tech_date_idx
  ON public.office_jobs (technician_id, job_date DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS office_jobs_weekly_report_idx
  ON public.office_jobs (weekly_report_id)
  WHERE is_deleted = false;

DROP TRIGGER IF EXISTS update_office_jobs_updated_at ON public.office_jobs;
CREATE TRIGGER update_office_jobs_updated_at
  BEFORE UPDATE ON public.office_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-link weekly_report_id from technician + job_date
CREATE OR REPLACE FUNCTION public.office_jobs_link_weekly_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _wr_id uuid;
BEGIN
  IF NEW.weekly_report_id IS NULL
     OR (TG_OP = 'UPDATE' AND (
          NEW.technician_id IS DISTINCT FROM OLD.technician_id
          OR NEW.job_date IS DISTINCT FROM OLD.job_date))
  THEN
    SELECT r.id INTO _wr_id
    FROM public.weekly_reports r
    WHERE r.technician_id = NEW.technician_id
      AND NEW.job_date BETWEEN r.week_start AND r.week_end
    ORDER BY r.created_at DESC
    LIMIT 1;
    NEW.weekly_report_id := _wr_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS office_jobs_link_wr ON public.office_jobs;
CREATE TRIGGER office_jobs_link_wr
  BEFORE INSERT OR UPDATE ON public.office_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.office_jobs_link_weekly_report();

-- RLS
ALTER TABLE public.office_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY office_jobs_select_management
  ON public.office_jobs FOR SELECT
  TO authenticated
  USING (public.is_management(auth.uid()));

CREATE POLICY office_jobs_select_office
  ON public.office_jobs FOR SELECT
  TO authenticated
  USING (public.is_office_staff(auth.uid()) AND is_deleted = false);

CREATE POLICY office_jobs_insert
  ON public.office_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.is_office_staff(auth.uid()) OR public.is_management(auth.uid()))
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY office_jobs_update
  ON public.office_jobs FOR UPDATE
  TO authenticated
  USING (
    public.is_management(auth.uid())
    OR (public.is_office_staff(auth.uid()) AND is_deleted = false)
  )
  WITH CHECK (
    public.is_management(auth.uid()) OR public.is_office_staff(auth.uid())
  );

CREATE POLICY office_jobs_delete_management
  ON public.office_jobs FOR DELETE
  TO authenticated
  USING (public.is_management(auth.uid()));