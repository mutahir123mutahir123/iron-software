-- Phase 6 — Sales & invoicing.
-- Spec: Iron_Merchant_Software_Core_Understanding.docx §7 (sales & invoicing), §11 (integrity), §17 (atomic sale).
--
-- confirm_sale() is the ONLY path to post an invoice to stock and accounting.
-- It runs as one transaction:
--   lock sale -> validate draft + line/header type match -> recompute line
--   amounts (kg x rate, 2dp, rounded at the end) -> consume pieces (full/cut)
--   or decrement scrap lots -> update shaft stock/cost balances (locked by
--   product in product_id order; scrap is NOT shaft stock) -> stock movements
--   -> balanced journal (DR AR / CR Revenue + DR COGS / CR Inventory) -> audit.
--
-- reverse_sale() is the credit-note style reversal. It restores stock,
-- balances and posts a compensating journal (reference_type sale_reversal).
-- The original invoice is never deleted or edited.
--
-- confirm_cut_sale() handles the partial-length use case from spec §6.4:
-- a cut and the sale of the resulting piece in ONE transaction, so a failed
-- sale never leaves an unintended split.
--
-- Frontend writes are restricted to draft documents (RLS). Pieces, scrap lots,
-- aggregate balances, movements and journals are RPC-only.
--
-- Owner decisions (2026-11-14):
--   - Confirmation always posts to Accounts Receivable; customer payments are
--     recorded in Phase 7 (payments & allocations).
--   - Multi-line invoices are supported, but each invoice carries ONE sale
--     type (full | cut | scrap); mixed-type invoices are not allowed.
--   - Full/cut rates pre-fill from the effective-dated price list but remain
--     editable; the applied rate is snapshotted on the line. Scrap rates are
--     manual entry.

-- ---------------------------------------------------------------------------
-- sale_items_piece_key blocked legitimate re-sale of a piece after a sale was
-- reversed (the original line keeps the piece reference forever). Uniqueness
-- of consumption is enforced transactionally instead: the piece is locked
-- FOR UPDATE and must be status full|cut to be sold, then flips to 'sold'.
-- ---------------------------------------------------------------------------

drop index if exists public.sale_items_piece_key;

-- ---------------------------------------------------------------------------
-- RLS: draft documents are writable by the owner; confirmed documents are
-- read-only. Mirrors the Phase 4 purchase policies.
-- ---------------------------------------------------------------------------

drop policy if exists owner_all on public.sales;
create policy sales_owner_select on public.sales
  for select to authenticated using (owner_id = auth.uid());
create policy sales_owner_insert on public.sales
  for insert to authenticated with check (owner_id = auth.uid());
create policy sales_owner_update_draft on public.sales
  for update to authenticated
  using (owner_id = auth.uid() and status = 'draft')
  with check (owner_id = auth.uid() and status = 'draft');
create policy sales_owner_delete_draft on public.sales
  for delete to authenticated using (owner_id = auth.uid() and status = 'draft');

drop policy if exists owner_all on public.sale_items;
create policy sale_items_owner_select on public.sale_items
  for select to authenticated using (owner_id = auth.uid());
create policy sale_items_owner_insert on public.sale_items
  for insert to authenticated with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.sales s
       where s.id = sale_id and s.owner_id = auth.uid() and s.status = 'draft'
    )
  );
create policy sale_items_owner_update_draft on public.sale_items
  for update to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.sales s
       where s.id = sale_id and s.owner_id = auth.uid() and s.status = 'draft'
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.sales s
       where s.id = sale_id and s.owner_id = auth.uid() and s.status = 'draft'
    )
  );
create policy sale_items_owner_delete_draft on public.sale_items
  for delete to authenticated using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.sales s
       where s.id = sale_id and s.owner_id = auth.uid() and s.status = 'draft'
    )
  );

-- ---------------------------------------------------------------------------
-- confirm_sale(p_sale_id)
-- ---------------------------------------------------------------------------

