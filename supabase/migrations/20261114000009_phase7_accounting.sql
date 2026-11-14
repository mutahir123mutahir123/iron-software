-- Phase 7 — Accounting: payments, allocations, advances, expenses, ledgers.
-- Spec: Iron_Merchant_Software_Core_Understanding.docx §8 (payments & ledgers),
-- §9 (expenses & double-entry), §17 (payment allocation atomicity).
--
-- Outstanding balances are ALWAYS derived from posted documents and posted
-- payment allocations. No manually editable balance fields exist anywhere.
-- Unallocated payment amounts remain as advances/unapplied credits:
--   customer advance -> 2050 Customer Advances (liability)
--   supplier advance -> 1050 Supplier Advances (asset)
--
-- All payment/expense writes happen inside SECURITY DEFINER RPCs; the
-- authenticated role gets select-only policies on payments,
-- payment_allocations, expenses and accounts (same pattern as journals and
-- aggregate balances since Phase 1).

-- ---------------------------------------------------------------------------
-- New accounts for advances: existing owners get them via migration, future
-- owners via handle_new_user().
-- ---------------------------------------------------------------------------

insert into public.accounts (owner_id, code, name, type)
select id, '1050', 'Supplier Advances', 'asset' from auth.users
on conflict (owner_id, code) do nothing;

insert into public.accounts (owner_id, code, name, type)
select id, '2050', 'Customer Advances', 'liability' from auth.users
on conflict (owner_id, code) do nothing;

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
    (new.id, '1050', 'Supplier Advances',   'asset'),
    (new.id, '1100', 'Accounts Receivable', 'asset'),
    (new.id, '1200', 'Shaft Inventory',     'asset'),
    (new.id, '1210', 'Scrap Inventory',     'asset'),
    (new.id, '2000', 'Accounts Payable',    'liability'),
    (new.id, '2050', 'Customer Advances',   'liability'),
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

  -- Map default expense categories to their CoA accounts for new owners.
  update public.expense_categories ec
     set account_id = a.id
    from public.accounts a
   where a.owner_id = ec.owner_id
     and a.code = case ec.name
       when 'Rent' then '6100'
       when 'Utilities' then '6110'
       when 'Office & Admin' then '6120'
       when 'Transport & Freight' then '6130'
       else '6190'
     end
     and ec.owner_id = new.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expense categories map to a chart-of-accounts expense account. Categories
-- without a mapping fall back to 6190 Miscellaneous Expense in post_expense.
-- ---------------------------------------------------------------------------

alter table public.expense_categories
  add column account_id uuid references public.accounts (id) on delete set null;

update public.expense_categories ec
   set account_id = a.id
  from public.accounts a
 where a.owner_id = ec.owner_id
   and a.code = case ec.name
     when 'Rent' then '6100'
     when 'Utilities' then '6110'
     when 'Office & Admin' then '6120'
     when 'Transport & Freight' then '6130'
     else '6190'
   end
   and ec.account_id is null;

-- ---------------------------------------------------------------------------
-- RLS: payments, allocations, expenses and accounts are select-only for the
-- authenticated role. All writes happen inside the RPCs below.
-- ---------------------------------------------------------------------------

drop policy if exists owner_all on public.payments;
create policy payments_owner_select on public.payments
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists owner_all on public.payment_allocations;
create policy payment_allocations_owner_select on public.payment_allocations
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists owner_all on public.expenses;
create policy expenses_owner_select on public.expenses
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists owner_all on public.accounts;
create policy accounts_owner_select on public.accounts
  for select to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Derived ledger balances (read-only views, owner-scoped).
-- outstanding = confirmed document total − allocations from posted payments.
-- advance = posted payment amount − its allocations.
-- ---------------------------------------------------------------------------

create or replace view public.customer_balances
with (security_invoker = true) as
select c.owner_id,
       c.id as customer_id,
       c.name,
       coalesce(s_agg.invoiced, 0)  as invoiced,
       coalesce(a_agg.allocated, 0) as allocated,
       coalesce(s_agg.invoiced, 0) - coalesce(a_agg.allocated, 0) as outstanding,
       coalesce(adv_agg.advance, 0) as advance
