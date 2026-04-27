-- =========================================================
-- 1. App-wide settings (single row), hosts the invite code
-- =========================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  invite_code     text    NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only management can read raw row (the invite code itself is sensitive-ish).
DROP POLICY IF EXISTS app_settings_select_management ON public.app_settings;
CREATE POLICY app_settings_select_management
  ON public.app_settings FOR SELECT TO authenticated
  USING (public.is_management(auth.uid()));

DROP POLICY IF EXISTS app_settings_update_management ON public.app_settings;
CREATE POLICY app_settings_update_management
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.is_management(auth.uid()))
  WITH CHECK (public.is_management(auth.uid()));

DROP POLICY IF EXISTS app_settings_insert_management ON public.app_settings;
CREATE POLICY app_settings_insert_management
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_management(auth.uid()));

-- Seed default code (idempotent)
INSERT INTO public.app_settings (id, invite_code)
VALUES (true, '317GD')
ON CONFLICT (id) DO NOTHING;

-- Public-safe verifier used by edge function (no row exposure)
CREATE OR REPLACE FUNCTION public.is_invite_code_valid(_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_settings
    WHERE id = true AND lower(btrim(invite_code)) = lower(btrim(_code))
  );
$$;

-- =========================================================
-- 2. Pending-approval flag on users
-- =========================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pending_approval boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_pending_idx
  ON public.users (pending_approval) WHERE pending_approval = true;

-- =========================================================
-- 3. Login-attempts table for rate limiting
-- =========================================================
CREATE TABLE IF NOT EXISTS public.tech_login_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  ip            text,
  succeeded     boolean NOT NULL DEFAULT false,
  attempted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tech_login_attempts_phone_time_idx
  ON public.tech_login_attempts (phone, attempted_at DESC);

ALTER TABLE public.tech_login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tech_login_attempts_select_mgmt ON public.tech_login_attempts;
CREATE POLICY tech_login_attempts_select_mgmt
  ON public.tech_login_attempts FOR SELECT TO authenticated
  USING (public.is_management(auth.uid()));

-- (no insert/update/delete policies for clients — edge function uses service role)

-- =========================================================
-- 4. Helper to look up by phone (used by edge fn / admin UI)
-- =========================================================
CREATE OR REPLACE FUNCTION public.find_user_by_phone(_phone text)
RETURNS TABLE(id uuid, full_name text, is_active boolean, pending_approval boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, full_name, is_active, pending_approval
  FROM public.users
  WHERE regexp_replace(coalesce(phone,''), '\D', '', 'g')
      = regexp_replace(coalesce(_phone,''), '\D', '', 'g')
    AND archived_at IS NULL
  LIMIT 1;
$$;

-- =========================================================
-- 5. Approve helper (management only)
-- =========================================================
CREATE OR REPLACE FUNCTION public.approve_pending_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_management(auth.uid()) THEN
    RAISE EXCEPTION 'Only management can approve users';
  END IF;
  UPDATE public.users
     SET pending_approval = false,
         is_active        = true,
         updated_at       = now()
   WHERE id = _user_id;
END;
$$;