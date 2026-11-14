# Iron Merchant Management System — Work Completed

Source plan: architect.txt (PHASE PLAN 1 -> 9)

## Status: Phase 6 of 9 complete

| Phase | Name | Status |
|-------|------|--------|
| 1 | Database foundation | ✅ Completed |
| 2 | Product & pricing management | ✅ Completed |
| 3 | Inventory management | ✅ Completed |
| 4 | Purchase management + WAC | ✅ Completed |
| 5 | Cutting & scrap management | ✅ Completed |
| 6 | Sales & invoicing | Completed |
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
- Throwaway test data (ZZ-TEST purchases A1/B1/C1, products, supplier, pieces
  PC-0001..PC-0011) is LIVE on the hosted project by owner decision — wipe it
  before the first real business transaction.
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

Throwaway test data (owner-approved, 2026-11-14) verified against the hosted
project via SQL with the owner JWT claims set:
- Spec WAC example EXACT: Saria A 500 kg @ PKR 100,000 + 300 kg @ PKR 66,000
  => WAC PKR 207.50/kg, stock 800 kg / PKR 166,000
- Landed-cost allocation with rounding remainder: freight PKR 1,000 across
  three equal shafts => 333.33 / 333.33 / 333.34, item values reconcile
  exactly to PKR 31,000
- Reconciliation view: aggregates vs piece sums match for both test products
- Journals per purchase: DR 1200 Shaft Inventory / CR 2000 Accounts Payable,
  all balanced (difference 0.00)
- 11 stock movements (purchase_in, 1,100 kg / PKR 197,000); audit confirm logs written
- ZZ-TEST data KEPT on the hosted project per owner request; wipe before real use.

## Phase 5 — Cutting & scrap management (Completed)

Scope (per architect.txt):
- CUT RPC: lock source piece; validate status full|cut (reserved blocked);
  record outputs (actual measured ft/kg each); scrap -> scrap_lots;
  variance (source kg - outputs kg - scrap kg) -> cutting_loss_expense if real loss;
  source -> split; child pieces with parent lineage; cost allocated by output
  weight across usable pieces + scrap; scrap EXCLUDED from shaft WAC; journals +
  movements atomically; NO revenue, NO profit.
- REVERSAL RPC: allowed only if ALL outputs and scrap are untouched
  (unsold/uncut/available); otherwise blocked with a corrective-process message.
- Cutting register, variance report, scrap stock view.

Decisions (confirmed/derived):
- Cutting is a single-step confirmed operation (no draft stage; cutting_records
  has no draft status). Reversal restores the source's prior status
  ('full' if it has no parent, else 'cut').
- Value allocation: variance >= 0 -> scrap and cutting loss are each rounded
  to 2dp first (by source kg), children split the remainder by weight.
  variance < 0 (unexplained gain) -> loss = 0, whole value scaled across
  outputs + scrap by weight. All child shares capped at the remaining pot;
  the LAST output carries the deterministic remainder. Outputs + scrap +
  loss always reconcile exactly to the source carrying value.
- Children with a rounding remainder still reconcile exactly (no negative shares).
- cutting_records unique (owner_id, source_piece_id) replaced by a PARTIAL
  unique index on confirmed rows only — a source can be re-cut after reversal.
- New document sequence 'scrap' (SL-) for scrap lot numbering.
- cutting_records / cutting_outputs / scrap_lots are now select-only for app
  users; all writes happen inside the SECURITY DEFINER RPCs.
- WAC: balances updated as aggregate value/kg deltas (children in, source out);
  scrap value never enters shaft cost balances.

Deliverables:
- supabase/migrations/20261114000007_phase5_cutting.sql
  - scrap sequence (SL-) for existing owners; handle_new_user() updated
  - partial unique index cutting_records_one_confirmed_per_source
  - RLS: cutting_records/cutting_outputs/scrap_lots -> select-only
  - confirm_cutting(p_source_piece_id, p_cut_date, p_reference, p_notes,
    p_outputs jsonb, p_scrap_kg) — one transaction: lock source -> validate ->
    allocate -> record outputs -> create PC- child pieces (parent lineage) ->
    scrap lot (SL-) -> consume source -> shaft balances (scrap excluded) ->
    movements -> balanced journal (DR 1200/1210/6000 / CR 1200) -> audit
  - reverse_cutting(p_cutting_record_id) — lock, validate all outputs status='cut'
    and scrap untouched -> restore source -> retire children (status scrapped,
    value 0) and scrap lot -> aggregates restored -> reversal movements ->
    compensating journal (reference_type cutting_reversal, mirror image) -> audit.
    Originals are never deleted.
- src/server/actions/cutting.ts — createCutting (validates + RPC, redirects to
  detail), reverseCutting (RPC); outputs parsed from a hidden JSON input