from public.customers c
left join (
  select customer_id, sum(total) as invoiced
    from public.sales
   where status = 'confirmed'
   group by customer_id
) s_agg on s_agg.customer_id = c.id
left join (
  select s.customer_id, sum(pa.amount) as allocated
    from public.payment_allocations pa
    join public.payments p
      on p.id = pa.payment_id and p.status = 'posted' and p.direction = 'received'
    join public.sales s
      on s.id = pa.sale_id and s.status = 'confirmed'
   group by s.customer_id
) a_agg on a_agg.customer_id = c.id
left join (
  select p.customer_id,
         sum(p.amount - coalesce(alloc.alloc_sum, 0)) as advance
    from public.payments p
    left join (
      select payment_id, sum(amount) as alloc_sum
        from public.payment_allocations
       group by payment_id
    ) alloc on alloc.payment_id = p.id
   where p.status = 'posted' and p.direction = 'received' and p.party_type = 'customer'
   group by p.customer_id
) adv_agg on adv_agg.customer_id = c.id;

comment on view public.customer_balances is
  'Per customer: confirmed invoiced total, allocated receipts, outstanding balance and unapplied advance. Derived; never manually maintained.';

create or replace view public.supplier_balances
with (security_invoker = true) as
select s.owner_id,
       s.id as supplier_id,
       s.name,
       coalesce(p_agg.billed, 0)    as billed,
       coalesce(a_agg.allocated, 0) as allocated,
       coalesce(p_agg.billed, 0) - coalesce(a_agg.allocated, 0) as outstanding,
       coalesce(adv_agg.advance, 0) as advance
from public.suppliers s
left join (
  select supplier_id, sum(total_cost) as billed
    from public.purchases
   where status = 'confirmed'
   group by supplier_id
) p_agg on p_agg.supplier_id = s.id
left join (
  select p.supplier_id, sum(pa.amount) as allocated
    from public.payment_allocations pa
    join public.payments pay
      on pay.id = pa.payment_id and pay.status = 'posted' and pay.direction = 'paid'
    join public.purchases p
      on p.id = pa.purchase_id and p.status = 'confirmed'
   group by p.supplier_id
) a_agg on a_agg.supplier_id = s.id
left join (
  select pay.supplier_id,
         sum(pay.amount - coalesce(alloc.alloc_sum, 0)) as advance
    from public.payments pay
    left join (
      select payment_id, sum(amount) as alloc_sum
        from public.payment_allocations
       group by payment_id
    ) alloc on alloc.payment_id = pay.id
   where pay.status = 'posted' and pay.direction = 'paid' and pay.party_type = 'supplier'
   group by pay.supplier_id
) adv_agg on adv_agg.supplier_id = s.id;

comment on view public.supplier_balances is
  'Per supplier: confirmed bill total, allocated payments, outstanding balance and unapplied advance. Derived; never manually maintained.';

