-- ============================================================
-- Notification System
-- ============================================================

-- 1. Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.notification_event_type AS ENUM (
    'report_submitted',
    'report_returned',
    'report_approved',
    'report_opened',
    'report_closed',
    'commission_changed',
    'admin_edited_report',
    'pending_signup'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_audience AS ENUM (
    'admins',
    'area_managers',
    'technicians',
    'specific_users'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Settings table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type public.notification_event_type NOT NULL,
  audience public.notification_audience NOT NULL,
  specific_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  push_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type, audience)
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_settings_select_authenticated"
  ON public.notification_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_settings_management_all"
  ON public.notification_settings FOR ALL TO authenticated
  USING (public.is_management(auth.uid()))
  WITH CHECK (public.is_management(auth.uid()));

CREATE TRIGGER trg_notification_settings_updated
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults: every event ON for the most relevant audience(s)
INSERT INTO public.notification_settings (event_type, audience, push_enabled, in_app_enabled, enabled) VALUES
  ('report_submitted',     'admins',        true, true, true),
  ('report_submitted',     'area_managers', true, true, true),
  ('report_returned',      'technicians',   true, true, true),
  ('report_returned',      'area_managers', true, true, true),
  ('report_approved',      'technicians',   true, true, true),
  ('report_approved',      'area_managers', true, true, true),
  ('report_opened',        'technicians',   true, true, true),
  ('report_opened',        'area_managers', true, true, true),
  ('report_closed',        'technicians',   true, true, true),
  ('report_closed',        'admins',        true, true, true),
  ('commission_changed',   'technicians',   true, true, true),
  ('admin_edited_report',  'technicians',   true, true, true),
  ('pending_signup',       'admins',        true, true, true)
ON CONFLICT (event_type, audience) DO NOTHING;

-- 3. Inbox table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type public.notification_event_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text,
  related_report_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_self_or_mgmt"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_management(auth.uid()));
CREATE POLICY "notifications_update_self"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_delete_self_or_mgmt"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_management(auth.uid()));
-- Inserts only via SECURITY DEFINER functions (no INSERT policy → blocked for clients).

-- 4. Push subscriptions -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subs_select_self_or_mgmt"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_management(auth.uid()));
CREATE POLICY "push_subs_insert_self"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subs_update_self"
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subs_delete_self_or_mgmt"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_management(auth.uid()));

-- 5. Push outbox (queue for edge function) ------------------------------
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text,
  event_type public.notification_event_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  error text
);
CREATE INDEX IF NOT EXISTS idx_push_outbox_pending
  ON public.push_outbox (created_at) WHERE delivered_at IS NULL;
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_outbox_select_mgmt"
  ON public.push_outbox FOR SELECT TO authenticated
  USING (public.is_management(auth.uid()));

-- 6. Resolve recipients --------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_notification_recipients(
  _event public.notification_event_type,
  _related_report_id uuid DEFAULT NULL,
  _related_user_id uuid DEFAULT NULL
) RETURNS TABLE(user_id uuid, in_app boolean, push boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
          OR u.id = _tech                       -- AM owns the report (self-report)
        )
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = _recip.in_app OR EXCLUDED.in_app,
        push   = _recip.push   OR EXCLUDED.push;

    ELSIF _r.audience = 'technicians' THEN
      -- For report-related events, only notify the report owner.
      -- For non-report events with no specific user, notify all techs.
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

  RETURN QUERY SELECT r.user_id, r.in_app, r.push FROM _recip r;
END;
$$;

-- 7. Enqueue helper -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _event public.notification_event_type,
  _title text,
  _body text,
  _link text DEFAULT NULL,
  _related_report_id uuid DEFAULT NULL,
  _related_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _r record;
BEGIN
  FOR _r IN
    SELECT * FROM public.resolve_notification_recipients(_event, _related_report_id, _related_user_id)
  LOOP
    IF _r.in_app THEN
      INSERT INTO public.notifications
        (user_id, event_type, title, body, link, related_report_id)
      VALUES (_r.user_id, _event, _title, _body, _link, _related_report_id);
    END IF;
    IF _r.push THEN
      INSERT INTO public.push_outbox
        (user_id, title, body, link, event_type)
      VALUES (_r.user_id, _title, _body, _link, _event);
    END IF;
  END LOOP;
END;
$$;

