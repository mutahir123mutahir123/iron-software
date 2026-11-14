-- Phase 5 — Cutting & scrap management.
-- Spec: Iron_Merchant_Software_Core_Understanding.docx §6 (cutting & scrap), §11 (integrity), §17 (atomic cutting).
--
-- confirm_cutting() is the ONLY path to consume a source piece and create
-- child pieces / a scrap lot. It runs as one transaction:
--   lock source -> validate status full|cut -> allocate source carrying value
--   across usable outputs + scrap by weight (cutting loss value only for
--   positive variance) -> create child pieces (PC- codes) linked to the source
--   -> create scrap lot (SL- code) if scrap was produced -> consume source
--   (status split) -> update shaft stock/WAC balances (scrap EXCLUDED) ->
--   stock movements -> balanced journal (DR Shaft Inventory + DR Scrap
--   Inventory + DR Cutting Loss Expense / CR Shaft Inventory) -> audit log.
--
-- reverse_cutting() undoes a confirmed cutting atomically. Allowed only while
-- every output piece is still an untouched 'cut' piece and the scrap lot is
-- still fully available. Otherwise it is blocked and a corrective process is
-- required. The reversal restores the source, consumes the children and the
-- scrap lot, posts a compensating journal (reference_type cutting_reversal)
-- and writes reversal stock movements. Originals are never deleted.
--
-- Neither operation creates revenue or profit.
--
-- Frontend writes to cutting_records / cutting_outputs / scrap_lots are
-- removed (select-only); writes happen exclusively inside these RPCs.

-- ---------------------------------------------------------------------------
-- scrap_lot sequence: one per owner, prefix 'SL-'.
-- ---------------------------------------------------------------------------

insert into public.document_sequences (owner_id, document_type, prefix, next_number)
  select owner_id, 'scrap', 'SL-', 1
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
    (new.id, 'piece', 'PC-', 1),
    (new.id, 'scrap', 'SL-', 1)
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
-- One CONFIRMED cutting operation per source piece.
-- Phase 1's plain unique (owner_id, source_piece_id) also blocked re-cutting
-- a piece after its cutting had been reversed; replace it with a partial
-- unique index over confirmed rows only.
-- ---------------------------------------------------------------------------

alter table public.cutting_records
  drop constraint cutting_records_owner_id_source_piece_id_key;
create unique index cutting_records_one_confirmed_per_source
  on public.cutting_records (owner_id, source_piece_id)
  where status = 'confirmed';

-- ---------------------------------------------------------------------------
-- RLS tightening: cutting records/outputs and scrap lots are written only
-- inside SECURITY DEFINER RPCs. App users keep read access.
-- ---------------------------------------------------------------------------

