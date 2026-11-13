-- Phase 1 — Row Level Security.
-- Every owner-scoped table gets RLS enabled. The authenticated role
-- (single owner/admin) may read/write only its own records.
--
-- Aggregate balances, stock movements, journal entries/lines: NO write
-- policies for authenticated. They are written exclusively by validated
-- SECURITY DEFINER RPCs (Phases 2+), never by direct frontend writes.
-- Audit logs are insert-only.

alter table public.profiles enable row level security;
alter table public.business_settings enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_pricing enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.inventory_pieces enable row level security;
alter table public.product_stock_balances enable row level security;
alter table public.product_cost_balances enable row level security;
alter table public.cutting_records enable row level security;
alter table public.cutting_outputs enable row level security;
alter table public.scrap_lots enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.audit_logs enable row level security;
alter table public.document_sequences enable row level security;

-- profiles: the owner can read and update their own profile only
create policy profiles_owner_select on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_owner_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Full-access owner tables (read/write own rows)
do $$
declare
  t text;
begin
  foreach t in array array[
    'business_settings', 'product_categories', 'products', 'product_pricing',
    'customers', 'suppliers', 'purchases', 'purchase_items', 'inventory_pieces',
    'cutting_records', 'cutting_outputs', 'scrap_lots', 'sales', 'sale_items',
    'payments', 'payment_allocations', 'expense_categories', 'expenses',
    'accounts', 'document_sequences'
  ]
  loop
    execute format(
      'create policy owner_all on public.%I for all to authenticated
         using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- Read-only for the authenticated role; writes happen only inside
-- SECURITY DEFINER RPCs (bypassing RLS as table owner).
create policy stock_balances_owner_select on public.product_stock_balances
  for select to authenticated using (owner_id = auth.uid());
create policy cost_balances_owner_select on public.product_cost_balances
  for select to authenticated using (owner_id = auth.uid());
create policy stock_movements_owner_select on public.stock_movements
  for select to authenticated using (owner_id = auth.uid());
create policy journal_entries_owner_select on public.journal_entries
  for select to authenticated using (owner_id = auth.uid());
create policy journal_lines_owner_select on public.journal_lines
  for select to authenticated using (owner_id = auth.uid());

-- audit_logs: insert-only for the application user, readable by the owner
create policy audit_logs_owner_select on public.audit_logs
  for select to authenticated using (owner_id = auth.uid());
create policy audit_logs_owner_insert on public.audit_logs
  for insert to authenticated with check (owner_id = auth.uid());
-- No update/delete policies: audit history is immutable for app users.
