-- Phase 1 — functions, triggers and owner-onboarding defaults.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.inventory_pieces
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.product_stock_balances
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.product_cost_balances
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.scrap_lots
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.sales
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.document_sequences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Document numbering (row-locked increment, safe under concurrency).
-- Usage (inside a transaction): select public.next_document_number('sale');
-- Returns e.g. 'INV-0001'. Prefix and sequence are editable per owner.
-- ---------------------------------------------------------------------------

create or replace function public.next_document_number(p_document_type text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prefix text;
  v_number integer;
begin
  select prefix, next_number
    into v_prefix, v_number
    from public.document_sequences
   where owner_id = auth.uid()
     and document_type = p_document_type
   for update;

  if not found then
    raise exception 'No document sequence configured for type "%"', p_document_type
      using errcode = 'P0001';
  end if;

  update public.document_sequences
     set next_number = v_number + 1
   where owner_id = auth.uid()
     and document_type = p_document_type;

  return v_prefix || lpad(v_number::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Journal balance invariant: every posted entry must balance (debits = credits).
-- Deferred so the check runs at commit, after all lines of an entry are inserted.
-- ---------------------------------------------------------------------------

create or replace function public.validate_journal_entry_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_debit numeric(18, 2);
  v_credit numeric(18, 2);
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_debit, v_credit
    from public.journal_lines
   where journal_entry_id = new.journal_entry_id;

  if v_debit <> v_credit then
    raise exception 'Journal entry % does not balance: debits % <> credits %',
      new.journal_entry_id, v_debit, v_credit
      using errcode = 'P0001';
  end if;

  return null;
end;
$$;

create constraint trigger journal_lines_balanced
  after insert on public.journal_lines
  deferrable initially deferred
  for each row execute function public.validate_journal_entry_balance();

-- ---------------------------------------------------------------------------
-- Owner onboarding: create profile, settings, document sequences, default
-- expense categories and the default chart of accounts on first sign-up.
-- Runs as the definer (postgres) so it can write before any owner session exists.
-- Default CoA is derived from spec section 9.1 and MUST be signed off by the
-- business accountant before production cutover.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  insert into public.business_settings (owner_id, business_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''), 'Iron Merchant'))
  on conflict (owner_id) do nothing;

  insert into public.document_sequences (owner_id, document_type, prefix, next_number)
  values
    (new.id, 'sale', 'INV-', 1),
    (new.id, 'purchase', 'PUR-', 1),
    (new.id, 'cutting', 'CUT-', 1),
    (new.id, 'payment', 'PAY-', 1)
  on conflict (owner_id, document_type) do nothing;

  insert into public.expense_categories (owner_id, name)
  values
    (new.id, 'General'),
    (new.id, 'Rent'),
    (new.id, 'Utilities'),
    (new.id, 'Office & Admin'),
    (new.id, 'Transport & Freight'),
    (new.id, 'Miscellaneous')
  on conflict (owner_id, name) do nothing;

  insert into public.accounts (owner_id, code, name, type)
  values
    (new.id, '1000', 'Cash',                'asset'),
    (new.id, '1010', 'Bank',                'asset'),
    (new.id, '1100', 'Accounts Receivable', 'asset'),
    (new.id, '1200', 'Shaft Inventory',     'asset'),
    (new.id, '1210', 'Scrap Inventory',     'asset'),
    (new.id, '2000', 'Accounts Payable',    'liability'),
    (new.id, '3000', 'Owner Capital',       'equity'),
    (new.id, '3100', 'Owner Drawings',      'equity'),
    (new.id, '4000', 'Sales Revenue',       'income'),
    (new.id, '4010', 'Scrap Sales',         'income'),
    (new.id, '5000', 'Cost of Goods Sold',  'expense'),
    (new.id, '5010', 'Scrap Cost of Goods Sold', 'expense'),
    (new.id, '6000', 'Cutting Loss Expense','expense'),
    (new.id, '6100', 'Rent Expense',        'expense'),
    (new.id, '6110', 'Utilities Expense',   'expense'),
    (new.id, '6120', 'Office & Admin Expense', 'expense'),
    (new.id, '6130', 'Transport & Freight Expense', 'expense'),
    (new.id, '6190', 'Miscellaneous Expense', 'expense')
  on conflict (owner_id, code) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