drop policy if exists owner_all on public.cutting_records;
create policy cutting_records_owner_select on public.cutting_records
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists owner_all on public.cutting_outputs;
create policy cutting_outputs_owner_select on public.cutting_outputs
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists owner_all on public.scrap_lots;
create policy scrap_lots_owner_select on public.scrap_lots
  for select to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- confirm_cutting(p_source_piece_id, p_cut_date, p_reference, p_notes,
--                 p_outputs jsonb, p_scrap_kg)
-- p_outputs is a JSON array: [{"length_ft": <num>, "weight_kg": <num>}, ...]
-- in the order the operator entered them. The LAST output carries the
-- deterministic rounding remainder, so piece values always reconcile to
-- exactly the source carrying value minus scrap and cutting-loss values.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_cutting(
  p_source_piece_id uuid,
  p_cut_date date default current_date,
  p_reference text default null,
  p_notes text default null,
  p_outputs jsonb default '[]'::jsonb,
  p_scrap_kg numeric default 0
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
  v_piece_code text;
  v_lot_id uuid;
  v_scrap_number text;
  v_journal_id uuid;
  v_account_shaft uuid;
  v_account_scrap uuid;
  v_account_loss uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if p_cut_date is null then
    raise exception 'Cut date is required' using errcode = 'P0001';
  end if;

  if p_outputs is null or jsonb_typeof(p_outputs) <> 'array' then
    raise exception 'Outputs must be a JSON array' using errcode = 'P0001';
  end if;

  if v_scrap_kg < 0 then
    raise exception 'Scrap weight cannot be negative' using errcode = 'P0001';
  end if;

  -- Structural validation first (no casts), then compute sums.
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

  -- Allocation of the source carrying value:
  --   variance >= 0: scrap and cutting loss are each rounded to 2dp first,
  --     children split the remaining pot by weight.
  --   variance < 0 : unexplained weight gain; loss = 0 and the whole value is
  --     scaled across outputs + scrap by weight.
  -- Children shares are capped at the remaining pot, so allocations never go
  -- negative; the last child carries the deterministic rounding remainder.
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

  -- Lock the aggregate balances for this product (insert if missing).
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
    v_owner, v_cut_number, v_source.id, p_cut_date,
    nullif(btrim(coalesce(p_reference, '')), ''),
    v_variance_kg, v_loss_value, 'confirmed',
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_cut_id;

  -- Children, one inventory piece per output, in entry order.
  for v_output_record in
    select (o ->> 'length_ft')::numeric as length_ft,
           (o ->> 'weight_kg')::numeric as weight_kg
      from jsonb_array_elements(p_outputs) as o
  loop
    if v_output_index = v_output_last then
      v_share := v_remainder;
    else
      -- round(pot * w / W, 2), capped at the remaining pot so no share is
      -- ever negative; the last child carries the rounding remainder.
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

    v_output_index := v_output_index + 1;
  end loop;

  -- Scrap lot, only when scrap was actually produced.
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

  -- Source is consumed; value stays on the row for history.
  update public.inventory_pieces
     set status = 'split',
         updated_at = now()
   where id = v_source.id;

  -- Aggregate shaft balances: remove the source, add the children.
  -- Scrap is NOT shaft stock; the cutting loss leaves inventory entirely.
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

  -- Balanced journal: value transfer out of Shaft Inventory.
  if v_source.carrying_value > 0 then
    select id into v_account_shaft from public.accounts
     where owner_id = v_owner and code = '1200';
    select id into v_account_scrap from public.accounts
     where owner_id = v_owner and code = '1210';
    select id into v_account_loss from public.accounts
     where owner_id = v_owner and code = '6000';

    if v_account_shaft is null then
      raise exception 'Chart of accounts is missing the Shaft Inventory (1200) account'
        using errcode = 'P0001';
    end if;

    insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
    values (v_owner, p_cut_date, 'cutting', v_cut_id, 'Cut ' || v_cut_number)
    returning id into v_journal_id;

    if v_children_value > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_shaft, v_children_value, 0);
    end if;
    if v_scrap_value > 0 and v_account_scrap is not null then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_scrap, v_scrap_value, 0);
    end if;
    if v_loss_value > 0 and v_account_loss is not null then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_loss, v_loss_value, 0);
    end if;
    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_account_shaft, 0, v_source.carrying_value);
  end if;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'confirm', 'cutting_records', v_cut_id,
          jsonb_build_object(
            'cut_number', v_cut_number,
            'source_piece', v_source.piece_code,
            'outputs', v_output_count,
            'scrap_kg', v_scrap_kg,
            'variance_kg', v_variance_kg,
            'loss_value', v_loss_value
          ));

  return jsonb_build_object(
    'cutting_record_id', v_cut_id,
    'cut_number', v_cut_number,
    'outputs', v_output_count,
    'scrap_lot_id', v_lot_id,
    'variance_kg', v_variance_kg,
    'loss_value', v_loss_value,
    'journal_entry_id', v_journal_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_cutting(p_cutting_record_id)
-- Compensating reversal. Allowed only while every output piece is still an
-- untouched 'cut' piece and the scrap lot (if any) is fully available.
-- ---------------------------------------------------------------------------

create or replace function public.reverse_cutting(p_cutting_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_record public.cutting_records%rowtype;
  v_source public.inventory_pieces%rowtype;
  v_child record;
  v_child_count integer := 0;
  v_blocked text;
  v_child_kg numeric(18, 4) := 0;
  v_child_ft numeric(18, 4) := 0;
  v_child_value numeric(18, 2) := 0;
  v_scrap public.scrap_lots%rowtype;
  v_has_scrap boolean := false;
  v_journal_id uuid;
  v_account_shaft uuid;
  v_account_scrap uuid;
  v_account_loss uuid;
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_record
    from public.cutting_records
   where id = p_cutting_record_id
     and owner_id = v_owner
   for update;

  if not found then
    raise exception 'Cutting record not found' using errcode = 'P0001';
  end if;

  if v_record.status <> 'confirmed' then
    raise exception 'Only a confirmed cutting can be reversed (current status: %)', v_record.status
      using errcode = 'P0001';
  end if;

  perform 1 from public.inventory_pieces
   where id = v_record.source_piece_id
     and owner_id = v_owner
   for update;

  select * into v_source
    from public.inventory_pieces
   where id = v_record.source_piece_id
     and owner_id = v_owner;

  -- Lock outputs in a stable order; every output must be untouched.
  for v_child in
    select co.piece_id, ip.piece_code, ip.status, ip.measured_weight_kg,
           ip.measured_length_ft, ip.carrying_value
      from public.cutting_outputs co
      join public.inventory_pieces ip
        on ip.id = co.piece_id and ip.owner_id = v_owner
     where co.cutting_record_id = v_record.id
       and co.owner_id = v_owner
     order by co.piece_id
     for update of ip
  loop
    v_child_count := v_child_count + 1;

    if v_child.status <> 'cut' then
      v_blocked := 'piece ' || v_child.piece_code || ' (status: ' || v_child.status || ')';
      exit;
    end if;

    v_child_kg := v_child_kg + v_child.measured_weight_kg;
    v_child_ft := v_child_ft + v_child.measured_length_ft;
    v_child_value := v_child_value + v_child.carrying_value;
  end loop;

  if v_blocked is not null then
    raise exception 'Cannot reverse %: % has been consumed',
      v_record.cut_number, v_blocked
      using errcode = 'P0001';
  end if;

  if v_child_count = 0 then
    raise exception 'Cutting record has no outputs' using errcode = 'P0001';
  end if;

  select * into v_scrap
    from public.scrap_lots
   where cutting_record_id = v_record.id
     and owner_id = v_owner
   for update;

  v_has_scrap := found;

  if v_has_scrap then
    if v_scrap.status <> 'available'
       or v_scrap.remaining_weight_kg <> v_scrap.original_weight_kg
       or v_scrap.remaining_value <> v_scrap.carrying_value then
      raise exception 'Cannot reverse %: scrap lot % has been partly or fully consumed',
        v_record.cut_number, v_scrap.lot_number
        using errcode = 'P0001';
    end if;
  end if;

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

  -- Restore the source. Children and the scrap lot are retired in the
  -- movement section below, after their values have been recorded.
  update public.inventory_pieces
     set status = case when parent_piece_id is null then 'full' else 'cut' end,
         updated_at = now()
   where id = v_source.id;

  update public.product_stock_balances
     set total_ft = total_ft + v_source.measured_length_ft - v_child_ft,
         total_kg = total_kg + v_source.measured_weight_kg - v_child_kg,
         piece_count = piece_count + 1 - v_child_count,
         updated_at = now()
   where product_id = v_source.product_id;

  update public.product_cost_balances
     set total_kg = total_kg + v_source.measured_weight_kg - v_child_kg,
         total_value = total_value + v_source.carrying_value - v_child_value,
         updated_at = now()
   where product_id = v_source.product_id;

  -- Reversal stock movements (original values, before children are retired).
  for v_child in
    select ip.id as piece_id, ip.measured_weight_kg, ip.measured_length_ft, ip.carrying_value
      from public.cutting_outputs co
      join public.inventory_pieces ip
        on ip.id = co.piece_id and ip.owner_id = v_owner
     where co.cutting_record_id = v_record.id
       and co.owner_id = v_owner
  loop
    insert into public.stock_movements (
      owner_id, movement_type, inventory_piece_id, product_id,
      quantity_kg, value, document_type, document_id, notes
    ) values (
      v_owner, 'cut_reversal_out', v_child.piece_id, v_source.product_id,
      -v_child.measured_weight_kg, -v_child.carrying_value,
      'cutting_reversal', v_record.id,
      'Reversal of ' || v_record.cut_number
    );
  end loop;

  if v_has_scrap then
    insert into public.stock_movements (
      owner_id, movement_type, scrap_lot_id, product_id,
      quantity_kg, value, document_type, document_id, notes
    ) values (
      v_owner, 'scrap_reversal_out', v_scrap.id, v_source.product_id,
      -v_scrap.original_weight_kg, -v_scrap.carrying_value,
      'cutting_reversal', v_record.id,
      'Reversal of ' || v_record.cut_number
    );
  end if;

  -- Retire the children and the scrap lot.
  update public.inventory_pieces ip
     set status = 'scrapped',
         carrying_value = 0,
         notes = concat_ws(' · ', ip.notes, 'Reversed by cutting reversal ' || v_record.cut_number),
         updated_at = now()
    from public.cutting_outputs co
   where co.piece_id = ip.id
     and co.cutting_record_id = v_record.id
     and co.owner_id = v_owner;

  if v_has_scrap then
    update public.scrap_lots
       set status = 'scrapped',
           remaining_weight_kg = 0,
           remaining_value = 0,
           updated_at = now()
     where id = v_scrap.id;
  end if;

  insert into public.stock_movements (
    owner_id, movement_type, inventory_piece_id, product_id,
    quantity_kg, value, document_type, document_id, notes
  ) values (
    v_owner, 'cut_reversal_in', v_source.id, v_source.product_id,
    v_source.measured_weight_kg, v_source.carrying_value,
    'cutting_reversal', v_record.id,
    'Reversal of ' || v_record.cut_number
  );

  update public.cutting_records
     set status = 'reversed'
   where id = v_record.id;

  -- Compensating journal, mirror image of the original.
  if v_source.carrying_value > 0 then
    select id into v_account_shaft from public.accounts
     where owner_id = v_owner and code = '1200';
    select id into v_account_scrap from public.accounts
     where owner_id = v_owner and code = '1210';
    select id into v_account_loss from public.accounts
     where owner_id = v_owner and code = '6000';

    if v_account_shaft is null then
      raise exception 'Chart of accounts is missing the Shaft Inventory (1200) account'
        using errcode = 'P0001';
    end if;

    insert into public.journal_entries (owner_id, entry_date, reference_type, reference_id, description)
    values (v_owner, current_date, 'cutting_reversal', v_record.id,
            'Reversal of ' || v_record.cut_number)
    returning id into v_journal_id;

    insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
    values (v_owner, v_journal_id, v_account_shaft, v_source.carrying_value, 0);

    if v_child_value > 0 then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_shaft, 0, v_child_value);
    end if;
    if v_has_scrap and v_scrap.carrying_value > 0 and v_account_scrap is not null then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_scrap, 0, v_scrap.carrying_value);
    end if;
    if v_record.variance_value > 0 and v_account_loss is not null then
      insert into public.journal_lines (owner_id, journal_entry_id, account_id, debit, credit)
      values (v_owner, v_journal_id, v_account_loss, 0, v_record.variance_value);
    end if;
  end if;

  insert into public.audit_logs (owner_id, actor, action, table_name, record_id, details)
  values (v_owner, v_owner, 'reverse', 'cutting_records', v_record.id,
          jsonb_build_object(
            'cut_number', v_record.cut_number,
            'outputs', v_child_count,
            'scrap_restored', v_has_scrap
          ));

  return jsonb_build_object(
    'cutting_record_id', v_record.id,
    'cut_number', v_record.cut_number,
    'status', 'reversed',
    'journal_entry_id', v_journal_id
  );
end;
$$;
