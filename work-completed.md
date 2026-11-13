# Iron Merchant Management System — Work Completed

Source plan: architect.txt (PHASE PLAN 1 -> 9)

## Status: Phase 1 of 9 complete

| Phase | Name | Status |
|-------|------|--------|
| 1 | Database foundation | ✅ Completed |
| 2 | Product & pricing management | ⬜ Pending |
| 3 | Inventory management | ⬜ Pending |
| 4 | Purchase management + WAC | ⬜ Pending |
| 5 | Cutting & scrap management | ⬜ Pending |
| 6 | Sales & invoicing | ⬜ Pending |
| 7 | Accounting | ⬜ Pending |
| 8 | Reports & dashboard | ⬜ Pending |
| 9 | Testing & deployment | ⬜ Pending |

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

Exit gate (per plan): `supabase db reset` applies clean; RLS smoke tests pass.

### Open items
- Chart of accounts: seeded default — ACCOUNTANT SIGN-OFF REQUIRED before
  production cutover (Phase 9 gate).
