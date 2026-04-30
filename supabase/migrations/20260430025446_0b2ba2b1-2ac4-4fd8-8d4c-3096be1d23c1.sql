CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN length(regexp_replace(coalesce(_phone, ''), '\D', '', 'g')) >= 10
      THEN right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 10)
    ELSE regexp_replace(coalesce(_phone, ''), '\D', '', 'g')
  END;
$$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  ADD COLUMN IF NOT EXISTS normalized_phone text,
  ADD COLUMN IF NOT EXISTS phone_display text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS can_login boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_submit_reports boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_error text;

UPDATE public.users
SET
  normalized_phone = NULLIF(public.normalize_phone(phone), ''),
  phone_display = COALESCE(phone_display, phone),
  status = CASE
    WHEN archived_at IS NOT NULL THEN 'REJECTED'
    WHEN pending_approval = true THEN 'PENDING_APPROVAL'
    WHEN is_active = true THEN 'APPROVED'
    ELSE 'DEACTIVATED'
  END,
  can_login = archived_at IS NULL AND (is_active = true OR pending_approval = true),
  can_submit_reports = archived_at IS NULL AND is_active = true AND pending_approval = false
WHERE true;

DROP INDEX IF EXISTS public.users_normalized_phone_live_unique;
CREATE INDEX IF NOT EXISTS users_normalized_phone_live_idx
ON public.users (normalized_phone)
WHERE normalized_phone IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS users_status_idx ON public.users (status);
CREATE INDEX IF NOT EXISTS users_pending_idx ON public.users (status, pending_approval) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_user_lifecycle_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.normalized_phone := NULLIF(public.normalize_phone(NEW.phone), '');
    NEW.phone_display := COALESCE(NEW.phone_display, NEW.phone);
  ELSIF NEW.normalized_phone IS NOT NULL THEN
    NEW.normalized_phone := NULLIF(public.normalize_phone(NEW.normalized_phone), '');
  END IF;

  IF NEW.status IS NULL THEN
    NEW.status := CASE
      WHEN NEW.archived_at IS NOT NULL THEN 'REJECTED'
      WHEN NEW.pending_approval = true THEN 'PENDING_APPROVAL'
      WHEN NEW.is_active = true THEN 'APPROVED'
      ELSE 'DEACTIVATED'
    END;
  END IF;

  IF NEW.status = 'PENDING_APPROVAL' THEN
    NEW.pending_approval := true;
    NEW.is_active := false;
    NEW.can_login := true;
    NEW.can_submit_reports := false;
  ELSIF NEW.status = 'APPROVED' THEN
    NEW.pending_approval := false;
    NEW.is_active := true;
    NEW.can_login := true;
    NEW.can_submit_reports := true;
  ELSIF NEW.status IN ('DEACTIVATED', 'REJECTED') THEN
    NEW.pending_approval := false;
    NEW.is_active := false;
    NEW.can_login := false;
    NEW.can_submit_reports := false;
  END IF;

  IF NEW.archived_at IS NOT NULL THEN
    NEW.status := 'REJECTED';
    NEW.pending_approval := false;
    NEW.is_active := false;
    NEW.can_login := false;
    NEW.can_submit_reports := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_lifecycle_fields ON public.users;
CREATE TRIGGER trg_sync_user_lifecycle_fields
BEFORE INSERT OR UPDATE OF phone, normalized_phone, phone_display, status, pending_approval, is_active, archived_at
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_lifecycle_fields();

DROP FUNCTION IF EXISTS public.find_user_by_phone(text);
CREATE FUNCTION public.find_user_by_phone(_phone text)
RETURNS TABLE(
  id uuid,
  full_name text,
  is_active boolean,
  pending_approval boolean,
  status text,
  can_login boolean,
  can_submit_reports boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT public.normalize_phone(_phone) AS digits10
  )
  SELECT u.id, u.full_name, u.is_active, u.pending_approval, u.status, u.can_login, u.can_submit_reports
  FROM public.users u, input
  WHERE u.archived_at IS NULL
    AND length(input.digits10) = 10
    AND COALESCE(u.normalized_phone, public.normalize_phone(u.phone)) = input.digits10
  ORDER BY
    CASE u.status WHEN 'APPROVED' THEN 1 WHEN 'PENDING_APPROVAL' THEN 2 WHEN 'DEACTIVATED' THEN 3 ELSE 4 END,
    u.is_active DESC,
    u.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.approve_pending_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_management(auth.uid()) THEN
    RAISE EXCEPTION 'Only management can approve users';
  END IF;

  UPDATE public.users
     SET status = 'APPROVED',
         pending_approval = false,
         is_active = true,
         can_login = true,
         can_submit_reports = true,
         updated_at = now()
   WHERE id = _user_id
     AND archived_at IS NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.debug_phone_login(text);
