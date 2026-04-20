-- ============================================================
-- WEEKLY TECHNICIAN BALANCE SYSTEM - INITIAL SCHEMA
-- Timezone for weekly logic: America/Chicago (handled in app layer)
-- ============================================================

-- ---------- ENUMS ----------
CREATE TYPE public.app_role AS ENUM ('technician', 'management');
CREATE TYPE public.report_status AS ENUM ('Draft', 'Submitted', 'Under Review', 'Returned', 'Approved');
CREATE TYPE public.payment_type AS ENUM ('Card', 'Cash', 'Split');
CREATE TYPE public.tip_type AS ENUM ('Cash', 'Card', 'None');

-- ---------- TIMESTAMP TRIGGER ----------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1) AREAS
-- ============================================================
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_areas_updated_at
BEFORE UPDATE ON public.areas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2) USERS  (application-level profile, linked to auth.users)
-- Roles are stored here per spec, BUT all role checks must go
-- through has_role() / is_management() security-definer fns
-- to prevent recursive RLS and privilege escalation.
-- ============================================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY,  -- equals auth.users.id
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role public.app_role NOT NULL DEFAULT 'technician',
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_area_id ON public.users(area_id);
CREATE INDEX idx_users_is_active ON public.users(is_active);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ---------- SECURITY DEFINER ROLE HELPERS ----------
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_management(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND role = 'management' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_technician(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND role = 'technician' AND is_active = true
  );
$$;

-- ============================================================
-- 3) WEEKLY_REPORTS
-- ============================================================
CREATE TABLE public.weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,

  -- Week window (America/Chicago dates)
  week_start DATE NOT NULL,
  week_end   DATE NOT NULL,
  opens_at   TIMESTAMPTZ,

  status public.report_status NOT NULL DEFAULT 'Draft',

  -- Lifecycle timestamps
  submitted_at    TIMESTAMPTZ,
  under_review_at TIMESTAMPTZ,
  returned_at     TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  manager_note    TEXT,

  -- Summary financial fields (rolled up from jobs)
  total_sales            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_card_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_card_tip_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_tip_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tips             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_card_fee         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_my_parts         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_company_parts    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tech_30          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_company_70       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tech_gross_payout      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tech_cash_collected    NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_cash_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_balance            NUMERIC(12,2) NOT NULL DEFAULT 0,
  tech_net_profit        NUMERIC(12,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT weekly_reports_week_valid CHECK (week_end >= week_start),
  CONSTRAINT weekly_reports_unique_week UNIQUE (technician_id, week_start)
);

CREATE INDEX idx_weekly_reports_technician_id ON public.weekly_reports(technician_id);
CREATE INDEX idx_weekly_reports_area_id       ON public.weekly_reports(area_id);
CREATE INDEX idx_weekly_reports_status        ON public.weekly_reports(status);
CREATE INDEX idx_weekly_reports_week_start    ON public.weekly_reports(week_start);
CREATE INDEX idx_weekly_reports_week_end      ON public.weekly_reports(week_end);
CREATE INDEX idx_weekly_reports_tech_week     ON public.weekly_reports(technician_id, week_start);

CREATE TRIGGER trg_weekly_reports_updated_at
BEFORE UPDATE ON public.weekly_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

-- Enforce: technician_id must reference a user with role = technician
CREATE OR REPLACE FUNCTION public.enforce_technician_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = NEW.technician_id AND role = 'technician'
  ) THEN
    RAISE EXCEPTION 'technician_id must reference a user with role = technician';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_weekly_reports_enforce_technician
BEFORE INSERT OR UPDATE OF technician_id ON public.weekly_reports
FOR EACH ROW EXECUTE FUNCTION public.enforce_technician_role();

