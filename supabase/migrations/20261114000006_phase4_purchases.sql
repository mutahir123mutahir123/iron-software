-- Phase 4 — Purchase management + WAC.
-- Spec: Iron_Merchant_Software_Core_Understanding.docx §5 (purchases), §11 (integrity), §17 (atomic purchase confirmation).
--
-- confirm_purchase() is the ONLY path to post a purchase to stock and
-- accounting. It runs as one transaction:
--   lock purchase -> validate draft -> allocate landed costs by weight
--   (remainder to the last item) -> create inventory pieces (PC- codes) ->
--   upsert stock/WAC balances (locked by product in product_id order) ->
--   stock movements -> balanced journal (DR Shaft Inventory / CR AP) ->
--   audit log.
-- Any failure rolls everything back.
--
-- Frontend writes are restricted to draft documents (RLS). Pieces,
-- aggregate balances, movements and journals are RPC-only.

-- ---------------------------------------------------------------------------
-- piece_code sequence: one per owner, prefix 'PC-'. The purchase confirmation
-- RPC consumes numbers under a row lock (same pattern as next_document_number).
-- ---------------------------------------------------------------------------

insert into public.document_sequences (owner_id, document_type, prefix, next_number)
  select owner_id, 'piece', 'PC-', 1
    from public.business_settings
  on conflict (owner_id, document_type) do nothing;

-- Future owners receive the sequence automatically via handle_new_user().
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
    (new.id, 'payment', 'PAY-', 1),
    (new.id, 'piece', 'PC-', 1)
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

-- ---------------------------------------------------------------------------
-- RLS tightening
-- purchases / purchase_items: draft-only writes for the authenticated role.
-- Confirmed documents are immutable for app users; RPCs run as definer.
-- inventory_pieces: read-only for app users (pieces are created by RPCs only).
-- ---------------------------------------------------------------------------

drop policy if exists owner_all on public.purchases;
create policy purchases_owner_select on public.purchases
  for select to authenticated using (owner_id = auth.uid());
create policy purchases_owner_insert on public.purchases
  for insert to authenticated with check (owner_id = auth.uid());
create policy purchases_owner_update_draft on public.purchases
  for update to authenticated
  using (owner_id = auth.uid() and status = 'draft')
  with check (owner_id = auth.uid() and status = 'draft');
create policy purchases_owner_delete_draft on public.purchases
  for delete to authenticated using (owner_id = auth.uid() and status = 'draft');

drop policy if exists owner_all on public.purchase_items;
create policy purchase_items_owner_select on public.purchase_items
  for select to authenticated using (owner_id = auth.uid());
create policy purchase_items_owner_insert on public.purchase_items
  for insert to authenticated with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_id
        and p.owner_id = auth.uid()
        and p.status = 'draft'
    )
  );
create policy purchase_items_owner_update_draft on public.purchase_items
  for update to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_id
        and p.owner_id = auth.uid()
        and p.status = 'draft'
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_id
        and p.owner_id = auth.uid()
        and p.status = 'draft'
    )
  );
create policy purchase_items_owner_delete_draft on public.purchase_items
  for delete to authenticated using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_id
        and p.owner_id = auth.uid()
        and p.status = 'draft'
    )
  );

drop policy if exists owner_all on public.inventory_pieces;
create policy inventory_pieces_owner_select on public.inventory_pieces
  for select to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- confirm_purchase(p_purchase_id)
