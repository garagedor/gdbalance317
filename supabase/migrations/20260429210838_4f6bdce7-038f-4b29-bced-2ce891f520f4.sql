-- 1) Per-user preference table
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_id uuid NOT NULL,
  event_type notification_event_type NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type)
);

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_notif_prefs_select_self_or_mgmt"
  ON public.user_notification_prefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_management(auth.uid()));

CREATE POLICY "user_notif_prefs_insert_self"
  ON public.user_notification_prefs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_notif_prefs_update_self"
  ON public.user_notification_prefs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_notif_prefs_delete_self"
  ON public.user_notification_prefs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_user_notif_prefs_updated
  BEFORE UPDATE ON public.user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Patch the recipient resolver to honor per-user mutes
CREATE OR REPLACE FUNCTION public.resolve_notification_recipients(_event notification_event_type, _related_report_id uuid DEFAULT NULL::uuid, _related_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, in_app boolean, push boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _tech uuid;
  _area uuid;
BEGIN
  IF _related_report_id IS NOT NULL THEN
    SELECT technician_id, area_id INTO _tech, _area
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
        push   = _recip.push   OR EXCLUDED.push;

    ELSIF _r.audience = 'area_managers' THEN
      INSERT INTO _recip (user_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.role = 'area_manager' AND u.is_active = true AND u.archived_at IS NULL
        AND (
          _related_report_id IS NULL
          OR public.manages_technician(u.id, _tech)
          OR u.id = _tech
        )
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push   = _recip.push   OR EXCLUDED.push;

    ELSIF _r.audience = 'technicians' THEN
      INSERT INTO _recip (user_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.role IN ('technician','area_manager')
        AND u.is_active = true AND u.archived_at IS NULL
        AND (
          (_tech IS NOT NULL AND u.id = _tech)
          OR (_tech IS NULL AND _related_user_id IS NOT NULL AND u.id = _related_user_id)
          OR (_tech IS NULL AND _related_user_id IS NULL)
        )
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push   = _recip.push   OR EXCLUDED.push;

    ELSIF _r.audience = 'specific_users' THEN
      INSERT INTO _recip (user_id, in_app, push)
      SELECT u.id, _r.in_app_enabled, _r.push_enabled
      FROM public.users u
      WHERE u.id = ANY(_r.specific_user_ids)
        AND u.is_active = true AND u.archived_at IS NULL
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push   = _recip.push   OR EXCLUDED.push;
    END IF;
  END LOOP;

  -- Apply per-user opt-outs
  RETURN QUERY
  SELECT r.user_id,
         (r.in_app AND COALESCE(p.in_app_enabled, true)) AS in_app,
         (r.push   AND COALESCE(p.push_enabled,   true)) AS push
  FROM _recip r
  LEFT JOIN public.user_notification_prefs p
    ON p.user_id = r.user_id AND p.event_type = _event;
END;
$function$;