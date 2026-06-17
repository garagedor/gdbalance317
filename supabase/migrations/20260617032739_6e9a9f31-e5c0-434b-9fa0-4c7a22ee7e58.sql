DROP POLICY IF EXISTS weekly_reports_update_tech ON public.weekly_reports;
CREATE POLICY weekly_reports_update_tech
  ON public.weekly_reports FOR UPDATE TO authenticated
  USING (
    technician_id = auth.uid()
    AND status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
    AND (status = 'Returned'::public.report_status OR NOT public.is_week_locked(week_start))
  )
  WITH CHECK (technician_id = auth.uid());

DROP POLICY IF EXISTS weekly_reports_update_area_manager_self ON public.weekly_reports;
CREATE POLICY weekly_reports_update_area_manager_self
  ON public.weekly_reports FOR UPDATE TO authenticated
  USING (
    technician_id = auth.uid()
    AND status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
    AND (status = 'Returned'::public.report_status OR NOT public.is_week_locked(week_start))
  )
  WITH CHECK (technician_id = auth.uid());

DROP POLICY IF EXISTS jobs_insert_tech ON public.weekly_report_jobs;
CREATE POLICY jobs_insert_tech
  ON public.weekly_report_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
        AND (r.status = 'Returned'::public.report_status OR NOT public.is_week_locked(r.week_start))
    )
  );

DROP POLICY IF EXISTS jobs_insert_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_insert_area_manager_self
  ON public.weekly_report_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
        AND (r.status = 'Returned'::public.report_status OR NOT public.is_week_locked(r.week_start))
    )
  );

DROP POLICY IF EXISTS jobs_update_tech ON public.weekly_report_jobs;
CREATE POLICY jobs_update_tech
  ON public.weekly_report_jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
        AND (r.status = 'Returned'::public.report_status OR NOT public.is_week_locked(r.week_start))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
        AND (r.status = 'Returned'::public.report_status OR NOT public.is_week_locked(r.week_start))
    )
  );

DROP POLICY IF EXISTS jobs_update_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_update_area_manager_self
  ON public.weekly_report_jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
        AND (r.status = 'Returned'::public.report_status OR NOT public.is_week_locked(r.week_start))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
        AND (r.status = 'Returned'::public.report_status OR NOT public.is_week_locked(r.week_start))
    )
  );

DROP POLICY IF EXISTS jobs_delete_tech ON public.weekly_report_jobs;
CREATE POLICY jobs_delete_tech
  ON public.weekly_report_jobs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
        AND (r.status = 'Returned'::public.report_status OR NOT public.is_week_locked(r.week_start))
    )
  );

DROP POLICY IF EXISTS jobs_delete_area_manager_self ON public.weekly_report_jobs;
CREATE POLICY jobs_delete_area_manager_self
  ON public.weekly_report_jobs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.weekly_reports r
      WHERE r.id = weekly_report_jobs.weekly_report_id
        AND r.technician_id = auth.uid()
        AND r.status = ANY (ARRAY['Draft'::public.report_status, 'Returned'::public.report_status])
        AND (r.status = 'Returned'::public.report_status OR NOT public.is_week_locked(r.week_start))
    )
  );