create or replace function public.confirm_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_line record;
  v_line_count integer := 0;
  v_total numeric(18, 2) := 0;
  v_piece_revenue numeric(18, 2) := 0;
  v_scrap_revenue numeric(18, 2) := 0;
  v_piece_cost numeric(18, 2) := 0;
  v_scrap_cost numeric(18, 2) := 0;
  v_piece record;
  v_lot public.scrap_lots%rowtype;
  v_amount numeric(18, 2);
  v_cost numeric(18, 2);
  v_product_ids uuid[];
  v_product uuid;
  v_delta record;
  v_journal_id uuid;
  v_account_ar uuid;
  v_account_revenue uuid;
  v_account_scrap_revenue uuid;
  v_account_cogs uuid;
  v_account_scrap_cogs uuid;
  v_account_shaft uuid;
  v_account_scrap uuid;
  v_entry_date date;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_sale
    from public.sales
   where id = p_sale_id
     and owner_id = v_owner
   for update;

  if not found then
    raise exception 'Sale not found' using errcode = 'P0001';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Only a draft sale can be confirmed (current status: %)', v_sale.status
      using errcode = 'P0001';
  end if;

  if v_sale.customer_id is null then
    raise exception 'Select a customer before confirming the sale' using errcode = 'P0001';
  end if;

  select count(*) into v_line_count
    from public.sale_items
   where sale_id = v_sale.id and owner_id = v_owner;

  if v_line_count = 0 then
    raise exception 'Add at least one line before confirming the sale' using errcode = 'P0001';
  end if;

  -- Lock pieces and lots up front in a consistent order (pieces by id, then
  -- scrap lots by id) to avoid deadlocks, and validate everything before
  -- writing anything. Line ordering for the loops follows the same rule.
  perform 1 from public.inventory_pieces ip
   where exists (
     select 1 from public.sale_items si
      where si.sale_id = v_sale.id and si.owner_id = v_owner and si.inventory_piece_id = ip.id
   ) and ip.owner_id = v_owner
   order by ip.id
   for update of ip;

  perform 1 from public.scrap_lots sl
   where exists (
     select 1 from public.sale_items si
      where si.sale_id = v_sale.id and si.owner_id = v_owner and si.scrap_lot_id = sl.id
   ) and sl.owner_id = v_owner
   order by sl.id
   for update of sl;

  -- Validate and recompute every line (kg x rate, 2dp, unrounded inputs).
  for v_line in
    select * from public.sale_items
     where sale_id = v_sale.id and owner_id = v_owner
     order by (inventory_piece_id is null), coalesce(inventory_piece_id, scrap_lot_id)
  loop
    if v_line.sale_type <> v_sale.sale_type then
      raise exception 'Line type does not match the sale type (%)', v_sale.sale_type
        using errcode = 'P0001';
    end if;

    if v_sale.sale_type in ('full', 'cut') then
      if v_line.inventory_piece_id is null then
        raise exception 'Full/cut sales must reference an inventory piece' using errcode = 'P0001';
      end if;

      select * into v_piece
        from public.inventory_pieces
       where id = v_line.inventory_piece_id and owner_id = v_owner;

      if not found then
        raise exception 'Inventory piece not found on a sale line' using errcode = 'P0001';
      end if;

      if v_piece.status <> v_sale.sale_type then
        raise exception 'Piece % is not available for a % sale (status: %)',
          v_piece.piece_code, v_sale.sale_type, v_piece.status
          using errcode = 'P0001';
      end if;

      if v_line.product_id is null or v_line.product_id <> v_piece.product_id then
        raise exception 'Sale line product does not match piece %', v_piece.piece_code
          using errcode = 'P0001';
      end if;

      if v_line.weight_kg <> v_piece.measured_weight_kg then
        raise exception 'Line weight must equal the piece measured weight for %', v_piece.piece_code
          using errcode = 'P0001';
      end if;

      v_amount := round(v_line.weight_kg * v_line.rate, 2);
      v_cost := v_piece.carrying_value;

      update public.sale_items
         set amount = v_amount, cost = v_cost
       where id = v_line.id;

      v_piece_revenue := v_piece_revenue + v_amount;
      v_piece_cost := v_piece_cost + v_cost;
    else
      -- scrap line
      if v_line.scrap_lot_id is null then
        raise exception 'Scrap sales must reference a scrap lot' using errcode = 'P0001';
      end if;

      select * into v_lot
        from public.scrap_lots
       where id = v_line.scrap_lot_id and owner_id = v_owner;

      if not found then
        raise exception 'Scrap lot not found on a sale line' using errcode = 'P0001';
      end if;

      if v_lot.status <> 'available' then
        raise exception 'Scrap lot % is not available for sale (status: %)',
          v_lot.lot_number, v_lot.status
          using errcode = 'P0001';
      end if;

      if v_line.weight_kg > v_lot.remaining_weight_kg then
        raise exception 'Line weight % exceeds scrap lot % remaining weight %',
          v_line.weight_kg, v_lot.lot_number, v_lot.remaining_weight_kg
          using errcode = 'P0001';
      end if;

      v_amount := round(v_line.weight_kg * v_line.rate, 2);
      if v_line.weight_kg = v_lot.remaining_weight_kg then
        v_cost := v_lot.remaining_value;
      else
        v_cost := round(v_lot.remaining_value * v_line.weight_kg / v_lot.remaining_weight_kg, 2);
      end if;

      update public.sale_items
         set amount = v_amount, cost = v_cost, product_id = v_lot.product_id
       where id = v_line.id;

      v_scrap_revenue := v_scrap_revenue + v_amount;
      v_scrap_cost := v_scrap_cost + v_cost;
    end if;

    v_total := v_total + v_amount;
  end loop;

  -- Lock the aggregate balances for involved products in product_id order.
  select array_agg(distinct ip.product_id order by ip.product_id)
    into v_product_ids
    from public.sale_items si
    join public.inventory_pieces ip on ip.id = si.inventory_piece_id
   where si.sale_id = v_sale.id and si.owner_id = v_owner and ip.product_id is not null;

  if v_product_ids is not null then
    foreach v_product in array v_product_ids loop
      insert into public.product_stock_balances (product_id, owner_id, total_ft, total_kg, piece_count)
        values (v_product, v_owner, 0, 0, 0)
        on conflict (product_id) do nothing;
      insert into public.product_cost_balances (product_id, owner_id, total_kg, total_value)
        values (v_product, v_owner, 0, 0)
        on conflict (product_id) do nothing;
      perform 1 from public.product_stock_balances
        where product_id = v_product for update;
      perform 1 from public.product_cost_balances
        where product_id = v_product for update;
    end loop;
  end if;

  -- Per-product consumption deltas (shaft products only).
  for v_delta in
    select ip.product_id,
           sum(ip.measured_length_ft) as ft,
           sum(ip.measured_weight_kg) as kg,
           count(*)::integer as pieces,
           sum(ip.carrying_value) as value
      from public.sale_items si
      join public.inventory_pieces ip on ip.id = si.inventory_piece_id
     where si.sale_id = v_sale.id and si.owner_id = v_owner
     group by ip.product_id
  loop
    update public.product_stock_balances
       set total_ft = total_ft - v_delta.ft,
           total_kg = total_kg - v_delta.kg,
           piece_count = piece_count - v_delta.pieces,
           updated_at = now()
     where product_id = v_delta.product_id;

    update public.product_cost_balances
       set total_kg = total_kg - v_delta.kg,
           total_value = total_value - v_delta.value,
           updated_at = now()
     where product_id = v_delta.product_id;
  end loop;

  -- Consume pieces / decrement scrap lots, write movements.
  for v_line in
    select * from public.sale_items
     where sale_id = v_sale.id and owner_id = v_owner
     order by (inventory_piece_id is null), coalesce(inventory_piece_id, scrap_lot_id)
  loop
    if v_line.inventory_piece_id is not null then
      update public.inventory_pieces
         set status = 'sold', updated_at = now()
       where id = v_line.inventory_piece_id;

      insert into public.stock_movements (
        owner_id, movement_type, inventory_piece_id, product_id,
        quantity_kg, value, document_type, document_id, notes
      ) values (
        v_owner, 'sale_out', v_line.inventory_piece_id, v_line.product_id,
        -v_line.weight_kg, -v_line.cost, 'sale', v_sale.id,
        'Sale ' || v_sale.sale_number
      );
    else
      update public.scrap_lots
         set remaining_weight_kg = remaining_weight_kg - v_line.weight_kg,
             remaining_value = remaining_value - v_line.cost,
             status = case when remaining_weight_kg - v_line.weight_kg = 0 then 'sold' else status end,
             updated_at = now()
       where id = v_line.scrap_lot_id;

      insert into public.stock_movements (
        owner_id, movement_type, scrap_lot_id, product_id,
        quantity_kg, value, document_type, document_id, notes
      ) values (
        v_owner, 'scrap_sale_out', v_line.scrap_lot_id, v_line.product_id,
        -v_line.weight_kg, -v_line.cost, 'sale', v_sale.id,
        'Sale ' || v_sale.sale_number
      );
    end if;
  end loop;

  -- Guard: shaft balances must never go negative.
  if exists (
    select 1 from public.product_stock_balances
     where owner_id = v_owner and (total_ft < 0 or total_kg < 0 or piece_count < 0)
  ) or exists (
    select 1 from public.product_cost_balances
     where owner_id = v_owner and (total_kg < 0 or total_value < 0)
  ) then
    raise exception 'Stock or cost balance would go negative; sale rolled back'
      using errcode = 'P0001';
  end if;

  -- Balanced journal: DR AR / CR Revenue(+Scrap Sales), DR COGS / CR Inventory.
  select id into v_account_ar from public.accounts where owner_id = v_owner and code = '1100';
  select id into v_account_revenue from public.accounts where owner_id = v_owner and code = '4000';
  select id into v_account_scrap_revenue from public.accounts where owner_id = v_owner and code = '4010';
  select id into v_account_cogs from public.accounts where owner_id = v_owner and code = '5000';
  select id into v_account_scrap_cogs from public.accounts where owner_id = v_owner and code = '5010';
  select id into v_account_shaft from public.accounts where owner_id = v_owner and code = '1200';
  select id into v_account_scrap from public.accounts where owner_id = v_owner and code = '1210';

  if v_account_ar is null or v_account_shaft is null or v_account_scrap is null then
    raise exception 'Chart of accounts is missing a required account (1100/1200/1210)'
      using errcode = 'P0001';
  end if;

  if v_total > 0 or v_piece_cost > 0 or v_scrap_cost > 0 then
    v_entry_date := v_sale.sale_date;

    insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
    values (v_owner, v_entry_date, 'sale', v_sale.id, 'Sale ' || v_sale.sale_number)
    returning id into v_journal_id;

    if v_total > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_ar, v_total, 0);
    end if;

    if v_piece_revenue > 0 then
      if v_account_revenue is null then
        raise exception 'Chart of accounts is missing Sales Revenue (4000)' using errcode = 'P0001';
      end if;
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_revenue, 0, v_piece_revenue);
    end if;
    if v_scrap_revenue > 0 then
      if v_account_scrap_revenue is null then
        raise exception 'Chart of accounts is missing Scrap Sales (4010)' using errcode = 'P0001';
      end if;
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_scrap_revenue, 0, v_scrap_revenue);
    end if;

    if v_piece_cost > 0 then
      if v_account_cogs is null then
        raise exception 'Chart of accounts is missing Cost of Goods Sold (5000)' using errcode = 'P0001';
      end if;
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_cogs, v_piece_cost, 0);
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_shaft, 0, v_piece_cost);
    end if;
    if v_scrap_cost > 0 then
      if v_account_scrap_cogs is null then
        raise exception 'Chart of accounts is missing Scrap Cost of Goods Sold (5010)' using errcode = 'P0001';
      end if;
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_scrap_cogs, v_scrap_cost, 0);
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_scrap, 0, v_scrap_cost);
    end if;
  end if;

  update public.sales
     set status = 'confirmed',
         subtotal = v_total,
         total = v_total,
         confirmed_at = now(),
         updated_at = now()
   where id = v_sale.id;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'confirm', 'sales', v_sale.id,
          jsonb_build_object(
            'sale_number', v_sale.sale_number,
            'sale_type', v_sale.sale_type,
            'lines', v_line_count,
            'total', v_total
          ));

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'sale_number', v_sale.sale_number,
    'total', v_total,
    'lines', v_line_count,
    'journal_entry_id', v_journal_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_sale(p_sale_id)