-- ---------------------------------------------------------------------------
-- Journal account helper for payment/expense RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.account_id_by_code(p_code text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select id from public.accounts
   where owner_id = auth.uid() and code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- record_payment(): one transaction — create a posted payment and optionally
-- allocate it across confirmed invoices (received) or bills (paid).
-- p_allocations: [{"sale_id": "<uuid>", "amount": <num>}] or
--                [{"purchase_id": "<uuid>", "amount": <num>}] — one kind only.
-- Over-allocation of a document or of the payment amount is rejected; the
-- unallocated remainder stays as an advance/unapplied credit.
-- ---------------------------------------------------------------------------

create or replace function public.record_payment(
  p_direction text,
  p_party_type text,
  p_customer_id uuid default null,
  p_supplier_id uuid default null,
  p_payment_date date default current_date,
  p_amount numeric default 0,
  p_method text default 'cash',
  p_reference text default null,
  p_notes text default null,
  p_allocations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_amount numeric(18, 2);
  v_invalid boolean;
  v_alloc_count integer;
  v_payment_id uuid;
  v_payment_number text;
  v_alloc record;
  v_sale public.sales%rowtype;
  v_purchase public.purchases%rowtype;
  v_doc_total numeric(18, 2);
  v_doc_outstanding numeric(18, 2);
  v_alloc_amount numeric(18, 2);
  v_allocated numeric(18, 2) := 0;
  v_remainder numeric(18, 2);
  v_cash uuid;
  v_account_ar uuid;
  v_account_ap uuid;
  v_account_cust_adv uuid;
  v_account_supp_adv uuid;
  v_journal_id uuid;
  v_sale_ids uuid[];
  v_purchase_ids uuid[];
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required' using errcode = 'P0001';
  end if;

  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be a number greater than 0' using errcode = 'P0001';
  end if;

  if p_method not in ('cash', 'bank_transfer', 'cheque') then
    raise exception 'Method must be cash, bank_transfer or cheque' using errcode = 'P0001';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Allocations must be a JSON array' using errcode = 'P0001';
  end if;

  v_alloc_count := jsonb_array_length(p_allocations);
  if v_alloc_count > 100 then
    raise exception 'A payment cannot be allocated to more than 100 documents' using errcode = 'P0001';
  end if;

  -- Party validation (received -> customer; paid -> supplier).
  if p_direction = 'received' then
    if p_party_type <> 'customer' or p_customer_id is null or p_supplier_id is not null then
      raise exception 'A received payment must reference exactly one customer' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then
      raise exception 'Customer not found' using errcode = 'P0001';
    end if;
  elsif p_direction = 'paid' then
    if p_party_type <> 'supplier' or p_supplier_id is null or p_customer_id is not null then
      raise exception 'A paid payment must reference exactly one supplier' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.suppliers where id = p_supplier_id and owner_id = v_owner) then
      raise exception 'Supplier not found' using errcode = 'P0001';
    end if;
  else
    raise exception 'Direction must be received or paid' using errcode = 'P0001';
  end if;

  -- Allocation payload validation: objects, exactly one document reference, positive amount.
  select coalesce(bool_or(
           jsonb_typeof(a) <> 'object'
           or (a ->> 'amount') is null
           or (a ->> 'amount') !~ '^[0-9]+(\.[0-9]+)?$'
           or (a ->> 'sale_id' is not null and a ->> 'purchase_id' is not null)
           or ((a ->> 'sale_id') is null and (a ->> 'purchase_id') is null)
           or (a ->> 'sale_id' is not null and (a ->> 'sale_id') !~ '^[0-9a-fA-F-]{36}$')
           or (a ->> 'purchase_id' is not null and (a ->> 'purchase_id') !~ '^[0-9a-fA-F-]{36}$')
         ), false)
    into v_invalid
    from jsonb_array_elements(p_allocations) as a;

  if v_invalid then
    raise exception 'Each allocation needs a document reference and a positive amount'
      using errcode = 'P0001';
  end if;

  select coalesce(bool_or((a ->> 'amount')::numeric <= 0), false)
    into v_invalid
    from jsonb_array_elements(p_allocations) as a;

  if v_invalid then
    raise exception 'Each allocation amount must be greater than 0' using errcode = 'P0001';
  end if;

  -- Allocations may target only documents that match the payment direction.
  select coalesce(bool_or(a ->> 'sale_id' is not null), false)
           and coalesce(bool_or(a ->> 'purchase_id' is not null), false)
    into v_invalid
    from jsonb_array_elements(p_allocations) as a;

  if v_invalid then
    raise exception 'A payment cannot be allocated to both sales and purchases' using errcode = 'P0001';
  end if;

  if p_direction = 'received'
     and exists (select 1 from jsonb_array_elements(p_allocations) as a where a ->> 'purchase_id' is not null) then
    raise exception 'A received payment can only be allocated to sales invoices' using errcode = 'P0001';
  end if;

  if p_direction = 'paid'
     and exists (select 1 from jsonb_array_elements(p_allocations) as a where a ->> 'sale_id' is not null) then
    raise exception 'A paid payment can only be allocated to purchase bills' using errcode = 'P0001';
  end if;

  -- Lock referenced documents in a consistent order (sales by id, then
  -- purchases by id) to avoid deadlocks.
  select array_agg(x.id order by x.id) into v_sale_ids
    from (select distinct (a ->> 'sale_id')::uuid as id
            from jsonb_array_elements(p_allocations) as a
           where a ->> 'sale_id' is not null) x;

  select array_agg(x.id order by x.id) into v_purchase_ids
    from (select distinct (a ->> 'purchase_id')::uuid as id
            from jsonb_array_elements(p_allocations) as a
           where a ->> 'purchase_id' is not null) x;

  if v_sale_ids is not null then
    foreach v_id in array v_sale_ids loop
      perform 1 from public.sales where id = v_id for update;
    end loop;
  end if;
  if v_purchase_ids is not null then
    foreach v_id in array v_purchase_ids loop
      perform 1 from public.purchases where id = v_id for update;
    end loop;
  end if;

  v_payment_number := public.next_document_number('payment');

  insert into public.payments (
    owner_id, payment_number, direction, party_type,
    customer_id, supplier_id, payment_date, amount, method, reference, notes, status
  ) values (
    v_owner, v_payment_number, p_direction, p_party_type,
    case when p_direction = 'received' then p_customer_id end,
    case when p_direction = 'paid' then p_supplier_id end,
    p_payment_date, v_amount, p_method,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    'posted'
  )
  returning id into v_payment_id;

  -- Validate and apply allocations in a deterministic order; outstanding
  -- includes allocations inserted earlier in this transaction (same payment).
  for v_alloc in
    select coalesce((a ->> 'sale_id')::uuid, (a ->> 'purchase_id')::uuid) as doc_id,
           (a ->> 'sale_id' is not null) as is_sale,
           round((a ->> 'amount')::numeric, 2) as amount
      from jsonb_array_elements(p_allocations) as a
     order by (a ->> 'sale_id' is not null) desc,
              coalesce((a ->> 'sale_id')::uuid, (a ->> 'purchase_id')::uuid)
  loop
    v_alloc_amount := v_alloc.amount;

    if v_alloc.is_sale then
      select * into v_sale
        from public.sales
       where id = v_alloc.doc_id and owner_id = v_owner;

      if not found then
        raise exception 'Sale invoice not found for an allocation' using errcode = 'P0001';
      end if;
      if v_sale.status <> 'confirmed' then
        raise exception 'Invoice % cannot receive an allocation (status: %)',
          v_sale.sale_number, v_sale.status using errcode = 'P0001';
      end if;
      if p_direction = 'received' and v_sale.customer_id is distinct from p_customer_id then
        raise exception 'Invoice % belongs to a different customer', v_sale.sale_number
          using errcode = 'P0001';
      end if;
      v_doc_total := v_sale.total;
    else
      select * into v_purchase
        from public.purchases
       where id = v_alloc.doc_id and owner_id = v_owner;

      if not found then
        raise exception 'Purchase bill not found for an allocation' using errcode = 'P0001';
      end if;
      if v_purchase.status <> 'confirmed' then
        raise exception 'Bill % cannot receive an allocation (status: %)',
          v_purchase.purchase_number, v_purchase.status using errcode = 'P0001';
      end if;
      if p_direction = 'paid' and v_purchase.supplier_id is distinct from p_supplier_id then
        raise exception 'Bill % belongs to a different supplier', v_purchase.purchase_number
          using errcode = 'P0001';
      end if;
      v_doc_total := v_purchase.total_cost;
    end if;

    select coalesce(sum(pa.amount), 0) into v_doc_outstanding
      from public.payment_allocations pa
      join public.payments pay on pay.id = pa.payment_id and pay.status = 'posted'
     where (v_alloc.is_sale and pa.sale_id = v_alloc.doc_id)
        or (not v_alloc.is_sale and pa.purchase_id = v_alloc.doc_id);

    v_doc_outstanding := v_doc_total - v_doc_outstanding;

    if v_alloc_amount > v_doc_outstanding then
      raise exception 'Allocation of % exceeds the outstanding balance % on %',
        v_alloc_amount, v_doc_outstanding,
        case when v_alloc.is_sale then v_sale.sale_number else v_purchase.purchase_number end
        using errcode = 'P0001';
    end if;

    if v_allocated + v_alloc_amount > v_amount then
      raise exception 'Total allocations would exceed the payment amount %', v_amount
        using errcode = 'P0001';
    end if;

    insert into public.payment_allocations (owner_id, payment_id, sale_id, purchase_id, amount)
    values (
      v_owner, v_payment_id,
      case when v_alloc.is_sale then v_alloc.doc_id end,
      case when not v_alloc.is_sale then v_alloc.doc_id end,
      v_alloc_amount
    );

    v_allocated := v_allocated + v_alloc_amount;
  end loop;

  v_remainder := v_amount - v_allocated;

  v_cash := public.account_id_by_code(case when p_method = 'cash' then '1000' else '1010' end);
  v_account_ar := public.account_id_by_code('1100');
  v_account_ap := public.account_id_by_code('2000');
  v_account_cust_adv := public.account_id_by_code('2050');
  v_account_supp_adv := public.account_id_by_code('1050');

  if v_cash is null or v_account_ar is null or v_account_ap is null
     or v_account_cust_adv is null or v_account_supp_adv is null then
    raise exception 'Chart of accounts is missing a required account (1000/1010/1100/1050/2000/2050)'
      using errcode = 'P0001';
  end if;

  insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
  values (
    v_owner, p_payment_date, 'payment', v_payment_id,
    case when p_direction = 'received' then 'Receipt ' else 'Payment ' end || v_payment_number
  )
  returning id into v_journal_id;

  if p_direction = 'received' then
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_cash, v_amount, 0);
    if v_allocated > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_ar, 0, v_allocated);
    end if;
    if v_remainder > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_cust_adv, 0, v_remainder);
    end if;
  else
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_cash, 0, v_amount);
    if v_allocated > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_ap, v_allocated, 0);
    end if;
    if v_remainder > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_supp_adv, v_remainder, 0);
    end if;
  end if;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'create', 'payments', v_payment_id,
          jsonb_build_object(
            'payment_number', v_payment_number,
            'direction', p_direction,
            'party_type', p_party_type,
            'amount', v_amount,
            'allocated', v_allocated,
            'unallocated', v_remainder,
            'method', p_method
          ));

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_number', v_payment_number,
    'amount', v_amount,
    'allocated', v_allocated,
    'unallocated', v_remainder,
    'journal_entry_id', v_journal_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- allocate_payment(): apply the still-unallocated remainder of an existing
