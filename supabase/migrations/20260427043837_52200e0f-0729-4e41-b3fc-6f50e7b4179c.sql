CREATE OR REPLACE FUNCTION public.weekly_reports_payout_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _is_mgmt boolean := public.is_management(_actor);
  _is_am boolean := public.is_area_manager(_actor);
  _is_self boolean := (NEW.technician_id = _actor);
  _abs_balance numeric;
BEGIN
  IF NEW.net_balance > 0.005 THEN
    NEW.balance_direction := 'company_owes_technician';
  ELSIF NEW.net_balance < -0.005 THEN
    NEW.balance_direction := 'technician_owes_company';
  ELSE
    NEW.balance_direction := 'settled';
  END IF;

  _abs_balance := ABS(NEW.net_balance);

  IF TG_OP = 'INSERT'
     OR NEW.amount_transferred IS DISTINCT FROM OLD.amount_transferred
     OR NEW.net_balance        IS DISTINCT FROM OLD.net_balance
  THEN
    IF _abs_balance < 0.005 THEN
      NEW.balance_payment_status := 'settled';
    ELSIF NEW.amount_transferred < 0.005 THEN
      NEW.balance_payment_status := 'open';
    ELSIF NEW.amount_transferred + 0.005 >= _abs_balance THEN
      NEW.balance_payment_status := 'settled';
    ELSE
      NEW.balance_payment_status := 'partial';
    END IF;
  END IF;

  -- Area-manager payout-tracking restrictions only apply when the AM is
  -- acting on someone ELSE's report (team-management context).
  -- When the AM owns the report (it's their own self-report) they act as
  -- a technician and may freely edit jobs/totals on Draft/Returned reports.
  IF TG_OP = 'UPDATE' AND _is_am AND NOT _is_mgmt AND NOT _is_self THEN
    IF OLD.status <> 'Approved' THEN
      RAISE EXCEPTION 'Area managers can only update reports after they are Approved';
    END IF;

    IF NOT public.manages_technician(_actor, NEW.technician_id) THEN
      RAISE EXCEPTION 'Area manager does not manage this technician';
    END IF;

    IF NEW.status        IS DISTINCT FROM OLD.status        OR
       NEW.technician_id IS DISTINCT FROM OLD.technician_id OR
       NEW.area_id       IS DISTINCT FROM OLD.area_id       OR
       NEW.week_start    IS DISTINCT FROM OLD.week_start    OR
       NEW.week_end      IS DISTINCT FROM OLD.week_end      OR
       NEW.manager_note  IS DISTINCT FROM OLD.manager_note  OR
       NEW.total_sales            IS DISTINCT FROM OLD.total_sales            OR
       NEW.total_card_amount      IS DISTINCT FROM OLD.total_card_amount      OR
       NEW.total_cash_amount      IS DISTINCT FROM OLD.total_cash_amount      OR
       NEW.total_card_tip_amount  IS DISTINCT FROM OLD.total_card_tip_amount  OR
       NEW.total_cash_tip_amount  IS DISTINCT FROM OLD.total_cash_tip_amount  OR
       NEW.total_tips             IS DISTINCT FROM OLD.total_tips             OR
       NEW.total_card_fee         IS DISTINCT FROM OLD.total_card_fee         OR
       NEW.total_my_parts         IS DISTINCT FROM OLD.total_my_parts         OR
       NEW.total_company_parts    IS DISTINCT FROM OLD.total_company_parts    OR
       NEW.total_tech_30          IS DISTINCT FROM OLD.total_tech_30          OR
       NEW.total_company_70       IS DISTINCT FROM OLD.total_company_70       OR
       NEW.tech_gross_payout      IS DISTINCT FROM OLD.tech_gross_payout      OR
       NEW.tech_cash_collected    IS DISTINCT FROM OLD.tech_cash_collected    OR
       NEW.company_cash_collected IS DISTINCT FROM OLD.company_cash_collected OR
       NEW.net_balance            IS DISTINCT FROM OLD.net_balance            OR
       NEW.tech_net_profit        IS DISTINCT FROM OLD.tech_net_profit
    THEN
      RAISE EXCEPTION 'Area managers may only update payout tracking fields';
    END IF;

    IF NEW.report_sent_to_technician IS DISTINCT FROM OLD.report_sent_to_technician
       AND NEW.report_sent_to_technician = true THEN
      NEW.report_sent_at := COALESCE(NEW.report_sent_at, now());
      NEW.report_sent_by_user_id := COALESCE(NEW.report_sent_by_user_id, _actor);
    END IF;

    IF NEW.amount_transferred IS DISTINCT FROM OLD.amount_transferred
       AND NEW.amount_transferred > 0 THEN
      NEW.payment_sent_at := COALESCE(NEW.payment_sent_at, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;