-- Add archived_at column to track soft-deleted users.
-- A user is "Deleted" when archived_at IS NOT NULL.
-- A user is "Inactive" when is_active = false AND archived_at IS NULL.
-- A user is "Active" when is_active = true AND archived_at IS NULL.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS users_archived_at_idx ON public.users(archived_at);

-- Soft-delete an account: revoke access, scrub assignments, but keep the row
-- so historical reports/jobs/activity continue to display the user's name.
-- Caller must be management; auth-side deletion is performed by the edge
-- function (service role) — this RPC handles only public-schema cleanup.
CREATE OR REPLACE FUNCTION public.archive_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  IF NOT public.is_management(auth.uid()) THEN
    RAISE EXCEPTION 'Only management can archive users';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot archive your own account';
  END IF;

  SELECT full_name INTO _name FROM public.users WHERE id = _user_id;
  IF _name IS NULL THEN
    RETURN;
  END IF;

  -- Clear active assignments so the user vanishes from active dropdowns,
  -- but keep their name (with a (deactivated) suffix) for historical clarity.
  UPDATE public.users
  SET
    is_active        = false,
    archived_at      = COALESCE(archived_at, now()),
    area_id          = NULL,
    area_manager_id  = NULL,
    full_name        = CASE
      WHEN full_name LIKE '%(deactivated)' THEN full_name
      ELSE full_name || ' (deactivated)'
    END
  WHERE id = _user_id;

  -- user_areas has ON DELETE CASCADE on user_id, but we don't delete the row;
  -- explicitly clear all area memberships so they don't appear on filters.
  DELETE FROM public.user_areas WHERE user_id = _user_id;

  -- Detach any technicians whose area_manager_id pointed at this user.
  UPDATE public.users
  SET area_manager_id = NULL
  WHERE area_manager_id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_user(uuid) TO authenticated;

-- Hard delete is only safe if the user has zero history. This helper checks.
CREATE OR REPLACE FUNCTION public.user_has_history(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.weekly_reports WHERE technician_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.weekly_reports WHERE report_sent_by_user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.office_jobs
                WHERE technician_id = _user_id
                   OR created_by_user_id = _user_id
                   OR updated_by_user_id = _user_id
                   OR deleted_by_user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.report_activity_log WHERE action_by_user_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.user_has_history(uuid) TO authenticated;

-- Hide archived users from the active-roster RLS view of office staff and area
-- managers so dropdowns naturally exclude them. Management still sees them.
DROP POLICY IF EXISTS users_select_self_or_management ON public.users;
CREATE POLICY users_select_self_or_management
ON public.users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_management(auth.uid())
  OR (
    archived_at IS NULL
    AND (
      (public.is_area_manager(auth.uid()) AND (area_manager_id = auth.uid() OR public.users_share_area(auth.uid(), id)))
      OR public.is_office_staff(auth.uid())
    )
  )
);