-- posted payment to confirmed documents. No cash/bank movement here — cash
-- was posted at record time; this moves the advance into the document.
-- ---------------------------------------------------------------------------

create or replace function public.allocate_payment(
  p_payment_id uuid,
  p_allocations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_payment public.payments%rowtype;
  v_invalid boolean;
  v_alloc_count integer;
  v_alloc record;
  v_sale public.sales%rowtype;
  v_purchase public.purchases%rowtype;
  v_doc_total numeric(18, 2);
  v_doc_allocated numeric(18, 2);
  v_alloc_amount numeric(18, 2);
  v_allocated_now numeric(18, 2);
  v_unallocated numeric(18, 2);
  v_new_allocated numeric(18, 2) := 0;
  v_account_ar uuid;
  v_account_ap uuid;
  v_account_cust_adv uuid;
  v_account_supp_adv uuid;
  v_journal_id uuid;
  v_sale_ids uuid[];
  v_purchase_ids uuid[];
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Allocations must be a JSON array' using errcode = 'P0001';
  end if;

  v_alloc_count := jsonb_array_length(p_allocations);
  if v_alloc_count = 0 then
    raise exception 'Add at least one allocation' using errcode = 'P0001';
  end if;
  if v_alloc_count > 100 then
    raise exception 'A payment cannot be allocated to more than 100 documents' using errcode = 'P0001';
  end if;

  select * into v_payment
    from public.payments
   where id = p_payment_id and owner_id = v_owner
   for update;

  if not found then
    raise exception 'Payment not found' using errcode = 'P0001';
  end if;
  if v_payment.status <> 'posted' then
    raise exception 'Only a posted payment can be allocated (status: %)', v_payment.status
      using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_allocated_now
    from public.payment_allocations
   where payment_id = v_payment.id and owner_id = v_owner;

  v_unallocated := v_payment.amount - v_allocated_now;
  if v_unallocated <= 0 then
    raise exception 'Payment % is already fully allocated', v_payment.payment_number
      using errcode = 'P0001';
  end if;

  select coalesce(bool_or(
           jsonb_typeof(a) <> 'object'
           or (a ->> 'amount') is null
           or (a ->> 'amount') !~ '^[0-9]+(\.[0-9]+)?$'
           or (a ->> 'sale_id' is not null and a ->> 'purchase_id' is not null)
           or ((a ->> 'sale_id') is null and (a ->> 'purchase_id') is null)
           or (a ->> 'sale_id' is not null and (a ->> 'sale_id') !~ '^[0-9a-fA-F-]{36}$')
           or (a ->> 'purchase_id' is not null and (a ->> 'purchase_id') !~ '^[0-9a-fA-F-]{36}$')
         ), false)
    into v_invalid
    from jsonb_array_elements(p_allocations) as a;

  if v_invalid then
    raise exception 'Each allocation needs a document reference and a positive amount'
      using errcode = 'P0001';
  end if;

  select coalesce(bool_or((a ->> 'amount')::numeric <= 0), false)
    into v_invalid
    from jsonb_array_elements(p_allocations) as a;

  if v_invalid then
    raise exception 'Each allocation amount must be greater than 0' using errcode = 'P0001';
  end if;

  if v_payment.direction = 'received'
     and exists (select 1 from jsonb_array_elements(p_allocations) as a where a ->> 'purchase_id' is not null) then
    raise exception 'A received payment can only be allocated to sales invoices' using errcode = 'P0001';
  end if;

  if v_payment.direction = 'paid'
     and exists (select 1 from jsonb_array_elements(p_allocations) as a where a ->> 'sale_id' is not null) then
    raise exception 'A paid payment can only be allocated to purchase bills' using errcode = 'P0001';
  end if;

  select array_agg(x.id order by x.id) into v_sale_ids
    from (select distinct (a ->> 'sale_id')::uuid as id
            from jsonb_array_elements(p_allocations) as a
           where a ->> 'sale_id' is not null) x;

  select array_agg(x.id order by x.id) into v_purchase_ids
    from (select distinct (a ->> 'purchase_id')::uuid as id
            from jsonb_array_elements(p_allocations) as a
           where a ->> 'purchase_id' is not null) x;

  if v_sale_ids is not null then
    foreach v_id in array v_sale_ids loop
      perform 1 from public.sales where id = v_id for update;
    end loop;
  end if;
  if v_purchase_ids is not null then
    foreach v_id in array v_purchase_ids loop
      perform 1 from public.purchases where id = v_id for update;
    end loop;
  end if;

  for v_alloc in
    select coalesce((a ->> 'sale_id')::uuid, (a ->> 'purchase_id')::uuid) as doc_id,
           (a ->> 'sale_id' is not null) as is_sale,
           round((a ->> 'amount')::numeric, 2) as amount
      from jsonb_array_elements(p_allocations) as a
     order by (a ->> 'sale_id' is not null) desc,
              coalesce((a ->> 'sale_id')::uuid, (a ->> 'purchase_id')::uuid)
  loop
    v_alloc_amount := v_alloc.amount;

    if v_alloc.is_sale then
      select * into v_sale
        from public.sales
       where id = v_alloc.doc_id and owner_id = v_owner;

      if not found then
        raise exception 'Sale invoice not found for an allocation' using errcode = 'P0001';
      end if;
      if v_sale.status <> 'confirmed' then
        raise exception 'Invoice % cannot receive an allocation (status: %)',
          v_sale.sale_number, v_sale.status using errcode = 'P0001';
      end if;
      if v_sale.customer_id is distinct from v_payment.customer_id then
        raise exception 'Invoice % belongs to a different customer', v_sale.sale_number
          using errcode = 'P0001';
      end if;
      v_doc_total := v_sale.total;
    else
      select * into v_purchase
        from public.purchases
       where id = v_alloc.doc_id and owner_id = v_owner;

      if not found then
        raise exception 'Purchase bill not found for an allocation' using errcode = 'P0001';
      end if;
      if v_purchase.status <> 'confirmed' then
        raise exception 'Bill % cannot receive an allocation (status: %)',
          v_purchase.purchase_number, v_purchase.status using errcode = 'P0001';
      end if;
      if v_purchase.supplier_id is distinct from v_payment.supplier_id then
        raise exception 'Bill % belongs to a different supplier', v_purchase.purchase_number
          using errcode = 'P0001';
      end if;
      v_doc_total := v_purchase.total_cost;
    end if;

    select coalesce(sum(pa.amount), 0) into v_doc_allocated
      from public.payment_allocations pa
      join public.payments pay on pay.id = pa.payment_id and pay.status = 'posted'
     where (v_alloc.is_sale and pa.sale_id = v_alloc.doc_id)
        or (not v_alloc.is_sale and pa.purchase_id = v_alloc.doc_id);

    if v_alloc_amount > v_doc_total - v_doc_allocated then
      raise exception 'Allocation of % exceeds the outstanding balance % on %',
        v_alloc_amount, v_doc_total - v_doc_allocated,
        case when v_alloc.is_sale then v_sale.sale_number else v_purchase.purchase_number end
        using errcode = 'P0001';
    end if;

    if v_new_allocated + v_alloc_amount > v_unallocated then
      raise exception 'Total allocations would exceed the unallocated balance % on %',
        v_unallocated, v_payment.payment_number using errcode = 'P0001';
    end if;

    insert into public.payment_allocations (owner_id, payment_id, sale_id, purchase_id, amount)
    values (
      v_owner, v_payment.id,
      case when v_alloc.is_sale then v_alloc.doc_id end,
      case when not v_alloc.is_sale then v_alloc.doc_id end,
      v_alloc_amount
    );

    v_new_allocated := v_new_allocated + v_alloc_amount;
  end loop;

  v_account_ar := public.account_id_by_code('1100');
  v_account_ap := public.account_id_by_code('2000');
  v_account_cust_adv := public.account_id_by_code('2050');
  v_account_supp_adv := public.account_id_by_code('1050');

  if v_account_ar is null or v_account_ap is null
     or v_account_cust_adv is null or v_account_supp_adv is null then
    raise exception 'Chart of accounts is missing a required account (1100/1050/2000/2050)'
      using errcode = 'P0001';
  end if;

  insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
  values (
    v_owner, current_date, 'payment_allocation', v_payment.id,
    'Allocate ' || v_payment.payment_number
  )
  returning id into v_journal_id;

  if v_payment.direction = 'received' then
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_account_cust_adv, v_new_allocated, 0);
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_account_ar, 0, v_new_allocated);
  else
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_account_ap, v_new_allocated, 0);
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_account_supp_adv, 0, v_new_allocated);
  end if;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'allocate', 'payments', v_payment.id,
          jsonb_build_object(
            'payment_number', v_payment.payment_number,
            'allocated', v_new_allocated,
            'unallocated_after', v_unallocated - v_new_allocated
          ));

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_number', v_payment.payment_number,
    'allocated', v_new_allocated,
    'unallocated', v_unallocated - v_new_allocated,
    'journal_entry_id', v_journal_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_payment(): mark the payment reversed and mirror every journal