-- Compensating reversal (credit note). Restores stock, balances and posts a
-- mirror journal (reference_type sale_reversal). Originals are preserved.
-- ---------------------------------------------------------------------------

create or replace function public.reverse_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_line record;
  v_piece record;
  v_lot public.scrap_lots%rowtype;
  v_piece_revenue numeric(18, 2) := 0;
  v_scrap_revenue numeric(18, 2) := 0;
  v_piece_cost numeric(18, 2) := 0;
  v_scrap_cost numeric(18, 2) := 0;
  v_total numeric(18, 2) := 0;
  v_product_ids uuid[];
  v_product uuid;
  v_delta record;
  v_journal_id uuid;
  v_account_ar uuid;
  v_account_revenue uuid;
  v_account_scrap_revenue uuid;
  v_account_cogs uuid;
  v_account_scrap_cogs uuid;
  v_account_shaft uuid;
  v_account_scrap uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_sale
    from public.sales
   where id = p_sale_id
     and owner_id = v_owner
   for update;

  if not found then
    raise exception 'Sale not found' using errcode = 'P0001';
  end if;

  if v_sale.status <> 'confirmed' then
    raise exception 'Only a confirmed sale can be reversed (current status: %)', v_sale.status
      using errcode = 'P0001';
  end if;

  perform 1 from public.inventory_pieces ip
   where exists (
     select 1 from public.sale_items si
      where si.sale_id = v_sale.id and si.owner_id = v_owner and si.inventory_piece_id = ip.id
   ) and ip.owner_id = v_owner
   order by ip.id
   for update of ip;

  perform 1 from public.scrap_lots sl
   where exists (
     select 1 from public.sale_items si
      where si.sale_id = v_sale.id and si.owner_id = v_owner and si.scrap_lot_id = sl.id
   ) and sl.owner_id = v_owner
   order by sl.id
   for update of sl;

  for v_line in
    select * from public.sale_items
     where sale_id = v_sale.id and owner_id = v_owner
     order by (inventory_piece_id is null), coalesce(inventory_piece_id, scrap_lot_id)
  loop
    if v_line.inventory_piece_id is not null then
      select * into v_piece
        from public.inventory_pieces
       where id = v_line.inventory_piece_id and owner_id = v_owner;

      if v_piece.status <> 'sold' then
        raise exception 'Cannot reverse %: piece % is no longer marked sold (status: %)',
          v_sale.sale_number, v_piece.piece_code, v_piece.status
          using errcode = 'P0001';
      end if;

      v_piece_revenue := v_piece_revenue + v_line.amount;
      v_piece_cost := v_piece_cost + v_line.cost;

      update public.inventory_pieces
         set status = case when parent_piece_id is null then 'full' else 'cut' end,
             carrying_value = v_line.cost,
             updated_at = now()
       where id = v_piece.id;
    else
      select * into v_lot
        from public.scrap_lots
       where id = v_line.scrap_lot_id and owner_id = v_owner;

      v_scrap_revenue := v_scrap_revenue + v_line.amount;
      v_scrap_cost := v_scrap_cost + v_line.cost;

      update public.scrap_lots
         set remaining_weight_kg = remaining_weight_kg + v_line.weight_kg,
             remaining_value = remaining_value + v_line.cost,
             status = 'available',
             updated_at = now()
       where id = v_lot.id;
    end if;

    v_total := v_total + v_line.amount;
  end loop;

  select array_agg(distinct ip.product_id order by ip.product_id)
    into v_product_ids
    from public.sale_items si
    join public.inventory_pieces ip on ip.id = si.inventory_piece_id
   where si.sale_id = v_sale.id and si.owner_id = v_owner and ip.product_id is not null;

  if v_product_ids is not null then
    foreach v_product in array v_product_ids loop
      insert into public.product_stock_balances (product_id, owner_id, total_ft, total_kg, piece_count)
        values (v_product, v_owner, 0, 0, 0)
        on conflict (product_id) do nothing;
      insert into public.product_cost_balances (product_id, owner_id, total_kg, total_value)
        values (v_product, v_owner, 0, 0)
        on conflict (product_id) do nothing;
      perform 1 from public.product_stock_balances
        where product_id = v_product for update;
      perform 1 from public.product_cost_balances
        where product_id = v_product for update;
    end loop;
  end if;

  for v_delta in
    select ip.product_id,
           sum(ip.measured_length_ft) as ft,
           sum(ip.measured_weight_kg) as kg,
           count(*)::integer as pieces,
           sum(si.cost) as value
      from public.sale_items si
      join public.inventory_pieces ip on ip.id = si.inventory_piece_id
     where si.sale_id = v_sale.id and si.owner_id = v_owner
     group by ip.product_id
  loop
    update public.product_stock_balances
       set total_ft = total_ft + v_delta.ft,
           total_kg = total_kg + v_delta.kg,
           piece_count = piece_count + v_delta.pieces,
           updated_at = now()
     where product_id = v_delta.product_id;

    update public.product_cost_balances
       set total_kg = total_kg + v_delta.kg,
           total_value = total_value + v_delta.value,
           updated_at = now()
     where product_id = v_delta.product_id;
  end loop;

  for v_line in
    select * from public.sale_items
     where sale_id = v_sale.id and owner_id = v_owner
     order by (inventory_piece_id is null), coalesce(inventory_piece_id, scrap_lot_id)
  loop
    if v_line.inventory_piece_id is not null then
      insert into public.stock_movements (
        owner_id, movement_type, inventory_piece_id, product_id,
        quantity_kg, value, document_type, document_id, notes
      ) values (
        v_owner, 'sale_reversal_in', v_line.inventory_piece_id, v_line.product_id,
        v_line.weight_kg, v_line.cost, 'sale_reversal', v_sale.id,
        'Reversal of ' || v_sale.sale_number
      );
    else
      insert into public.stock_movements (
        owner_id, movement_type, scrap_lot_id, product_id,
        quantity_kg, value, document_type, document_id, notes
      ) values (
        v_owner, 'scrap_sale_reversal_in', v_line.scrap_lot_id, v_line.product_id,
        v_line.weight_kg, v_line.cost, 'sale_reversal', v_sale.id,
        'Reversal of ' || v_sale.sale_number
      );
    end if;
  end loop;

  select id into v_account_ar from public.accounts where owner_id = v_owner and code = '1100';
  select id into v_account_revenue from public.accounts where owner_id = v_owner and code = '4000';
  select id into v_account_scrap_revenue from public.accounts where owner_id = v_owner and code = '4010';
  select id into v_account_cogs from public.accounts where owner_id = v_owner and code = '5000';
  select id into v_account_scrap_cogs from public.accounts where owner_id = v_owner and code = '5010';
  select id into v_account_shaft from public.accounts where owner_id = v_owner and code = '1200';
  select id into v_account_scrap from public.accounts where owner_id = v_owner and code = '1210';

  if v_account_ar is null or v_account_shaft is null or v_account_scrap is null then
    raise exception 'Chart of accounts is missing a required account (1100/1200/1210)'
      using errcode = 'P0001';
  end if;

  if v_total > 0 or v_piece_cost > 0 or v_scrap_cost > 0 then
    insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
    values (v_owner, current_date, 'sale_reversal', v_sale.id,
            'Reversal of ' || v_sale.sale_number)
    returning id into v_journal_id;

    if v_piece_revenue > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_revenue, v_piece_revenue, 0);
    end if;
    if v_scrap_revenue > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_scrap_revenue, v_scrap_revenue, 0);
    end if;
    if v_total > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_ar, 0, v_total);
    end if;

    if v_piece_cost > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_shaft, v_piece_cost, 0);
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_cogs, 0, v_piece_cost);
    end if;
    if v_scrap_cost > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_scrap, v_scrap_cost, 0);
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_scrap_cogs, 0, v_scrap_cost);
    end if;
  end if;

  update public.sales
     set status = 'reversed',
         updated_at = now()
   where id = v_sale.id;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'reverse', 'sales', v_sale.id,
          jsonb_build_object(
            'sale_number', v_sale.sale_number,
            'sale_type', v_sale.sale_type,
            'total', v_total
          ));

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'sale_number', v_sale.sale_number,
    'status', 'reversed',
    'journal_entry_id', v_journal_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_cut_sale(...): partial-length sale in ONE transaction (spec §6.4).
