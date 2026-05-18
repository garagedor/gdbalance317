## Goal

Make `lm_cash`, `lm_check`, `lm_parts` flow through every total and KPI exactly per the locked CRM formulas, and add a Company↔LM settlement view on the LM (Area Manager) dashboard.

## 1. Per-job formula fix (DB + client mirror)

Current bug: `lm_check` is treated as a no-fee payment. The spec requires `lm_check` to always carry a 10% processing fee.

**DB migration** — update `public.calc_weekly_report_job()`:
- `payment_fee` adds `0.10 * lm_check`
- `total_profit` = `job_total - tech_parts - company_parts - lm_parts - payment_fee` (already includes lm_parts; fee now also includes lm_check)
- `job_total` unchanged (already includes lm_cash + lm_check at full value)
- Backfill: `UPDATE weekly_report_jobs SET updated_at = now() WHERE lm_check > 0` to retrigger calc

**Client mirror** — `src/lib/finance/calcNew.ts`:
- Add `0.10 * lm_check` to `payment_fee`
- Keep `lm_parts` in `total_profit` deduction
- Tests in `src/test/finance.test.ts`: add cases for lm_cash only, lm_check only (with fee), lm_parts only, and combined.

## 2. Rollups (per-week / per-tech)

In `weekly_reports` the existing aggregate columns (`total_company_parts`, `total_my_parts`, `total_sales`, `tech_gross_payout`, etc.) are computed by an existing aggregation trigger / function. Update it so:
- `total_sales` / "Total Payments" includes `SUM(lm_cash + lm_check)`
- Parts total includes `SUM(lm_parts)`
- Profit / payout figures derive from the corrected `total_profit` (already fixed via per-job trigger)

UI pages that re-sum on the client (`TechReport.tsx`, `ManagerReport.tsx`, `AdminReport.tsx`, `OfficeJobs.tsx`, `JobsTable.tsx` footer): update any "Total Payments", "Total Parts", "Total Fees" rows to include the LM columns.

## 3. LM ↔ Company settlement (new on Area Manager dashboard)

**Schema:** add `manager_profit_percent numeric NOT NULL DEFAULT 40` to `public.areas` (per-area config; admin-editable in Area Manager settings page).

**Per-job derivation (computed in the LM dashboard query, not stored):**
```text
lm_owes_company = lm_cash + lm_check
company_owes_lm = (status = 'Approved' ? total_profit * area.manager_profit_percent / 100 : 0)
                + lm_parts
net_lm_balance  = company_owes_lm - lm_owes_company
```

**UI:** new section on Area Manager dashboard (and inside each report detail for that manager's area) showing the three figures per week, per area, per tech, plus a per-job breakdown table column.

**Admin:** in area settings, expose `manager_profit_percent` field.

## 4. Verification checklist

- Jobs with all LM fields = 0 produce identical totals to before (defaults preserve legacy reports).
- A job with only `lm_check = 100` shows `payment_fee = 10`, `job_total = 100`, profit reduced by 10.
- A job with only `lm_parts = 50` shows profit reduced by 50, no fee.
- LM dashboard math matches: `net = company_owes_lm − lm_owes_company`.
- `lm_check` 10% fee applies in every fee-related place (no toggle, no exception).

## Technical notes

- Files touched: `supabase/migrations/<new>.sql` (trigger update + areas column), `src/lib/finance/calcNew.ts`, `src/test/finance.test.ts`, `src/components/JobsTable.tsx` (footer totals + LM settlement columns optional), `src/pages/manager/ManagerReport.tsx` and a new LM dashboard section, `src/pages/admin/AdminReport.tsx` rollup row, `src/pages/admin/Areas*` (settings field for `manager_profit_percent`), and the `Database` types regenerate after migration.
- `weekly_reports` aggregation: locate the existing `recalc_weekly_report_totals` (or equivalent) trigger function and extend its SUMs with the LM columns; if no such function exists and totals are computed client-side, only the client rollups need updating.
- All currency rounded to 2 decimals via existing `r2` / `ROUND(.., 2)`.