-- entry posted for it (reference_type payment / payment_allocation).
-- Allocations are preserved; outstanding views only count posted payments.
-- ---------------------------------------------------------------------------

create or replace function public.reverse_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_payment public.payments%rowtype;
  v_entry record;
  v_line record;
  v_new_entry uuid;
  v_reversal_count integer := 0;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_payment
    from public.payments
   where id = p_payment_id and owner_id = v_owner
   for update;

  if not found then
    raise exception 'Payment not found' using errcode = 'P0001';
  end if;
  if v_payment.status <> 'posted' then
    raise exception 'Only a posted payment can be reversed (status: %)', v_payment.status
      using errcode = 'P0001';
  end if;

  update public.payments
     set status = 'reversed'
   where id = v_payment.id;

  for v_entry in
    select id, entry_date, description
      from public.journal_entries
     where owner_id = v_owner
       and reference_id = v_payment.id
       and reference_type in ('payment', 'payment_allocation')
     order by created_at, id
  loop
    insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
    values (v_owner, current_date, 'payment_reversal', v_payment.id,
            'Reversal of ' || coalesce(v_entry.description, v_payment.payment_number))
    returning id into v_new_entry;

    for v_line in
      select account_id, debit, credit
        from public.journal_lines
       where journal_entry_id = v_entry.id
    loop
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_new_entry, v_line.account_id, v_line.credit, v_line.debit);
    end loop;

    v_reversal_count := v_reversal_count + 1;
  end loop;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'reverse', 'payments', v_payment.id,
          jsonb_build_object(
            'payment_number', v_payment.payment_number,
            'amount', v_payment.amount,
            'journals_reversed', v_reversal_count
          ));

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_number', v_payment.payment_number,
    'status', 'reversed',
    'journals_reversed', v_reversal_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_expense(): one transaction — posted expense + balanced journal.
