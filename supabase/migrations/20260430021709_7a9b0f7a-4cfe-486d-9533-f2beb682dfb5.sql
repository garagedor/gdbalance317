
DROP POLICY IF EXISTS notifications_insert_self ON public.notifications;
CREATE POLICY notifications_insert_self
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP FUNCTION IF EXISTS public.debug_phone_login(text);

CREATE OR REPLACE FUNCTION public.debug_phone_login(_phone text)
RETURNS TABLE(
  input_phone text,
  normalized_digits text,
  digits10 text,
  profile_found boolean,
  user_id uuid,
  full_name text,
  role public.app_role,
  is_active boolean,
  pending_approval boolean,
  archived boolean,
  can_login boolean,
  area_assigned boolean,
  last_login_at timestamptz,
  last_login_succeeded boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _norm text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  _d10  text := right(_norm, 10);
  _u    public.users%ROWTYPE;
  _att  public.tech_login_attempts%ROWTYPE;
  _has_area boolean;
BEGIN
  IF NOT public.is_management(auth.uid()) THEN
    RAISE EXCEPTION 'Only management can run this diagnostic';
  END IF;

  SELECT * INTO _u
  FROM public.users
  WHERE length(_d10) = 10
    AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = _d10
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

  input_phone          := _phone;
  normalized_digits    := _norm;
  digits10             := _d10;
  profile_found        := _u.id IS NOT NULL;
  user_id              := _u.id;
  full_name            := _u.full_name;
  role                 := _u.role;
  is_active            := _u.is_active;
  pending_approval     := _u.pending_approval;
  archived             := _u.archived_at IS NOT NULL;
  can_login            := _u.id IS NOT NULL
                          AND _u.archived_at IS NULL
                          AND (_u.is_active = true OR _u.pending_approval = true);
  area_assigned        := _has_area;
  last_login_at        := _att.attempted_at;
  last_login_succeeded := _att.succeeded;
  RETURN NEXT;
END;
$function$;
