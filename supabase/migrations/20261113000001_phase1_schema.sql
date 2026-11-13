-- Phase 1 — core schema for the Iron Merchant Management System.
-- Spec: Iron_Merchant_Software_Core_Understanding.docx, sections 3-12.
-- Conventions: UUID PKs, owner_id on every business table (references auth.users),
-- NUMERIC for money/kg/ft/rates (never float), owner-scoped uniqueness.

-- ---------------------------------------------------------------------------
-- Owner profile & business settings
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  business_name text not null default 'Iron Merchant',
  currency text not null default 'PKR',
  address text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Product catalogue & pricing
-- ---------------------------------------------------------------------------

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.product_categories (id) on delete set null,
  name text not null,
  diameter_mm numeric(18, 4) not null check (diameter_mm > 0),
  wall_thickness_mm numeric(18, 4) check (wall_thickness_mm > 0),
  grade text not null,
  standard_length_ft numeric(18, 4) not null check (standard_length_ft > 0),
  theoretical_weight_per_ft numeric(18, 4) not null check (theoretical_weight_per_ft > 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Product identity: diameter + wall thickness + grade + standard length (locked decision).
create unique index products_owner_spec_key on public.products (
  owner_id, diameter_mm, coalesce(wall_thickness_mm, -1), grade, standard_length_ft
);

create table public.product_pricing (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  effective_from date not null,
  effective_to date,
  full_rate numeric(18, 4) not null check (full_rate >= 0),
  cut_rate numeric(18, 4) not null check (cut_rate >= 0),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (owner_id, product_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Purchases (one purchase_items row per physical shaft received)
-- ---------------------------------------------------------------------------

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  purchase_number text not null,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  purchase_date date not null default current_date,
  reference text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  additional_costs numeric(18, 2) not null default 0 check (additional_costs >= 0),
  subtotal numeric(18, 2) not null default 0 check (subtotal >= 0),
  total_cost numeric(18, 2) not null default 0 check (total_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, purchase_number)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  measured_length_ft numeric(18, 4) not null check (measured_length_ft > 0),
  measured_weight_kg numeric(18, 4) not null check (measured_weight_kg > 0),
  purchase_cost numeric(18, 2) not null default 0 check (purchase_cost >= 0),
  allocated_landed_cost numeric(18, 2) not null default 0 check (allocated_landed_cost >= 0),
  total_value numeric(18, 2) not null default 0 check (total_value >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Inventory pieces (individual physical shafts and cut pieces)
-- ---------------------------------------------------------------------------

create table public.inventory_pieces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  piece_code text not null,
  product_id uuid not null references public.products (id) on delete restrict,
  measured_length_ft numeric(18, 4) not null check (measured_length_ft > 0),
  measured_weight_kg numeric(18, 4) not null check (measured_weight_kg > 0),
  carrying_value numeric(18, 2) not null default 0 check (carrying_value >= 0),
  status text not null default 'full'
    check (status in ('full', 'cut', 'reserved', 'split', 'sold', 'scrapped')),
  purchase_item_id uuid references public.purchase_items (id) on delete restrict,
  parent_piece_id uuid references public.inventory_pieces (id) on delete restrict,
  cutting_record_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, piece_code)
);

-- Aggregate balances. Written only by validated database transactions/RPCs,
-- never directly by the frontend (RLS: no write policies for authenticated role).
create table public.product_stock_balances (
  product_id uuid primary key references public.products (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  total_ft numeric(18, 4) not null default 0 check (total_ft >= 0),
  total_kg numeric(18, 4) not null default 0 check (total_kg >= 0),
  piece_count integer not null default 0 check (piece_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.product_cost_balances (
  product_id uuid primary key references public.products (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  total_kg numeric(18, 4) not null default 0 check (total_kg >= 0),
  total_value numeric(18, 2) not null default 0 check (total_value >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cutting & scrap
-- ---------------------------------------------------------------------------

create table public.cutting_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cut_number text not null,
  source_piece_id uuid not null references public.inventory_pieces (id) on delete restrict,
  cut_date date not null default current_date,
  reference text,
  variance_kg numeric(18, 4) not null default 0,
  variance_value numeric(18, 2) not null default 0,
  status text not null default 'confirmed' check (status in ('confirmed', 'reversed')),
  notes text,
  created_at timestamptz not null default now(),
  unique (owner_id, cut_number),
  -- A piece can be consumed by at most one cutting operation.
  unique (owner_id, source_piece_id)
);

create table public.cutting_outputs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cutting_record_id uuid not null references public.cutting_records (id) on delete cascade,
  piece_id uuid not null unique references public.inventory_pieces (id) on delete restrict,
  measured_length_ft numeric(18, 4) not null check (measured_length_ft > 0),
  measured_weight_kg numeric(18, 4) not null check (measured_weight_kg > 0),
  allocated_value numeric(18, 2) not null default 0 check (allocated_value >= 0),
  created_at timestamptz not null default now()
);

alter table public.inventory_pieces
  add constraint inventory_pieces_cutting_record_id_fkey
  foreign key (cutting_record_id) references public.cutting_records (id) on delete restrict;

create table public.scrap_lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lot_number text not null,
  cutting_record_id uuid references public.cutting_records (id) on delete restrict,
  product_id uuid references public.products (id) on delete set null,
  original_weight_kg numeric(18, 4) not null check (original_weight_kg > 0),
  remaining_weight_kg numeric(18, 4) not null check (remaining_weight_kg >= 0),
  carrying_value numeric(18, 2) not null default 0 check (carrying_value >= 0),
  remaining_value numeric(18, 2) not null default 0 check (remaining_value >= 0),
  status text not null default 'available' check (status in ('available', 'sold', 'scrapped')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, lot_number),
  check (remaining_weight_kg <= original_weight_kg),
  check (remaining_value <= carrying_value)
);

-- ---------------------------------------------------------------------------
-- Sales & invoices
-- ---------------------------------------------------------------------------

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  sale_number text not null,
  customer_id uuid references public.customers (id) on delete restrict,
  sale_date date not null default current_date,
  sale_type text not null check (sale_type in ('full', 'cut', 'scrap')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled', 'reversed')),
  subtotal numeric(18, 2) not null default 0 check (subtotal >= 0),
  total numeric(18, 2) not null default 0 check (total >= 0),
  notes text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, sale_number)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  sale_type text not null check (sale_type in ('full', 'cut', 'scrap')),
  inventory_piece_id uuid references public.inventory_pieces (id) on delete restrict,
  scrap_lot_id uuid references public.scrap_lots (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  rate numeric(18, 4) not null check (rate >= 0),
  weight_kg numeric(18, 4) not null check (weight_kg > 0),
  amount numeric(18, 2) not null check (amount >= 0),
  cost numeric(18, 2) not null default 0 check (cost >= 0),
  created_at timestamptz not null default now(),
  -- Exactly one of (inventory_piece_id, scrap_lot_id) must be set.
  check ((inventory_piece_id is not null) <> (scrap_lot_id is not null)),
  -- full/cut sales reference a piece; scrap sales reference a lot.
  check ((sale_type in ('full', 'cut')) = (inventory_piece_id is not null))
);

-- A physical piece can appear on at most one sale line.
create unique index sale_items_piece_key on public.sale_items (inventory_piece_id)
  where inventory_piece_id is not null;

-- ---------------------------------------------------------------------------
-- Payments & allocations
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  payment_number text not null,
  direction text not null check (direction in ('received', 'paid')),
  party_type text not null check (party_type in ('customer', 'supplier', 'other')),
  customer_id uuid references public.customers (id) on delete restrict,
  supplier_id uuid references public.suppliers (id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(18, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'cheque')),
  reference text,
  notes text,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  created_at timestamptz not null default now(),
  unique (owner_id, payment_number),
  check ((party_type = 'customer') = (customer_id is not null)),
  check ((party_type = 'supplier') = (supplier_id is not null)),
  check (not (customer_id is not null and supplier_id is not null))
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  payment_id uuid not null references public.payments (id) on delete cascade,
  sale_id uuid references public.sales (id) on delete restrict,
  purchase_id uuid references public.purchases (id) on delete restrict,
  amount numeric(18, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  check ((sale_id is not null) <> (purchase_id is not null))
);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.expense_categories (id) on delete set null,
  expense_date date not null default current_date,
  amount numeric(18, 2) not null check (amount > 0),
  payee text,
  method text not null check (method in ('cash', 'bank_transfer', 'cheque', 'credit')),
  reference text,
  notes text,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stock movements (append-only history)
-- ---------------------------------------------------------------------------

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  movement_type text not null,
  inventory_piece_id uuid references public.inventory_pieces (id) on delete restrict,
  scrap_lot_id uuid references public.scrap_lots (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  quantity_kg numeric(18, 4) not null check (quantity_kg <> 0),
  value numeric(18, 2),
  document_type text,
  document_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Accounting (double-entry)
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null default current_date,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  -- Each line is either a debit or a credit, never both, never zero.
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

-- ---------------------------------------------------------------------------
-- Audit log (insert-only) & document numbering
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create table public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  document_type text not null,
  prefix text not null,
  next_number integer not null default 1 check (next_number > 0),
  updated_at timestamptz not null default now(),
  unique (owner_id, document_type)
);

-- ---------------------------------------------------------------------------
-- Indexes for foreign keys and common query paths
-- ---------------------------------------------------------------------------

create index product_categories_owner_idx on public.product_categories (owner_id);
create index products_owner_idx on public.products (owner_id);
create index products_category_idx on public.products (category_id);
create index product_pricing_owner_product_idx on public.product_pricing (owner_id, product_id, effective_from);
create index customers_owner_idx on public.customers (owner_id);
create index suppliers_owner_idx on public.suppliers (owner_id);
create index purchases_owner_date_idx on public.purchases (owner_id, purchase_date);
create index purchases_supplier_idx on public.purchases (supplier_id);
create index purchase_items_owner_idx on public.purchase_items (owner_id);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_product_idx on public.purchase_items (product_id);
create index inventory_pieces_owner_status_idx on public.inventory_pieces (owner_id, status);
create index inventory_pieces_product_idx on public.inventory_pieces (product_id);
create index inventory_pieces_owner_product_idx on public.inventory_pieces (owner_id, product_id);
create index inventory_pieces_parent_idx on public.inventory_pieces (parent_piece_id);
create index inventory_pieces_purchase_item_idx on public.inventory_pieces (purchase_item_id);
create index inventory_pieces_cutting_record_idx on public.inventory_pieces (cutting_record_id);
create index cutting_records_owner_date_idx on public.cutting_records (owner_id, cut_date);
create index cutting_outputs_record_idx on public.cutting_outputs (cutting_record_id);
create index cutting_outputs_piece_idx on public.cutting_outputs (piece_id);
create index scrap_lots_owner_status_idx on public.scrap_lots (owner_id, status);
create index scrap_lots_record_idx on public.scrap_lots (cutting_record_id);
create index sales_owner_date_idx on public.sales (owner_id, sale_date);
create index sales_customer_idx on public.sales (customer_id);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_scrap_lot_idx on public.sale_items (scrap_lot_id);
create index sale_items_owner_idx on public.sale_items (owner_id);
create index payments_owner_date_idx on public.payments (owner_id, payment_date);
create index payments_customer_idx on public.payments (customer_id);
create index payments_supplier_idx on public.payments (supplier_id);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_sale_idx on public.payment_allocations (sale_id);
create index payment_allocations_purchase_idx on public.payment_allocations (purchase_id);
create index payment_allocations_owner_idx on public.payment_allocations (owner_id);
create index expenses_owner_date_idx on public.expenses (owner_id, expense_date);
create index expenses_category_idx on public.expenses (category_id);
create index stock_movements_owner_created_idx on public.stock_movements (owner_id, created_at);
create index stock_movements_piece_idx on public.stock_movements (inventory_piece_id);
create index stock_movements_scrap_lot_idx on public.stock_movements (scrap_lot_id);
create index stock_movements_product_idx on public.stock_movements (product_id);
create index journal_entries_owner_date_idx on public.journal_entries (owner_id, entry_date);
create index journal_entries_reference_idx on public.journal_entries (reference_type, reference_id);
create index journal_lines_entry_idx on public.journal_lines (journal_entry_id);
create index journal_lines_account_idx on public.journal_lines (account_id);
create index journal_lines_owner_idx on public.journal_lines (owner_id);
create index audit_logs_owner_created_idx on public.audit_logs (owner_id, created_at);