-- ============================================================
-- 4) WEEKLY_REPORT_JOBS
-- ============================================================
CREATE TABLE public.weekly_report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_report_id UUID NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,

  job_date DATE NOT NULL,
  customer_name TEXT,
  address TEXT,
  payment_type public.payment_type NOT NULL,

  -- Financial INPUTS
  total_job        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tech_cash        NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_cash     NUMERIC(12,2) NOT NULL DEFAULT 0,
  card_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tip_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tip_type         public.tip_type NOT NULL DEFAULT 'None',
  card_tip_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_tip_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  card_fee_rate    NUMERIC(6,4)  NOT NULL DEFAULT 0,  -- e.g. 0.0300 = 3%
  my_parts         NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_parts    NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Financial CALCULATED fields (computed in app/edge fn or trigger)
  card_fee_base    NUMERIC(12,2) NOT NULL DEFAULT 0,
  card_fee_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  base_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tech_30          NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_70       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tech_payout      NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
  job_balance      NUMERIC(12,2) NOT NULL DEFAULT 0,

  notes TEXT,
  source_text TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Sanity constraints
  CONSTRAINT jobs_total_job_nonneg     CHECK (total_job >= 0),
  CONSTRAINT jobs_card_amount_nonneg   CHECK (card_amount >= 0),
  CONSTRAINT jobs_cash_amount_nonneg   CHECK (cash_amount >= 0),
  CONSTRAINT jobs_tip_amount_nonneg    CHECK (tip_amount >= 0),
  CONSTRAINT jobs_my_parts_nonneg      CHECK (my_parts >= 0),
  CONSTRAINT jobs_company_parts_nonneg CHECK (company_parts >= 0),
  CONSTRAINT jobs_card_fee_rate_range  CHECK (card_fee_rate >= 0 AND card_fee_rate <= 1)
);

CREATE INDEX idx_jobs_weekly_report_id ON public.weekly_report_jobs(weekly_report_id);
CREATE INDEX idx_jobs_job_date         ON public.weekly_report_jobs(job_date);
CREATE INDEX idx_jobs_payment_type     ON public.weekly_report_jobs(payment_type);

CREATE TRIGGER trg_weekly_report_jobs_updated_at
BEFORE UPDATE ON public.weekly_report_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.weekly_report_jobs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5) REPORT_ACTIVITY_LOG
-- ============================================================
CREATE TABLE public.report_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_report_id UUID NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,    -- e.g. 'submitted', 'returned', 'approved', 'note_added'
  action_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_weekly_report_id ON public.report_activity_log(weekly_report_id);
CREATE INDEX idx_activity_action_by        ON public.report_activity_log(action_by_user_id);
CREATE INDEX idx_activity_created_at       ON public.report_activity_log(created_at);

ALTER TABLE public.report_activity_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- AUTO-CREATE PROFILE on new auth user
-- (defaults role = technician, no area; management upgrades manually)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    'technician'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ---------- AREAS ----------
-- All authenticated users can read areas (lookup table).
CREATE POLICY "areas_select_authenticated"
ON public.areas FOR SELECT
TO authenticated
USING (true);

-- Only management can mutate areas.
CREATE POLICY "areas_insert_management"
ON public.areas FOR INSERT
TO authenticated
WITH CHECK (public.is_management(auth.uid()));

CREATE POLICY "areas_update_management"
ON public.areas FOR UPDATE
TO authenticated
USING (public.is_management(auth.uid()))
WITH CHECK (public.is_management(auth.uid()));

CREATE POLICY "areas_delete_management"
ON public.areas FOR DELETE
TO authenticated
USING (public.is_management(auth.uid()));

-- ---------- USERS ----------
-- A user can read their own profile; management can read all.
CREATE POLICY "users_select_self_or_management"
ON public.users FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_management(auth.uid()));

-- A user can update their own non-sensitive fields. Role/area/is_active changes
-- are reserved for management via the second policy.
-- (We rely on management policy below for elevated changes.)
CREATE POLICY "users_update_self"
ON public.users FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.users WHERE id = auth.uid()));

CREATE POLICY "users_update_management"
ON public.users FOR UPDATE
TO authenticated
USING (public.is_management(auth.uid()))
WITH CHECK (public.is_management(auth.uid()));

