-- Phase 2 — product & pricing management.
-- Spec: Iron_Merchant_Software_Core_Understanding.docx §7.2, §10, §18.
-- Adds overlap prevention for effective-dated pricing and defines the
-- active-rate selection rule.

-- ---------------------------------------------------------------------------
-- Overlap prevention: at most one pricing row per (owner, product) may cover
-- a given date. Validity range is inclusive on both ends; an open-ended row
-- runs to date 'infinity'.
-- ---------------------------------------------------------------------------

create extension if not exists btree_gist with schema extensions;

alter table public.product_pricing
  add constraint product_pricing_no_overlap
  exclude using gist (
    owner_id with =,
    product_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  );

-- ---------------------------------------------------------------------------
-- Active-rate selection rule (defined, deterministic):
--   The rate applicable on date D for a product is the unique pricing row
--   whose inclusive validity range [effective_from, coalesce(effective_to,
--   'infinity')] contains D. The exclusion constraint above guarantees at
--   most one such row. If none exists, no rate is defined for that date and
--   the caller must treat pricing as missing (never guess or reuse an older
--   rate silently).
-- Used by future sale/cutting RPCs (Phases 5-6) to snapshot the correct rate.
-- ---------------------------------------------------------------------------

create or replace function public.product_rate_on(
  p_product_id uuid,
  p_on date default current_date
)
returns table (
  id uuid,
  effective_from date,
  effective_to date,
  full_rate numeric(18, 4),
  cut_rate numeric(18, 4)
)
language sql
stable
security invoker
set search_path = ''
as $$
  select pp.id, pp.effective_from, pp.effective_to, pp.full_rate, pp.cut_rate
    from public.product_pricing pp
   where pp.product_id = p_product_id
     and pp.owner_id = auth.uid()
     and pp.effective_from <= p_on
     and (pp.effective_to is null or pp.effective_to >= p_on)
   order by pp.effective_from desc
   limit 1;
$$;
