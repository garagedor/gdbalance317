-- =========================================================
-- 1) Join table: user_areas
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_areas (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_user_areas_area ON public.user_areas(area_id);
CREATE INDEX IF NOT EXISTS idx_user_areas_user ON public.user_areas(user_id);

-- Only one primary per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_areas_one_primary
  ON public.user_areas(user_id) WHERE is_primary = true;

ALTER TABLE public.user_areas ENABLE ROW LEVEL SECURITY;

-- RLS for user_areas
DROP POLICY IF EXISTS user_areas_select ON public.user_areas;
CREATE POLICY user_areas_select ON public.user_areas
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_management(auth.uid())
    OR public.is_area_manager(auth.uid())
    OR public.is_office_staff(auth.uid())
  );

DROP POLICY IF EXISTS user_areas_insert_management ON public.user_areas;
CREATE POLICY user_areas_insert_management ON public.user_areas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_management(auth.uid()));

DROP POLICY IF EXISTS user_areas_update_management ON public.user_areas;
CREATE POLICY user_areas_update_management ON public.user_areas
  FOR UPDATE TO authenticated
  USING (public.is_management(auth.uid()))
  WITH CHECK (public.is_management(auth.uid()));

DROP POLICY IF EXISTS user_areas_delete_management ON public.user_areas;
CREATE POLICY user_areas_delete_management ON public.user_areas
  FOR DELETE TO authenticated
  USING (public.is_management(auth.uid()));

-- =========================================================
-- 2) Backfill from users.area_id (one-time, idempotent)
-- =========================================================
INSERT INTO public.user_areas (user_id, area_id, is_primary)
SELECT u.id, u.area_id, true
FROM public.users u
WHERE u.area_id IS NOT NULL
ON CONFLICT (user_id, area_id) DO UPDATE
  SET is_primary = true;

-- =========================================================
-- 3) Keep user_areas in sync when admin sets users.area_id
-- =========================================================
CREATE OR REPLACE FUNCTION public.sync_user_primary_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When primary area changes (or is set on insert), reflect into join table.
  IF NEW.area_id IS NOT NULL THEN
    -- Demote previous primary
    UPDATE public.user_areas
       SET is_primary = false
     WHERE user_id = NEW.id
       AND area_id IS DISTINCT FROM NEW.area_id
       AND is_primary = true;

    -- Upsert the new primary membership
    INSERT INTO public.user_areas (user_id, area_id, is_primary)
    VALUES (NEW.id, NEW.area_id, true)
    ON CONFLICT (user_id, area_id) DO UPDATE
      SET is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_primary_area ON public.users;
CREATE TRIGGER trg_sync_user_primary_area
AFTER INSERT OR UPDATE OF area_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_user_primary_area();

-- =========================================================
-- 4) Helper functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.user_area_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT area_id FROM public.user_areas WHERE user_id = _user_id
  UNION
  SELECT area_id FROM public.users WHERE id = _user_id AND area_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.user_has_area(_user_id uuid, _area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_areas
    WHERE user_id = _user_id AND area_id = _area_id
  ) OR EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND area_id = _area_id
  );
$$;

-- Two users share at least one area
CREATE OR REPLACE FUNCTION public.users_share_area(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_area_ids(_a) a
    JOIN public.user_area_ids(_b) b ON a = b
  );
$$;

-- =========================================================
-- 5) Expand manages_technician to area-overlap rule
--    (keeps existing direct area_manager_id link as a fast-path)
-- =========================================================
CREATE OR REPLACE FUNCTION public.manages_technician(_manager_id uuid, _tech_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Direct assignment
    EXISTS (
      SELECT 1 FROM public.users t
      WHERE t.id = _tech_id
        AND t.role = 'technician'
        AND t.area_manager_id = _manager_id
    )
    -- OR area overlap: manager is area_manager and shares any assigned area with the tech
    OR (
      public.is_area_manager(_manager_id)
      AND EXISTS (
        SELECT 1 FROM public.users t
        WHERE t.id = _tech_id
          AND t.role IN ('technician','area_manager')
          AND public.users_share_area(_manager_id, t.id)
      )
    );
$$;

-- =========================================================
-- 6) Allow area managers to view users they share areas with;
--    allow office staff to view active users (needed for follow-ups).
-- =========================================================
DROP POLICY IF EXISTS users_select_self_or_management ON public.users;
CREATE POLICY users_select_self_or_management ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_management(auth.uid())
    OR (
      public.is_area_manager(auth.uid())
      AND (
        area_manager_id = auth.uid()
        OR public.users_share_area(auth.uid(), id)
      )
    )
    OR public.is_office_staff(auth.uid())
  );