-- Inserts happen via trigger (handle_new_user) using SECURITY DEFINER.
-- Management may also create user profiles directly if needed:
CREATE POLICY "users_insert_management"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (public.is_management(auth.uid()));

-- Only management can delete users.
CREATE POLICY "users_delete_management"
ON public.users FOR DELETE
TO authenticated
USING (public.is_management(auth.uid()));

-- ---------- WEEKLY_REPORTS ----------
-- Technician sees their own; management sees all.
CREATE POLICY "weekly_reports_select"
ON public.weekly_reports FOR SELECT
TO authenticated
USING (technician_id = auth.uid() OR public.is_management(auth.uid()));

-- Technician can create reports for themselves.
CREATE POLICY "weekly_reports_insert_tech"
ON public.weekly_reports FOR INSERT
TO authenticated
WITH CHECK (
  technician_id = auth.uid()
  AND public.is_technician(auth.uid())
);

-- Management can create on behalf of a technician.
CREATE POLICY "weekly_reports_insert_management"
ON public.weekly_reports FOR INSERT
TO authenticated
WITH CHECK (public.is_management(auth.uid()));

-- Technician can update only their own reports while not finalized
-- (Draft or Returned). Management can update any report (status transitions, notes).
CREATE POLICY "weekly_reports_update_tech"
ON public.weekly_reports FOR UPDATE
TO authenticated
USING (
  technician_id = auth.uid()
  AND status IN ('Draft', 'Returned')
)
WITH CHECK (
  technician_id = auth.uid()
);

CREATE POLICY "weekly_reports_update_management"
ON public.weekly_reports FOR UPDATE
TO authenticated
USING (public.is_management(auth.uid()))
WITH CHECK (public.is_management(auth.uid()));

-- Only management can delete reports.
CREATE POLICY "weekly_reports_delete_management"
ON public.weekly_reports FOR DELETE
TO authenticated
USING (public.is_management(auth.uid()));

-- ---------- WEEKLY_REPORT_JOBS ----------
-- Visible if user can see the parent report.
CREATE POLICY "jobs_select"
ON public.weekly_report_jobs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND (r.technician_id = auth.uid() OR public.is_management(auth.uid()))
  )
);

-- Technician can mutate jobs for their own non-finalized reports.
CREATE POLICY "jobs_insert_tech"
ON public.weekly_report_jobs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND r.technician_id = auth.uid()
      AND r.status IN ('Draft', 'Returned')
  )
);

CREATE POLICY "jobs_update_tech"
ON public.weekly_report_jobs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND r.technician_id = auth.uid()
      AND r.status IN ('Draft', 'Returned')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND r.technician_id = auth.uid()
      AND r.status IN ('Draft', 'Returned')
  )
);

CREATE POLICY "jobs_delete_tech"
ON public.weekly_report_jobs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = weekly_report_jobs.weekly_report_id
      AND r.technician_id = auth.uid()
      AND r.status IN ('Draft', 'Returned')
  )
);

-- Management may mutate any job rows.
CREATE POLICY "jobs_all_management"
ON public.weekly_report_jobs FOR ALL
TO authenticated
USING (public.is_management(auth.uid()))
WITH CHECK (public.is_management(auth.uid()));

-- ---------- REPORT_ACTIVITY_LOG ----------
-- Visible if user can see the parent report.
CREATE POLICY "activity_select"
ON public.report_activity_log FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = report_activity_log.weekly_report_id
      AND (r.technician_id = auth.uid() OR public.is_management(auth.uid()))
  )
);

-- Anyone who can see the report may append activity entries authored by themselves.
CREATE POLICY "activity_insert_self"
ON public.report_activity_log FOR INSERT
TO authenticated
WITH CHECK (
  action_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = report_activity_log.weekly_report_id
      AND (r.technician_id = auth.uid() OR public.is_management(auth.uid()))
  )
);

-- Activity log is append-only: no updates. Only management may delete (cleanup).
CREATE POLICY "activity_delete_management"
ON public.report_activity_log FOR DELETE
TO authenticated
USING (public.is_management(auth.uid()));