CREATE FUNCTION public.debug_phone_login(_phone text)
RETURNS TABLE(
  input_phone text,
  normalized_digits text,
  digits10 text,
  profile_found boolean,
  user_id uuid,
  full_name text,
  role app_role,
  is_active boolean,
  pending_approval boolean,
  archived boolean,
  status text,
  can_login boolean,
  can_submit_reports boolean,
  area_assigned boolean,
  last_login_at timestamptz,
  last_login_succeeded boolean,
  last_login_error text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  _d10 text := public.normalize_phone(_phone);
  _u public.users%ROWTYPE;
  _att public.tech_login_attempts%ROWTYPE;
  _has_area boolean;
BEGIN
  IF NOT public.is_management(auth.uid()) THEN
    RAISE EXCEPTION 'Only management can run this diagnostic';
  END IF;

  SELECT * INTO _u
  FROM public.users
  WHERE length(_d10) = 10
    AND COALESCE(normalized_phone, public.normalize_phone(phone)) = _d10
  ORDER BY archived_at NULLS FIRST, is_active DESC, created_at DESC
  LIMIT 1;

  SELECT * INTO _att
  FROM public.tech_login_attempts
  WHERE phone = _d10
  ORDER BY attempted_at DESC
  LIMIT 1;

  IF _u.id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.user_areas WHERE user_id = _u.id)
        OR _u.area_id IS NOT NULL
      INTO _has_area;
  ELSE
    _has_area := NULL;
  END IF;

  input_phone := _phone;
  normalized_digits := _norm;
  digits10 := _d10;
  profile_found := _u.id IS NOT NULL;
  user_id := _u.id;
  full_name := _u.full_name;
  role := _u.role;
  is_active := _u.is_active;
  pending_approval := _u.pending_approval;
  archived := _u.archived_at IS NOT NULL;
  status := _u.status;
  can_login := COALESCE(_u.can_login, false) AND _u.archived_at IS NULL;
  can_submit_reports := COALESCE(_u.can_submit_reports, false) AND _u.archived_at IS NULL;
  area_assigned := _has_area;
  last_login_at := _att.attempted_at;
  last_login_succeeded := _att.succeeded;
  last_login_error := _u.last_login_error;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_notification_recipients(_event notification_event_type, _related_report_id uuid DEFAULT NULL::uuid, _related_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(user_id uuid, in_app boolean, push boolean)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r record;
  _tech uuid;
BEGIN
  IF _related_report_id IS NOT NULL THEN
    SELECT technician_id INTO _tech
    FROM public.weekly_reports WHERE id = _related_report_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _recip (
    user_id uuid PRIMARY KEY,
    in_app boolean,
    push boolean
  ) ON COMMIT DROP;
  TRUNCATE _recip;

  FOR _r IN
    SELECT * FROM public.notification_settings
    WHERE event_type = _event AND enabled = true
  LOOP
    IF _r.audience = 'admins' THEN
      INSERT INTO _recip (user_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.role = 'management' AND u.is_active = true AND u.archived_at IS NULL
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push = _recip.push OR EXCLUDED.push;

    ELSIF _r.audience = 'area_managers' THEN
      INSERT INTO _recip (user_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.role = 'area_manager' AND u.is_active = true AND u.archived_at IS NULL
        AND (_related_report_id IS NULL OR public.manages_technician(u.id, _tech) OR u.id = _tech)
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push = _recip.push OR EXCLUDED.push;

    ELSIF _r.audience = 'technicians' THEN
      INSERT INTO _recip (user_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.role IN ('technician','area_manager')
        AND u.is_active = true AND u.archived_at IS NULL
        AND ((_tech IS NOT NULL AND u.id = _tech)
          OR (_tech IS NULL AND _related_user_id IS NOT NULL AND u.id = _related_user_id)
          OR (_tech IS NULL AND _related_user_id IS NULL))
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push = _recip.push OR EXCLUDED.push;

    ELSIF _r.audience = 'specific_users' THEN
      INSERT INTO _recip (user_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.id = ANY(_r.specific_user_ids)
        AND u.is_active = true AND u.archived_at IS NULL
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push = _recip.push OR EXCLUDED.push;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT r.user_id,
         (r.in_app AND COALESCE(p.in_app_enabled, true)) AS in_app,
         (r.push AND COALESCE(p.push_enabled, true)) AS push
  FROM _recip r
  LEFT JOIN public.user_notification_prefs p
    ON p.user_id = r.user_id AND p.event_type = _event;
END;
$$;