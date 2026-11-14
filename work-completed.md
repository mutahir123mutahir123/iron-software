# Iron Merchant Management System — Work Completed

Source plan: architect.txt (PHASE PLAN 1 -> 9)

## Status: Phase 4 of 9 complete

| Phase | Name | Status |
|-------|------|--------|
| 1 | Database foundation | ✅ Completed |
| 2 | Product & pricing management | ✅ Completed |
| 3 | Inventory management | ✅ Completed |
| 4 | Purchase management + WAC | ✅ Completed |
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

## Phase 3 — Inventory management (Completed)

Scope (per architect.txt):
- Individual piece records list with search/filter (piece code, product,
  status) and pagination
- Aggregate stock/cost balances remain RPC-only; added a read-only
  reconciliation view for drift detection
- Piece history page: lineage (purchase -> cutting -> sale) and stock
  movement timeline
- Frontend restyled to the Stitch "Terra — Organic Design" system
  (warm cream, forest green, Literata + Nunito Sans, 12px radius)

Deliverables:
- supabase/migrations/20261113000005_phase3_inventory.sql
  - view public.inventory_reconciliation (security_invoker): per product,
    aggregate stock/cost balances vs SUM of eligible pieces
    (status full/cut/reserved) with piece counts and values
  - Applied to the hosted project 2026-11-13 (`supabase db push --remote --yes`)
- src/app/(app)/inventory/page.tsx — stats (carrying value + blended WAC,
  sellable pieces/kg, scrap reserve, reconciliation status), filters,
  paginated table with origin lineage (PO / CUT / parent piece)
- src/app/(app)/inventory/[id]/page.tsx — piece detail: measurements,
  carrying value, lineage (received via purchase / created by cutting /
  consumed by cutting / parent / children / sold via invoice), movement
  history timeline, product card
- src/app/(app)/inventory/reconciliation/page.tsx — per-product and totals
  comparison of balances vs pieces, OK/drift status
