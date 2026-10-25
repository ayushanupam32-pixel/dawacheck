-- M5: ceiling prices for the fair-price check.
--
-- Replaces the M0 draft of ceiling_prices (empty), written from the project brief before the
-- source was inspected. One row per NPPA ceiling price (pipeline/dawacheck_pipeline/parse_nppa.py):
-- the composition key matches brands and Jan Aushadhi products exactly; prices EXCLUDE GST.
drop table if exists ceiling_prices;

create table ceiling_prices (
  id text primary key,                   -- hash of the row's content (stable across reloads)
  composition_key text not null,         -- same format as brands / ja_products
  medicine text not null,                -- as written in the order
  dosage text not null,
  unit text not null,                    -- "1 Tablet", "1 ML", ...
  unit_kind text not null check (unit_kind in ('unit', 'ml', 'g', 'other')),
  ceiling_price numeric not null check (ceiling_price > 0),   -- rupees per unit, excluding GST
  order_no text not null,                -- "S.O. 1575(E)"
  effective_from date not null,
  list text not null,                    -- "NLEM 2022" / "NLEM 2015"
  source_url text not null,
  last_seen timestamptz not null
);
create index ceiling_prices_key on ceiling_prices (composition_key);

alter table ceiling_prices enable row level security;
create policy "public read" on ceiling_prices for select to anon, authenticated using (true);