- src/app/(app)/cutting/page.tsx — register (stats, search, status filter, pagination)
- src/app/(app)/cutting/new/page.tsx + src/components/cutting/new-cutting-form.tsx —
  source picker, dynamic output rows, scrap input, live reconciliation preview
  (mirrors the RPC, labeled preview-only), inline two-step confirm
- src/app/(app)/cutting/[id]/page.tsx — detail: source, outputs (piece links),
  scrap lot card, reconciliation check, journal entry lines, reversal panel
- src/app/(app)/cutting/variance/page.tsx — variance report (loss/gain cuts,
  totals confirmed-only, reversed cuts excluded from totals)
- src/app/(app)/cutting/scrap/page.tsx — scrap stock view (stats, status filter)
- src/components/cutting/reverse-cutting-button.tsx — two-step confirm with
  RPC error passthrough (blocked reversals show the reason)
- Sidebar: Cutting Management enabled (/cutting)

Live verification on the hosted project (owner-approved, ZZ-TEST data, SQL with
owner JWT claims, mirroring Phase 4's method):
- Cut PC-0001 (100 kg / PKR 20,000) into 35 kg + 60 kg + 3 kg scrap, 2 kg loss:
  children allocated 7,000.00 / 12,000.00; scrap 600.00; loss 400.00;
  pot exactly 20,000 traced. Movements, scrap lot SL-0001, balances
  800->795 kg / 318 ft / 9 pcs / value PKR 165,000 all matched piece sums
- Double-cut of same source rejected (P0001 'not available for cutting')
- reversal of CUT-0001 restored source to full + exact pre-cut balances
  (800/320/8/166,000) and journals mirrored (20,000 DR/CR, all 4 entries balanced)
- Re-cut after reversal (CUT-0002) succeeded — partial unique index works
- CUT-0002 reversed; baseline restored; reconciliation view matches for both
  ZZ-TEST products; all test journals balanced
- ZZ-TEST CUT-0001/CUT-0002 rows remain on the hosted project; wipe with the
  Phase 4 ZZ-TEST data before real use

Verification: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build`
succeeds (all routes compile; /cutting* are dynamic/partial-prerendered).
Migration 20261114000007 applied to the hosted project 2026-11-14
(`supabase db push --remote --yes`). No Docker/local Supabase used.

### Known issues / open items
- Phase 4 purchase landed-cost allocation shares the same rounding-cap edge case
  fixed here for cutting (many items + tiny additional costs could theoretically
  push the last item's allocation negative and violate CHECK >= 0). Not fixed in
  Phase 5 (out of scope); flag for a small Phase 4 follow-up.
- Reversal blocked path (child already sold/cut) cannot be exercised until
  Phase 6 sales exist; RPC enforces it and the UI passes through the message.
- Runtime UI smoke test against the hosted project not yet performed
  (needs owner login in a browser).

## Phase 6 - Sales & invoicing (Completed)

Scope (per architect.txt):
- SALE RPCs for (a) full piece, (b) cut piece, (c) scrap lot: lock piece/lot;
  validate availability; snapshot rate+weight; line amount = kg x rate; consume
  atomically; COGS at carrying value (scrap at scrap cost); AR + Revenue +
  COGS / Scrap COGS journals; piece -> sold.
- Invoice lifecycle draft -> confirmed; invoice print view; rate snapshots
  immutable once confirmed; reversal = credit note; confirmed invoices are
  NEVER deleted.
- Partial-length request = cut-then-sell in ONE atomic RPC (spec section 6.4).

Decisions (confirmed by owner 2026-11-14):
- Confirmation always posts to Accounts Receivable; customer payments are
  recorded in Phase 7.
- Invoices are single-type (full | cut | scrap); mixed-type invoices not allowed.
- Full/cut rates pre-fill from the effective-dated price list (editable);
  scrap rate is manual entry. The applied rate is snapshotted on the line.
- Multi-line invoices supported.
- sale_items_piece_key unique index DROPPED: it blocked re-sale of a piece
  after a sale reversal. Uniqueness of consumption is enforced transactionally
  (piece locked FOR UPDATE, must be status full|cut, then flips to sold).

Deliverables:
- supabase/migrations/20261114000008_phase6_sales.sql (applied 2026-11-14)
  - RLS: sales/sale_items -> insert + select own, update/delete only while
    status='draft'; purchase-style policies.
  - confirm_sale(p_sale_id): lock sale + pieces/lots (pieces by id, then lots)
    -> validate type match + line weights + recompute amounts (kg x rate,
    unrounded inputs, rounded at the end) -> consume pieces / decrement scrap
    lots (partial scrap sales supported) -> stock/cost balances per product
    (product_id lock order) -> negative-balance guard -> stock movements ->
    balanced journal (DR 1100 / CR 4000|4010, DR 5000|5010 / CR 1200|1210) ->
    audit. ONE transaction.
  - reverse_sale(p_sale_id): credit-note style; restores piece status
    (full/cut), scrap lot remaining qty/value, aggregates, compensating journal
    (reference_type sale_reversal); original never edited or deleted.
  - confirm_cut_sale(...): cutting + sale of the designated output in ONE
    transaction; two journals (cutting value transfer + sale). No revenue from
    cutting; sale posts AR/Revenue/COGS atomically with the cut.
- src/server/actions/sales.ts - draft CRUD, add/remove lines (server-side
  validated; weights fixed to piece measurement; scrap weight editable with
  lot remaining cap), confirm/reverse (RPC, P0001 -> friendly message),
  cut-and-sell (RPC), audit logging.
- src/server/actions/customers.ts - customer CRUD (delete blocked with
  friendly error while sales reference the customer).
- src/app/(app)/customers/ - list (search, active toggle), new, [id] (edit +
  recent sales + danger zone).
- src/app/(app)/sales/ - register (stats, status filter, search, pagination),
  new/ (tabs: "Invoice existing stock" draft flow + "Cut & sell partial
  length" atomic flow), [id]/ (draft editor + confirmed invoice view with
  Print button, journal lines, print CSS hides app chrome).
- src/components/sales/* - sale-form, add-sale-line-form (rate pre-fill from
  price list), cut-and-sell-form (outputs editor + allocation preview + sold
  output picker), confirm/reverse/delete/remove-line buttons, print-button.
- src/components/customers/* - customer-form, delete-customer-button.
- Sidebar: Sales & Invoices and Customers now enabled.

Live verification on the hosted project (owner-approved, ZZ-TEST data, SQL
with owner JWT claims set, same method as Phases 4/5):
- Full-piece sale PC-0001 (100 kg @ 500): piece -> sold; Saria A stock
  800 -> 700 kg / 8 -> 7 pcs / value 166,000 -> 146,000; sale journal balanced
  (DR 1100 50,000 / CR 4000 50,000; DR 5000 20,000 / CR 1200 20,000)
- Double-sell of PC-0001 rejected (P0001 'not available for a full sale');
  failed test rolled back cleanly (no orphan draft)
- reverse_sale(INV-0001): baseline restored exactly (800 / 8 / 166,000);
  piece full; sale_reversal journal balanced (mirror image)
- confirm_cut_sale on PC-0002 (outputs 60 kg + 40 kg, sell 60 kg @ 600):
  CUT-0003 + INV-0002 in one transaction; source split; PC-0015 sold /
  PC-0016 cut with 8,000.00 remaining; stock 740 / 8 pcs / 154,000; both
  journals balanced
- reverse_sale then reverse_cutting (CUT-0003): exact baseline restored
- Scrap sale INV-0003 (2 kg of SL-0003 @ 300, partial lot): lot 5 -> 3 kg /
  1,000 -> 600; journal DR 1100 600 / CR 4010 600; DR 5010 400 / CR 1210 400
- reverse_sale then reverse_cutting (CUT-0004): PC-0003 restored full;
  SL-0003 scrapped; baseline 800 / 8 / 166,000 restored
- Re-sale of PC-0001 after reversal (INV-0004, @ 550) confirmed then reversed -
  proves the dropped sale_items_piece_key index was required
- Global journal invariant: zero unbalanced entries across purchase, cutting,
  sale and reversal reference types
- inventory_reconciliation: OK for both ZZ-TEST products (balances == pieces)

Verification: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build`
succeeds (all routes compile; /sales and /customers routes dynamic /
partial-prerendered). Migration 20261114000008 applied to the hosted project
2026-11-14 (`supabase db push --remote --yes`); `supabase migration list
--remote` shows 20261113000001-20261114000008 all applied. No Docker/local
Supabase used.

### Known issues / open items
- ZZ-TEST artifacts from Phase 6 (ZZ-TEST customer, INV-0001..0004 reversed,
  CUT-0003/0004 reversed, PC-0015-0017 scrapped, SL-0003 scrapped) remain on
  the hosted project; wipe with the Phase 4/5 ZZ-TEST data before real use.
- Payment allocation to invoices (partial payments, multi-invoice allocation,
  advances) is Phase 7; confirmed invoices carry no paid/unpaid tracking yet.
- Purchase landed-cost allocation rounding-cap edge case from Phase 4 still
  open (carried; not in Phase 6 scope).
- Runtime UI smoke test against the hosted project still not performed (needs
  owner login in a browser). Print view uses browser print; no PDF export.
- Cut-and-sell posts the cutting journal (Shaft Inventory debit for the full
  children value) and the sale journal; both balanced by the invariant trigger.
