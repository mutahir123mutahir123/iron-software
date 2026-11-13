# Iron Merchant Management System — Work Completed

Source plan: architect.txt (PHASE PLAN 1 -> 9)

## Status: Phase 2 of 9 complete

| Phase | Name | Status |
|-------|------|--------|
| 1 | Database foundation | ✅ Completed |
| 2 | Product & pricing management | ✅ Completed |
| 3 | Inventory management | ⬜ Pending |
| 4 | Purchase management + WAC | ⬜ Pending |
| 5 | Cutting & scrap management | ⬜ Pending |
| 6 | Sales & invoicing | ⬜ Pending |
| 7 | Accounting | ⬜ Pending |
| 8 | Reports & dashboard | ⬜ Pending |
| 9 | Testing & deployment | ⬜ Pending |

## Environment decision (applies to all phases)

No local Supabase/Docker stack. The linked hosted Supabase project
(Iron-Software, ref `putnmauwyveoyvgnzsen`) is the only database.
The Supabase CLI is used only for remote operations:
`supabase migration list --remote` and `supabase db push --remote`.

## Phase 1 — Database foundation (Completed)

Scope (per architect.txt):
- Migrations for all entities: business_settings, profiles, product_categories,
  products, product_pricing (effective-dated), customers, suppliers,
  inventory_pieces, product_stock_balances, product_cost_balances,
  purchases/purchase_items, cutting_records/cutting_outputs, scrap_lots,
  sales/sale_items, payments/payment_allocations,
  expense_categories/expenses, stock_movements,
  accounts/journal_entries/journal_lines, audit_logs, document_sequences
- Constraints (positive values, valid statuses, exactly-one-of on sale lines,
  UNIQUE piece_code / document numbers per owner)
- RLS enabled on every owner-scoped table
- document_sequences row-locked increment
- Seed default Chart of Accounts + owner profile + doc sequences (supabase/seed.sql)
- Auth wiring

Deliverables:
- supabase/migrations/20261113000001_phase1_schema.sql
- supabase/migrations/20261113000002_phase1_functions.sql
- supabase/migrations/20261113000003_phase1_rls.sql
- supabase/seed.sql

Exit gate (per plan, amended for remote-only): migrations applied to the
hosted project (`supabase db push --remote`); RLS smoke tests pass.
Migrations 0001-0003 confirmed applied on the hosted project 2026-11-13.

## Phase 2 — Product & pricing management (Completed)

Scope (per architect.txt):
- Product CRUD (dia, grade, std length, wall thickness, wt/ft, category)
- Effective-dated full/cut price list
- Overlap prevention via daterange exclusion constraint
- Defined active-rate selection rule (product_rate_on)
- Product list/detail UI + price history view

Deliverables:
- supabase/migrations/20261113000004_phase2_pricing.sql
  - btree_gist extension
  - product_pricing_no_overlap exclusion constraint: at most one price row
    per (owner, product) may cover a given date (inclusive ranges,
    open-ended rows run to date 'infinity')
  - product_rate_on(p_product_id, p_on date): the rate applicable on a date
    is the unique row whose range covers it; no row => no rate (never guess)
- src/server/actions/products.ts — create/update product, add/delete price
  (validates, maps 23P01 overlap to friendly error, audit_logs entries)
- src/server/actions/categories.ts — add category, delete category
  (deletion blocked while products use it)
- src/server/audit.ts — shared audit_logs insert helper
- src/app/(app)/products/ page.tsx (list + search/filter), new/ (create),
  [id]/ (edit spec + price history + add price), categories/ (manage)
- src/components/products/* — product-form, pricing-form,
  delete-pricing-button, category-form, delete-category-button
- Header nav: Dashboard / Products links

Notes:
- Migration 20261113000004 applied to the hosted project 2026-11-13.
- Server Component pages re-render on demand (no force-dynamic export;
  this Next build uses cacheComponents).
- Product/price writes use direct table writes protected by owner-scoped
  RLS (master data); aggregates/balances remain RPC-only per plan.
- Audit logging on master-data writes is best-effort (does not block the
  write if the audit insert fails; the failure is logged to the server console).

Verification: `npx tsc --noEmit` clean; `npm run lint` clean;
`npm run build` succeeds; `supabase migration list --remote` shows
20261113000001-0004 all applied. No Docker/local Supabase used.

### Open items
- Chart of accounts: seeded default — ACCOUNTANT SIGN-OFF REQUIRED before
  production cutover (Phase 9 gate).
- Runtime UI smoke test against the hosted project not yet performed
  (needs owner login in a browser).