- src/components/inventory/*.tsx — StatusChip, StatCard
- Frontend-wide restyle to Terra: src/app/globals.css design tokens,
  root layout fonts (Literata/Nunito Sans via next/font), sidebar app shell
  (src/components/app-shell.tsx, mobile drawer), login page, dashboard,
  products pages (zinc/amber removed everywhere; dark mode classes dropped —
  the Stitch design is LIGHT-only)
- src/lib/format.ts — added formatPkr / formatDate
- Added @phosphor-icons/react (icon family per frontend taste rules; none
  was installed)
- (app)/layout.tsx exports `instant = false`: every route in the segment
  reads the session cookie and per-user data, so instant-navigation
  validation is opted out (blocking SSR, same as before cacheComponents)

Notes:
- No pieces exist in the hosted DB yet (purchases are Phase 4), so the
  inventory pages show empty states with real zero/empty aggregates.
- No manual "add piece" flow: pieces must be created by the purchase
  confirmation RPC (Phase 4) to keep WAC and accounting consistent.
- Stitch design features not implemented (no matching schema/steps):
  yard bays, QR scanner, weighbridge telemetry, metallurgical compliance,
  "+ Add Physical Piece", Export CSV. None are in Phase 3 scope.
- Sidebar shows future modules (Cutting, Purchases, Sales, Customers,
  Suppliers, Payments, Reports, Settings) as disabled "Soon" entries.

Verification: `npx tsc --noEmit` clean; `npm run lint` clean;
`npm run build` succeeds (all routes compile; /inventory and siblings are
dynamic). Dev server smoke: /login renders 200; /inventory returns 307
(redirect to login when unauthenticated). Runtime UI test against the
hosted project with the owner login not yet performed.
- Fix after dev-console errors ("Date.now() unstable while prerendering
  at AppLayout"): session read in (app)/layout.tsx moved into a
  `<Suspense>` boundary (BusinessName component); AppShell now takes
  `businessName: ReactNode`. Routes are now partial-prerendered (◐)
  instead of blocking.

### Open items
- Chart of accounts: seeded default — ACCOUNTANT SIGN-OFF REQUIRED before
  production cutover (Phase 9 gate).
- Runtime UI smoke test against the hosted project not yet performed
  (needs owner login in a browser).

## Phase 4 — Purchase management + WAC (Completed)

Scope (per architect.txt):
- Purchase draft -> receiving (per-shaft ft/kg entry) -> CONFIRM RPC
- confirm_purchase: lock draft -> validate -> landed-cost allocation by weight
  (remainder to last item) -> create inventory_pieces (PC- codes from the new
  `piece` document sequence) -> upsert product_stock_balances +
  product_cost_balances (locked by product in product_id order) ->
  stock_movements -> balanced journal (DR 1200 Shaft Inventory /
  CR 2000 Accounts Payable) -> audit log. ONE transaction.
- WAC is derived as value/kg from the balances (no separate stored WAC column).
- Supplier master + purchase register UI

Decisions (confirmed by owner 2026-11-14):
- Confirmation always posts to Accounts Payable; payment happens in Phase 7.
- Per-item purchase cost entered manually (not rate x kg).
- piece_code auto-generated via sequence (PC-0001...); not user-editable.
- Purchase reversal deferred to a later phase.
- No changes to existing tables beyond RLS policy tightening and the new sequence.

Deliverables:
- supabase/migrations/20261114000006_phase4_purchases.sql
  - `piece` document sequence inserted for existing owners; handle_new_user()
    updated so future owners get it too
  - RLS: purchases/purchase_items -> insert + select own, update/delete only
    while status='draft' (items: only while parent purchase is a draft);
    inventory_pieces -> select-only for authenticated (RPC-created only).
    Aggregates/movements/journals remain RPC-only as before.
  - confirm_purchase(p_purchase_id) SECURITY DEFINER RPC with row locks in
    product_id order; deterministic weight-based allocation; reconciles exactly
- src/server/parse.ts — shared numeric form parsers
- src/server/actions/purchases.ts — create/update/delete draft, add/remove
  item, confirmPurchase (RPC, error mapping: P0001 -> friendly message);
  audit logging on draft CRUD
- src/server/actions/suppliers.ts — supplier CRUD; delete blocked with a
  friendly error while purchases reference the supplier (FK restrict)
- src/app/(app)/purchases/page.tsx — register (stats, status filter, search,
  pagination)
- src/app/(app)/purchases/new/page.tsx — create draft (redirects to detail)
- src/app/(app)/purchases/[id]/page.tsx — draft editor (header form, add/remove
  shaft rows, live totals + per-product WAC preview) and read-only confirmed
  view (items with allocated landed cost, piece links, journal entry lines)
- src/app/(app)/suppliers/ — list, new, [id] (edit + danger-zone delete),
  recent purchases table
- src/components/purchases/*.tsx, src/components/suppliers/*.tsx
- Sidebar: Purchases and Suppliers now enabled (no longer "Soon")
- StatusChip: added draft/confirmed/cancelled/reversed styles

Notes:
- Drafts consume a purchase number at creation (PUR-0001...); gaps possible if
  a draft is deleted. Piece codes are consumed only at confirmation.
- Landed-cost preview shown in the UI mirrors the RPC (weight-based,
  remainder to last item); the RPC assignment is authoritative.
- Purchase reversal and supplier payment allocation are NOT part of this
  phase (Phase 7). Confirmed purchases cannot be edited or deleted.
- Runtime smoke test against the hosted project with the owner login still
  not performed. No test purchase has been created on the hosted DB (it would
  create permanent pieces + journal entries).

Verification: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build`
succeeds (all routes compile; /purchases and /suppliers are dynamic).
Migration 20261114000006 applied to the hosted project 2026-11-14
(`supabase db push --remote --yes`); `supabase migration list --remote` shows
20261113000001-20261114000006 all applied. No Docker/local Supabase used.
WAC example from the spec (500 kg @ PKR 100,000 + 300 kg @ PKR 66,000 =>
PKR 207.50/kg) has NOT been exercised yet — it requires a confirmed test
purchase and was left out to avoid permanent test data on the hosted project.