--   method cash/bank_transfer/cheque -> DR expense account / CR cash|bank
--   method credit                    -> DR expense account / CR Accounts Payable
-- Expense account = category mapping (fallback 6190 Miscellaneous Expense).
-- ---------------------------------------------------------------------------

create or replace function public.post_expense(
  p_category_id uuid,
  p_expense_date date default current_date,
  p_amount numeric default 0,
  p_payee text default null,
  p_method text default 'cash',
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_amount numeric(18, 2);
  v_category public.expense_categories%rowtype;
  v_account_expense uuid;
  v_account_cash uuid;
  v_account_ap uuid;
  v_expense_id uuid;
  v_journal_id uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if p_category_id is null then
    raise exception 'Select a category' using errcode = 'P0001';
  end if;

  select * into v_category
    from public.expense_categories
   where id = p_category_id and owner_id = v_owner;

  if not found then
    raise exception 'Category not found' using errcode = 'P0001';
  end if;

  if p_expense_date is null then
    raise exception 'Expense date is required' using errcode = 'P0001';
  end if;

  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be a number greater than 0' using errcode = 'P0001';
  end if;

  if p_method not in ('cash', 'bank_transfer', 'cheque', 'credit') then
    raise exception 'Method must be cash, bank_transfer, cheque or credit' using errcode = 'P0001';
  end if;

  v_account_expense := v_category.account_id;
  if v_account_expense is null then
    v_account_expense := public.account_id_by_code('6190');
  end if;
  v_account_cash := public.account_id_by_code(case when p_method = 'cash' then '1000' else '1010' end);
  v_account_ap := public.account_id_by_code('2000');

  if v_account_expense is null or (p_method <> 'credit' and v_account_cash is null)
     or (p_method = 'credit' and v_account_ap is null) then
    raise exception 'Chart of accounts is missing a required account (1000/1010/2000/6190)'
      using errcode = 'P0001';
  end if;

  insert into public.expenses (
    owner_id, category_id, expense_date, amount, payee, method, reference, notes, status
  ) values (
    v_owner, v_category.id, p_expense_date, v_amount,
    nullif(btrim(coalesce(p_payee, '')), ''),
    p_method,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    'posted'
  )
  returning id into v_expense_id;

  insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
  values (
    v_owner, p_expense_date, 'expense', v_expense_id,
    'Expense: ' || v_category.name ||
      case when nullif(btrim(coalesce(p_payee, '')), '') is not null
           then ' — ' || btrim(p_payee) else '' end
  )
  returning id into v_journal_id;

  insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
  values (v_owner, v_journal_id, v_account_expense, v_amount, 0);

  if p_method = 'credit' then
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_account_ap, 0, v_amount);
  else
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_account_cash, 0, v_amount);
  end if;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'create', 'expenses', v_expense_id,
          jsonb_build_object(
            'category', v_category.name,
            'amount', v_amount,
            'method', p_method,
            'account', (select code from public.accounts where id = v_account_expense)
          ));

  return jsonb_build_object(
    'expense_id', v_expense_id,
    'amount', v_amount,
    'journal_entry_id', v_journal_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_expense(): mirror-image journal; the original expense is kept and
-- marked reversed. Confirmed expenses are never deleted.
-- ---------------------------------------------------------------------------

create or replace function public.reverse_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_entry record;
  v_line record;
  v_new_entry uuid;
  v_reversal_count integer := 0;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_expense
    from public.expenses
   where id = p_expense_id and owner_id = v_owner
   for update;

  if not found then
    raise exception 'Expense not found' using errcode = 'P0001';
  end if;
  if v_expense.status <> 'posted' then
    raise exception 'Only a posted expense can be reversed (status: %)', v_expense.status
      using errcode = 'P0001';
  end if;

  update public.expenses
     set status = 'reversed'
   where id = v_expense.id;

  for v_entry in
    select id, description
      from public.journal_entries
     where owner_id = v_owner
       and reference_id = v_expense.id
       and reference_type = 'expense'
     order by created_at, id
  loop
    insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
    values (v_owner, current_date, 'expense_reversal', v_expense.id,
            'Reversal of ' || coalesce(v_entry.description, 'expense'))
    returning id into v_new_entry;

    for v_line in
      select account_id, debit, credit
        from public.journal_lines
       where journal_entry_id = v_entry.id
    loop
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_new_entry, v_line.account_id, v_line.credit, v_line.debit);
    end loop;

    v_reversal_count := v_reversal_count + 1;
  end loop;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'reverse', 'expenses', v_expense.id,
          jsonb_build_object(
            'amount', v_expense.amount,
            'journals_reversed', v_reversal_count
          ));

  return jsonb_build_object(
    'expense_id', v_expense.id,
    'status', 'reversed',
    'journals_reversed', v_reversal_count
  );
end;
$$;