-- 8. Triggers -----------------------------------------------------------
-- 8a. Weekly report status changes
CREATE OR REPLACE FUNCTION public.notify_weekly_report_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tech_name text;
  _link text := '/admin/reports/' || NEW.id::text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO _tech_name FROM public.users WHERE id = NEW.technician_id;
    _tech_name := COALESCE(_tech_name, 'Technician');

    IF NEW.status = 'Submitted' THEN
      PERFORM public.enqueue_notification(
        'report_submitted',
        'Report submitted',
        _tech_name || ' submitted their weekly report.',
        _link, NEW.id, NULL);
    ELSIF NEW.status = 'Returned' THEN
      PERFORM public.enqueue_notification(
        'report_returned',
        'Report returned',
        'Your report needs corrections. ' || COALESCE(NEW.manager_note, ''),
        '/tech', NEW.id, NULL);
    ELSIF NEW.status = 'Approved' THEN
      PERFORM public.enqueue_notification(
        'report_approved',
        'Report approved',
        'Your weekly report has been approved.',
        '/tech', NEW.id, NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_weekly_report_status ON public.weekly_reports;
CREATE TRIGGER trg_notify_weekly_report_status
  AFTER UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_weekly_report_status();

-- 8b. New report inserted (open / closed handled by callers)
CREATE OR REPLACE FUNCTION public.notify_weekly_report_opened()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Draft' THEN
    PERFORM public.enqueue_notification(
      'report_opened',
      'Weekly report opened',
      'Your weekly report is open. Add jobs and submit before the deadline.',
      '/tech', NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_weekly_report_opened ON public.weekly_reports;
CREATE TRIGGER trg_notify_weekly_report_opened
  AFTER INSERT ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_weekly_report_opened();

-- 8c. Activity log (commission override / admin edit)
CREATE OR REPLACE FUNCTION public.notify_report_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.action_type = 'commission_override' THEN
    PERFORM public.enqueue_notification(
      'commission_changed',
      'Commission updated',
      COALESCE(NEW.note, 'Admin updated the commission for one of your reports.'),
      '/tech', NEW.weekly_report_id, NULL);
  ELSIF NEW.action_type LIKE 'admin_edit:%' THEN
    PERFORM public.enqueue_notification(
      'admin_edited_report',
      'Admin edited your report',
      COALESCE(NEW.note, 'Admin made changes to your report.'),
      '/tech', NEW.weekly_report_id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_report_activity ON public.report_activity_log;
CREATE TRIGGER trg_notify_report_activity
  AFTER INSERT ON public.report_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.notify_report_activity();

-- 8d. Week locked → report_closed
CREATE OR REPLACE FUNCTION public.notify_week_locked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_notification(
    'report_closed',
    'Week closed',
    'The week starting ' || to_char(NEW.week_start, 'Mon DD') || ' has been closed.',
    '/tech', NULL, NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_week_locked ON public.week_locks;
CREATE TRIGGER trg_notify_week_locked
  AFTER INSERT ON public.week_locks
  FOR EACH ROW EXECUTE FUNCTION public.notify_week_locked();

-- 8e. Pending signup
CREATE OR REPLACE FUNCTION public.notify_pending_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pending_approval = true AND (TG_OP = 'INSERT' OR OLD.pending_approval = false) THEN
    PERFORM public.enqueue_notification(
      'pending_signup',
      'New technician signup',
      COALESCE(NEW.full_name, 'A technician') || ' is awaiting approval.',
      '/admin/technicians', NULL, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pending_signup ON public.users;
CREATE TRIGGER trg_notify_pending_signup
  AFTER INSERT OR UPDATE OF pending_approval ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_pending_signup();

-- 9. RPC for users to mark notifications read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET read_at = now()
   WHERE user_id = auth.uid() AND read_at IS NULL;
$$;

-- 10. RPC the edge function calls to fetch & mark delivered
CREATE OR REPLACE FUNCTION public.claim_pending_push_batch(_limit int DEFAULT 50)
RETURNS TABLE(
  id uuid, user_id uuid, title text, body text, link text,
  event_type public.notification_event_type
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_management(auth.uid()) AND auth.uid() IS NOT NULL THEN
    -- Allow service role (auth.uid() IS NULL) and management.
    -- Other callers get nothing.
    RETURN;
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT po.id FROM public.push_outbox po
     WHERE po.delivered_at IS NULL
     ORDER BY po.created_at
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.push_outbox po
     SET delivered_at = now()
   WHERE po.id IN (SELECT id FROM picked)
   RETURNING po.id, po.user_id, po.title, po.body, po.link, po.event_type;
END;
$$;
