-- Normalize phone matching to the last 10 digits (US numbering plan).
-- This makes signup ("3475429403") and login ("+1 347-542-9403", "13475429403", etc.)
-- match the same stored row regardless of how the user typed it.

CREATE OR REPLACE FUNCTION public.find_user_by_phone(_phone text)
RETURNS TABLE(id uuid, full_name text, is_active boolean, pending_approval boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH input AS (
    SELECT right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 10) AS digits10
  )
  SELECT u.id, u.full_name, u.is_active, u.pending_approval
  FROM public.users u, input
  WHERE u.archived_at IS NULL
    AND length(input.digits10) = 10
    AND right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = input.digits10
  ORDER BY u.is_active DESC NULLS LAST, u.created_at DESC
  LIMIT 1;
$function$;

-- Backfill: trim US country-code prefix on 11-digit numbers starting with "1".
-- (We have two such rows today: Solomon Albelia, Yarin Shoshan.)
UPDATE public.users
SET phone = substring(regexp_replace(phone, '\D', '', 'g') FROM 2)
WHERE phone IS NOT NULL
  AND length(regexp_replace(phone, '\D', '', 'g')) = 11
  AND left(regexp_replace(phone, '\D', '', 'g'), 1) = '1';

-- Admin diagnostic: given a phone string, return what the system sees.
-- Used by the Admin → Users page debug tool.
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
  can_login boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _norm text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  _d10  text := right(_norm, 10);
  _u    public.users%ROWTYPE;
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

  input_phone       := _phone;
  normalized_digits := _norm;
  digits10          := _d10;
  profile_found     := _u.id IS NOT NULL;
  user_id           := _u.id;
  full_name         := _u.full_name;
  role              := _u.role;
  is_active         := _u.is_active;
  pending_approval  := _u.pending_approval;
  archived          := _u.archived_at IS NOT NULL;
  can_login         := _u.id IS NOT NULL
                       AND _u.archived_at IS NULL
                       AND (_u.is_active = true OR _u.pending_approval = true);
  RETURN NEXT;
END;
$function$;