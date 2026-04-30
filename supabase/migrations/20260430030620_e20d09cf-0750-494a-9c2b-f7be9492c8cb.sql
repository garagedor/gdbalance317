CREATE OR REPLACE FUNCTION public.resolve_notification_recipients(
  _event public.notification_event_type,
  _related_report_id uuid DEFAULT NULL::uuid,
  _related_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(user_id uuid, in_app boolean, push boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _tech uuid;
BEGIN
  IF _related_report_id IS NOT NULL THEN
    SELECT wr.technician_id INTO _tech
    FROM public.weekly_reports wr
    WHERE wr.id = _related_report_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _recip (
    recipient_id uuid PRIMARY KEY,
    in_app boolean NOT NULL DEFAULT false,
    push boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  TRUNCATE _recip;

  FOR _r IN
    SELECT ns.*
    FROM public.notification_settings ns
    WHERE ns.event_type = _event
      AND ns.enabled = true
  LOOP
    IF _r.audience = 'admins' THEN
      INSERT INTO _recip (recipient_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.role = 'management'
        AND u.is_active = true
        AND u.archived_at IS NULL
      ON CONFLICT (recipient_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push = _recip.push OR EXCLUDED.push;

    ELSIF _r.audience = 'area_managers' THEN
      INSERT INTO _recip (recipient_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.role = 'area_manager'
        AND u.is_active = true
        AND u.archived_at IS NULL
        AND (
          _related_report_id IS NULL
          OR public.manages_technician(u.id, _tech)
          OR u.id = _tech
        )
      ON CONFLICT (recipient_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push = _recip.push OR EXCLUDED.push;

    ELSIF _r.audience = 'technicians' THEN
      INSERT INTO _recip (recipient_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.role IN ('technician', 'area_manager')
        AND u.is_active = true
        AND u.archived_at IS NULL
        AND (
          (_tech IS NOT NULL AND u.id = _tech)
          OR (_tech IS NULL AND _related_user_id IS NOT NULL AND u.id = _related_user_id)
          OR (_tech IS NULL AND _related_user_id IS NULL)
        )
      ON CONFLICT (recipient_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push = _recip.push OR EXCLUDED.push;

    ELSIF _r.audience = 'specific_users' THEN
      INSERT INTO _recip (recipient_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.id = ANY(_r.specific_user_ids)
        AND u.is_active = true
        AND u.archived_at IS NULL
      ON CONFLICT (recipient_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push = _recip.push OR EXCLUDED.push;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT r.recipient_id AS user_id,
         (r.in_app AND COALESCE(p.in_app_enabled, true)) AS in_app,
         (r.push AND COALESCE(p.push_enabled, true)) AS push
  FROM _recip r
  LEFT JOIN public.user_notification_prefs p
    ON p.user_id = r.recipient_id
   AND p.event_type = _event;
END;
$function$;