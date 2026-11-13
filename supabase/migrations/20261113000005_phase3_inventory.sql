-- Phase 3 — Inventory management.
-- Reconciliation view: aggregate balances vs the sum of eligible physical
-- pieces. Aggregates are maintained only by RPCs (Phases 4-6); this view is
-- read-only and exists to detect drift between the two.
--
-- Eligible shaft stock = status in ('full', 'cut', 'reserved'):
--   full     — complete shaft, sellable/cuttable
--   cut      — child piece from cutting, sellable/cuttable
--   reserved — physically on hand, held for a future operation
-- 'split' pieces were consumed by cutting; 'sold'/'scrapped' are gone.

create or replace view public.inventory_reconciliation
with (security_invoker = true) as
select
  p.id as product_id,
  p.owner_id,
  p.name as product_name,
  p.grade,
  p.is_active,
  coalesce(sb.total_ft, 0) as stock_balance_ft,
  coalesce(sb.total_kg, 0) as stock_balance_kg,
  coalesce(sb.piece_count, 0) as stock_balance_piece_count,
  coalesce(cb.total_kg, 0) as cost_balance_kg,
  coalesce(cb.total_value, 0) as cost_balance_value,
  coalesce(agg.total_ft, 0) as pieces_ft,
  coalesce(agg.total_kg, 0) as pieces_kg,
  coalesce(agg.piece_count, 0) as pieces_piece_count,
  coalesce(agg.total_value, 0) as pieces_value
from public.products p
left join public.product_stock_balances sb
  on sb.product_id = p.id
left join public.product_cost_balances cb
  on cb.product_id = p.id
left join (
  select
    product_id,
    count(*) as piece_count,
    sum(measured_weight_kg) as total_kg,
    sum(measured_length_ft) as total_ft,
    sum(carrying_value) as total_value
  from public.inventory_pieces
  where status in ('full', 'cut', 'reserved')
  group by product_id
) agg on agg.product_id = p.id;

comment on view public.inventory_reconciliation is
  'Per-product comparison of aggregate stock/cost balances against eligible physical pieces. Read-only; drift means an RPC bug or manual intervention.';