-- Performs the cutting operation (same allocation rules as confirm_cutting)
-- and immediately consumes the designated output piece as a cut sale line on
-- a new confirmed invoice. A failure anywhere rolls back both the cut and
-- the sale, so a failed sale never leaves an unintended split.
-- p_outputs is the same JSON array shape as confirm_cutting:
--   [{"length_ft": <num>, "weight_kg": <num>}, ...]
-- p_sold_output_index is the 0-based index (entry order) of the output to sell.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_cut_sale(
  p_source_piece_id uuid,
  p_outputs jsonb,
  p_scrap_kg numeric default 0,
  p_sold_output_index integer default 0,
  p_customer_id uuid default null,
  p_sale_date date default current_date,
  p_rate numeric default 0,
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
  v_source public.inventory_pieces%rowtype;
  v_output_count integer;
  v_total_output_kg numeric(18, 4);
  v_total_output_ft numeric(18, 4);
  v_scrap_kg numeric(18, 4) := coalesce(p_scrap_kg, 0);
  v_output_record record;
  v_invalid boolean;
  v_variance_kg numeric(18, 4);
  v_scrap_value numeric(18, 2) := 0;
  v_loss_value numeric(18, 2) := 0;
  v_pot numeric(18, 2);
  v_remainder numeric(18, 2);
  v_output_index integer := 0;
  v_output_last integer;
  v_share numeric(18, 2);
  v_children_value numeric(18, 2) := 0;
  v_child_kg numeric(18, 4) := 0;
  v_child_ft numeric(18, 4) := 0;
  v_cut_id uuid;
  v_cut_number text;
  v_piece_id uuid;
  v_sold_piece_id uuid;
  v_sold_weight numeric(18, 4);
  v_sold_value numeric(18, 2);
  v_piece_code text;
  v_lot_id uuid;
  v_scrap_number text;
  v_cut_journal_id uuid;
  v_sale_journal_id uuid;
  v_sale_id uuid;
  v_sale_number text;
  v_amount numeric(18, 2);
  v_account_ar uuid;
  v_account_revenue uuid;
  v_account_cogs uuid;
  v_account_shaft uuid;
  v_account_scrap uuid;
  v_account_loss uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if p_sale_date is null then
    raise exception 'Sale date is required' using errcode = 'P0001';
  end if;

  if p_customer_id is null then
    raise exception 'Select a customer before confirming the sale' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.customers where id = p_customer_id and owner_id = v_owner
  ) then
    raise exception 'Customer not found' using errcode = 'P0001';
  end if;

  if p_rate is null or p_rate < 0 then
    raise exception 'Rate must be a number ≥ 0' using errcode = 'P0001';
  end if;

  if p_outputs is null or jsonb_typeof(p_outputs) <> 'array' then
    raise exception 'Outputs must be a JSON array' using errcode = 'P0001';
  end if;

  if v_scrap_kg < 0 then
    raise exception 'Scrap weight cannot be negative' using errcode = 'P0001';
  end if;

  select coalesce(bool_or(
           jsonb_typeof(o) <> 'object'
           or o ->> 'length_ft' is null
           or o ->> 'weight_kg' is null
           or (o ->> 'length_ft') !~ '^[0-9]+(\.[0-9]+)?$'
           or (o ->> 'weight_kg') !~ '^[0-9]+(\.[0-9]+)?$'
           or length(o ->> 'length_ft') > 14
           or length(o ->> 'weight_kg') > 14
         ), false)
    into v_invalid
    from jsonb_array_elements(p_outputs) as o;

  if v_invalid then
    raise exception 'Each output needs a positive measured length (ft) and weight (kg)'
      using errcode = 'P0001';
  end if;

  select count(*),
         coalesce(sum((o ->> 'weight_kg')::numeric), 0),
         coalesce(sum((o ->> 'length_ft')::numeric), 0),
         coalesce(bool_or(
           (o ->> 'length_ft')::numeric <= 0
           or (o ->> 'weight_kg')::numeric <= 0
         ), false)
    into v_output_count, v_total_output_kg, v_total_output_ft, v_invalid
    from jsonb_array_elements(p_outputs) as o;

  if v_output_count = 0 then
    raise exception 'Cutting requires at least one output piece' using errcode = 'P0001';
  end if;

  if v_output_count > 50 then
    raise exception 'A cutting operation cannot have more than 50 output pieces' using errcode = 'P0001';
  end if;

  if v_invalid then
    raise exception 'Each output needs a positive measured length (ft) and weight (kg)'
      using errcode = 'P0001';
  end if;

  if p_sold_output_index is null or p_sold_output_index < 0 or p_sold_output_index >= v_output_count then
    raise exception 'Selected output index is out of range' using errcode = 'P0001';
  end if;

  select * into v_source
    from public.inventory_pieces
   where id = p_source_piece_id
     and owner_id = v_owner
   for update;

  if not found then
    raise exception 'Source piece not found' using errcode = 'P0001';
  end if;

  if v_source.status not in ('full', 'cut') then
    raise exception 'Source piece % is not available for cutting (status: %)',
      v_source.piece_code, v_source.status
      using errcode = 'P0001';
  end if;

  v_variance_kg := round(v_source.measured_weight_kg - v_total_output_kg - v_scrap_kg, 4);

  if v_variance_kg >= 0 then
    if v_scrap_kg > 0 then
      v_scrap_value := round(v_source.carrying_value * v_scrap_kg / v_source.measured_weight_kg, 2);
    end if;
    if v_variance_kg > 0 then
      v_loss_value := round(v_source.carrying_value * v_variance_kg / v_source.measured_weight_kg, 2);
    end if;
    v_pot := v_source.carrying_value - v_scrap_value - v_loss_value;
  else
    if v_scrap_kg > 0 then
      v_scrap_value := round(v_source.carrying_value * v_scrap_kg / (v_total_output_kg + v_scrap_kg), 2);
    end if;
    v_pot := v_source.carrying_value - v_scrap_value;
  end if;

  v_remainder := v_pot;
  v_output_last := v_output_count - 1;

  insert into public.product_stock_balances (product_id, owner_id, total_ft, total_kg, piece_count)
    values (v_source.product_id, v_owner, 0, 0, 0)
    on conflict (product_id) do nothing;
  insert into public.product_cost_balances (product_id, owner_id, total_kg, total_value)
    values (v_source.product_id, v_owner, 0, 0)
    on conflict (product_id) do nothing;
  perform 1 from public.product_stock_balances
    where product_id = v_source.product_id for update;
  perform 1 from public.product_cost_balances
    where product_id = v_source.product_id for update;

  v_cut_number := public.next_document_number('cutting');

  insert into public.cutting_records (
    owner_id, cut_number, source_piece_id, cut_date, reference,
    variance_kg, variance_value, status, notes
  ) values (
    v_owner, v_cut_number, v_source.id, p_sale_date,
    nullif(btrim(coalesce(p_reference, '')), ''),
    v_variance_kg, v_loss_value, 'confirmed',
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_cut_id;

  for v_output_record in
    select (o ->> 'length_ft')::numeric as length_ft,
           (o ->> 'weight_kg')::numeric as weight_kg
      from jsonb_array_elements(p_outputs) as o
  loop
    if v_output_index = v_output_last then
      v_share := v_remainder;
    else
      v_share := least(round(v_pot * v_output_record.weight_kg / v_total_output_kg, 2), v_remainder);
    end if;

    v_remainder := v_remainder - v_share;
    v_children_value := v_children_value + v_share;
    v_child_kg := v_child_kg + v_output_record.weight_kg;
    v_child_ft := v_child_ft + v_output_record.length_ft;

    v_piece_code := public.next_document_number('piece');

    insert into public.inventory_pieces (
      owner_id, piece_code, product_id,
      measured_length_ft, measured_weight_kg, carrying_value,
      status, parent_piece_id, cutting_record_id
    ) values (
      v_owner, v_piece_code, v_source.product_id,
      v_output_record.length_ft, v_output_record.weight_kg, v_share,
      'cut', v_source.id, v_cut_id
    )
    returning id into v_piece_id;

    insert into public.cutting_outputs (
      owner_id, cutting_record_id, piece_id,
      measured_length_ft, measured_weight_kg, allocated_value
    ) values (
      v_owner, v_cut_id, v_piece_id,
      v_output_record.length_ft, v_output_record.weight_kg, v_share
    );

    insert into public.stock_movements (
      owner_id, movement_type, inventory_piece_id, product_id,
      quantity_kg, value, document_type, document_id, notes
    ) values (
      v_owner, 'cut_in', v_piece_id, v_source.product_id,
      v_output_record.weight_kg, v_share, 'cutting', v_cut_id,
      'Cut ' || v_cut_number || ' from ' || v_source.piece_code
    );

    if v_output_index = p_sold_output_index then
      v_sold_piece_id := v_piece_id;
      v_sold_weight := v_output_record.weight_kg;
      v_sold_value := v_share;
    end if;

    v_output_index := v_output_index + 1;
  end loop;

  if v_scrap_kg > 0 then
    v_scrap_number := public.next_document_number('scrap');

    insert into public.scrap_lots (
      owner_id, lot_number, cutting_record_id, product_id,
      original_weight_kg, remaining_weight_kg,
      carrying_value, remaining_value, status
    ) values (
      v_owner, v_scrap_number, v_cut_id, v_source.product_id,
      v_scrap_kg, v_scrap_kg, v_scrap_value, v_scrap_value, 'available'
    )
    returning id into v_lot_id;

    insert into public.stock_movements (
      owner_id, movement_type, scrap_lot_id, product_id,
      quantity_kg, value, document_type, document_id, notes
    ) values (
      v_owner, 'scrap_in', v_lot_id, v_source.product_id,
      v_scrap_kg, v_scrap_value, 'cutting', v_cut_id,
      'Cut ' || v_cut_number || ' from ' || v_source.piece_code
    );
  end if;

  update public.inventory_pieces
     set status = 'split', updated_at = now()
   where id = v_source.id;

  update public.product_stock_balances
     set total_ft = total_ft + v_child_ft - v_source.measured_length_ft,
         total_kg = total_kg + v_child_kg - v_source.measured_weight_kg,
         piece_count = piece_count + v_output_count - 1,
         updated_at = now()
   where product_id = v_source.product_id;

  update public.product_cost_balances
     set total_kg = total_kg + v_child_kg - v_source.measured_weight_kg,
         total_value = total_value + v_children_value - v_source.carrying_value,
         updated_at = now()
   where product_id = v_source.product_id;

  insert into public.stock_movements (
    owner_id, movement_type, inventory_piece_id, product_id,
    quantity_kg, value, document_type, document_id, notes
  ) values (
    v_owner, 'cut_out', v_source.id, v_source.product_id,
    -v_source.measured_weight_kg, -v_source.carrying_value, 'cutting', v_cut_id,
    'Cut ' || v_cut_number
  );

  select id into v_account_shaft from public.accounts where owner_id = v_owner and code = '1200';
  select id into v_account_scrap from public.accounts where owner_id = v_owner and code = '1210';
  select id into v_account_loss from public.accounts where owner_id = v_owner and code = '6000';
  select id into v_account_ar from public.accounts where owner_id = v_owner and code = '1100';
  select id into v_account_revenue from public.accounts where owner_id = v_owner and code = '4000';
  select id into v_account_cogs from public.accounts where owner_id = v_owner and code = '5000';

  if v_account_shaft is null then
    raise exception 'Chart of accounts is missing the Shaft Inventory (1200) account'
      using errcode = 'P0001';
  end if;

  if v_source.carrying_value > 0 then
    insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
    values (v_owner, p_sale_date, 'cutting', v_cut_id, 'Cut ' || v_cut_number)
    returning id into v_cut_journal_id;

    if v_children_value > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_cut_journal_id, v_account_shaft, v_children_value, 0);
    end if;
    if v_scrap_value > 0 and v_account_scrap is not null then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_cut_journal_id, v_account_scrap, v_scrap_value, 0);
    end if;
    if v_loss_value > 0 and v_account_loss is not null then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_cut_journal_id, v_account_loss, v_loss_value, 0);
    end if;
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_cut_journal_id, v_account_shaft, 0, v_source.carrying_value);
  end if;

  -- Sale of the designated output piece, confirmed atomically.
  v_amount := round(v_sold_weight * p_rate, 2);
  v_sale_number := public.next_document_number('sale');

  insert into public.sales (
    owner_id, sale_number, customer_id, sale_date, sale_type, status,
    subtotal, total, confirmed_at, notes
  ) values (
    v_owner, v_sale_number, p_customer_id, p_sale_date, 'cut', 'confirmed',
    v_amount, v_amount, now(), nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_sale_id;

  insert into public.sale_items (
    owner_id, sale_id, sale_type, inventory_piece_id, scrap_lot_id,
    product_id, rate, weight_kg, amount, cost
  ) values (
    v_owner, v_sale_id, 'cut', v_sold_piece_id, null,
    v_source.product_id, p_rate, v_sold_weight, v_amount, v_sold_value
  );

  -- Consume the sold child (others remain in stock).
  update public.inventory_pieces
     set status = 'sold', updated_at = now()
   where id = v_sold_piece_id;

  update public.product_stock_balances
     set total_ft = total_ft - (select measured_length_ft from public.inventory_pieces where id = v_sold_piece_id),
         total_kg = total_kg - v_sold_weight,
         piece_count = piece_count - 1,
         updated_at = now()
   where product_id = v_source.product_id;

  update public.product_cost_balances
     set total_kg = total_kg - v_sold_weight,
         total_value = total_value - v_sold_value,
         updated_at = now()
   where product_id = v_source.product_id;

  insert into public.stock_movements (
    owner_id, movement_type, inventory_piece_id, product_id,
    quantity_kg, value, document_type, document_id, notes
  ) values (
    v_owner, 'sale_out', v_sold_piece_id, v_source.product_id,
    -v_sold_weight, -v_sold_value, 'sale', v_sale_id,
    'Sale ' || v_sale_number
  );

  if v_account_ar is null or v_account_revenue is null or v_account_cogs is null then
    raise exception 'Chart of accounts is missing a required account (1100/4000/5000)'
      using errcode = 'P0001';
  end if;

  if v_amount > 0 or v_sold_value > 0 then
    insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
    values (v_owner, p_sale_date, 'sale', v_sale_id, 'Sale ' || v_sale_number)
    returning id into v_sale_journal_id;

    if v_amount > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_sale_journal_id, v_account_ar, v_amount, 0);
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_sale_journal_id, v_account_revenue, 0, v_amount);
    end if;

    if v_sold_value > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_sale_journal_id, v_account_cogs, v_sold_value, 0);
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_sale_journal_id, v_account_shaft, 0, v_sold_value);
    end if;
  end if;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values
    (v_owner, v_owner, 'confirm', 'cutting_records', v_cut_id,
     jsonb_build_object('cut_number', v_cut_number, 'source_piece', v_source.piece_code,
                        'outputs', v_output_count, 'scrap_kg', v_scrap_kg,
                        'variance_kg', v_variance_kg, 'loss_value', v_loss_value,
                        'via', 'cut_and_sell')),
    (v_owner, v_owner, 'confirm', 'sales', v_sale_id,
     jsonb_build_object('sale_number', v_sale_number, 'sale_type', 'cut',
                        'lines', 1, 'total', v_amount,
                        'via', 'cut_and_sell', 'cut_number', v_cut_number));

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'cutting_record_id', v_cut_id,
    'cut_number', v_cut_number,
    'total', v_amount,
    'journal_entry_id', v_sale_journal_id
  );
end;
$$;