-- Validates and posts a draft purchase as one atomic transaction.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_purchase(p_purchase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_purchase public.purchases%rowtype;
  v_item record;
  v_item_count integer;
  v_total_kg numeric(18, 4);
  v_subtotal numeric(18, 2);
  v_grand numeric(18, 2);
  v_additional numeric(18, 2);
  v_remainder numeric(18, 2);
  v_share numeric(18, 2);
  v_last_item_id uuid;
  v_product record;
  v_piece_id uuid;
  v_piece_code text;
  v_journal_id uuid;
  v_account_inventory uuid;
  v_account_payable uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_purchase
    from public.purchases
   where id = p_purchase_id
     and owner_id = v_owner
   for update;

  if not found then
    raise exception 'Purchase not found' using errcode = 'P0001';
  end if;

  if v_purchase.status <> 'draft' then
    raise exception 'Only a draft purchase can be confirmed (current status: %)', v_purchase.status
      using errcode = 'P0001';
  end if;

  select count(*),
         coalesce(sum(measured_weight_kg), 0),
         coalesce(sum(purchase_cost), 0)
    into v_item_count, v_total_kg, v_subtotal
    from public.purchase_items
   where purchase_id = v_purchase.id
     and owner_id = v_owner;

  if v_item_count = 0 then
    raise exception 'Purchase has no items' using errcode = 'P0001';
  end if;

  if v_total_kg <= 0 then
    raise exception 'Total measured weight must be greater than zero' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from public.purchase_items pi
      left join public.products p
        on p.id = pi.product_id and p.owner_id = v_owner
     where pi.purchase_id = v_purchase.id
       and pi.owner_id = v_owner
       and (p.id is null or not p.is_active)
  ) then
    raise exception 'Purchase references an inactive or missing product' using errcode = 'P0001';
  end if;

  v_additional := v_purchase.additional_costs;
  v_grand := v_subtotal + v_additional;
  v_remainder := v_additional;

  -- Landed-cost allocation by weight; remainder to the last-inserted item so
  -- the allocated amounts reconcile exactly to the purchase's additional costs.
  select id into v_last_item_id
    from public.purchase_items
   where purchase_id = v_purchase.id
     and owner_id = v_owner
   order by created_at desc, id desc
   limit 1;

  for v_item in
    select id, product_id, measured_weight_kg, purchase_cost
      from public.purchase_items
     where purchase_id = v_purchase.id
       and owner_id = v_owner
     order by created_at, id
  loop
    if v_item.id = v_last_item_id then
      v_share := v_remainder;
    else
      v_share := round(v_additional * v_item.measured_weight_kg / v_total_kg, 2);
      v_remainder := v_remainder - v_share;
    end if;

    update public.purchase_items
       set allocated_landed_cost = v_share,
           total_value = v_item.purchase_cost + v_share
     where id = v_item.id;
  end loop;

  -- Per-product aggregate balances, locked in product_id order to avoid
  -- deadlocks. WAC is derived as value/kg at read time; the balances only
  -- store total_kg / total_value.
  for v_product in
    select product_id,
           count(*) as item_count,
           sum(measured_length_ft) as ft,
           sum(measured_weight_kg) as kg,
           sum(total_value) as value
      from public.purchase_items
     where purchase_id = v_purchase.id
       and owner_id = v_owner
     group by product_id
     order by product_id
  loop
    insert into public.product_stock_balances (product_id, owner_id, total_ft, total_kg, piece_count)
      values (v_product.product_id, v_owner, 0, 0, 0)
      on conflict (product_id) do nothing;

    insert into public.product_cost_balances (product_id, owner_id, total_kg, total_value)
      values (v_product.product_id, v_owner, 0, 0)
      on conflict (product_id) do nothing;

    perform 1 from public.product_stock_balances
      where product_id = v_product.product_id for update;

    perform 1 from public.product_cost_balances
      where product_id = v_product.product_id for update;

    update public.product_stock_balances
       set total_ft = total_ft + v_product.ft,
           total_kg = total_kg + v_product.kg,
           piece_count = piece_count + v_product.item_count
     where product_id = v_product.product_id;

    update public.product_cost_balances
       set total_kg = total_kg + v_product.kg,
           total_value = total_value + v_product.value
     where product_id = v_product.product_id;
  end loop;

  -- Physical pieces + stock movements, one per received shaft.
  for v_item in
    select id, product_id, measured_length_ft, measured_weight_kg, total_value
      from public.purchase_items
     where purchase_id = v_purchase.id
       and owner_id = v_owner
     order by created_at, id
  loop
    v_piece_code := public.next_document_number('piece');

    insert into public.inventory_pieces (
      owner_id, piece_code, product_id,
      measured_length_ft, measured_weight_kg, carrying_value,
      status, purchase_item_id
    ) values (
      v_owner, v_piece_code, v_item.product_id,
      v_item.measured_length_ft, v_item.measured_weight_kg, v_item.total_value,
      'full', v_item.id
    )
    returning id into v_piece_id;

    insert into public.stock_movements (
      owner_id, movement_type, inventory_piece_id, product_id,
      quantity_kg, value, document_type, document_id, notes
    ) values (
      v_owner, 'purchase_in', v_piece_id, v_item.product_id,
      v_item.measured_weight_kg, v_item.total_value, 'purchase', v_purchase.id,
      'Purchase ' || v_purchase.purchase_number
    );
  end loop;

  -- Balanced journal: DR Shaft Inventory / CR Accounts Payable.
  select id into v_account_inventory from public.accounts
   where owner_id = v_owner and code = '1200';
  select id into v_account_payable from public.accounts
   where owner_id = v_owner and code = '2000';

  if v_account_inventory is null or v_account_payable is null then
    raise exception 'Chart of accounts is missing the Shaft Inventory (1200) or Accounts Payable (2000) account'
      using errcode = 'P0001';
  end if;

  insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
  values (v_owner, v_purchase.purchase_date, 'purchase', v_purchase.id,
          'Purchase ' || v_purchase.purchase_number)
  returning id into v_journal_id;

  insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
  values
    (v_owner, v_journal_id, v_account_inventory, v_grand, 0),
    (v_owner, v_journal_id, v_account_payable, 0, v_grand);

  update public.purchases
     set status = 'confirmed',
         confirmed_at = now(),
         subtotal = v_subtotal,
         total_cost = v_grand,
         updated_at = now()
   where id = v_purchase.id;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'confirm', 'purchases', v_purchase.id,
          jsonb_build_object(
            'purchase_number', v_purchase.purchase_number,
            'items', v_item_count,
            'total_cost', v_grand
          ));

  return jsonb_build_object(
    'purchase_id', v_purchase.id,
    'purchase_number', v_purchase.purchase_number,
    'items', v_item_count,
    'total_cost', v_grand,
    'journal_entry_id', v_journal_id
  );
end;
$$;
