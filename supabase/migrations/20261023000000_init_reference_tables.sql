-- DawaCheck reference data. Everything here comes from public government sources
-- and is written only by the monthly pipeline (service key). The public app can
-- only read it. Columns may change once we inspect each real source format (M1, M5).

-- Supabase keeps extensions in their own schema (it is on the default search_path).
create extension if not exists pg_trgm with schema extensions;

-- Canonical active ingredients ("salts"), e.g. 'metformin hydrochloride'.
create table salts (
  id serial primary key,
  name_norm text unique not null,
  display_name text not null,
  synonyms text[] not null default '{}'
);

-- Market brands, from the public brand -> salt dataset.
create table brands (
  id serial primary key,
  name text not null,
  name_norm text not null,               -- lowercase, no punctuation
  manufacturer text,
  form text,                             -- normalized dosage form
  pack_size numeric,
  pack_unit text,
  mrp numeric check (mrp is null or mrp > 0),
  source text not null
);
-- Trigram index: makes fuzzy "similar name" search fast (used by /api/match).
create index brands_name_trgm on brands using gin (name_norm extensions.gin_trgm_ops);

create table brand_ingredients (
  brand_id int not null references brands (id) on delete cascade,
  salt_id int not null references salts (id),
  strength_value numeric,
  strength_unit text,
  primary key (brand_id, salt_id)
);

-- Jan Aushadhi (PMBJP) generic products.
create table ja_products (
  id serial primary key,
  drug_code text unique not null,
  generic_name text not null,
  form text,
  pack_size numeric,
  pack_unit text,
  mrp numeric not null check (mrp > 0),
  composition_key text not null,         -- sorted 'salt_id:strength:unit|...' + form
  updated_on date not null
);
create index ja_products_key on ja_products (composition_key);

create table ja_product_ingredients (
  product_id int not null references ja_products (id) on delete cascade,
  salt_id int not null references salts (id),
  strength_value numeric,
  strength_unit text,
  primary key (product_id, salt_id)
);

-- CDSCO "Not of Standard Quality" and spurious drug alerts.
create table nsq_alerts (
  id serial primary key,
  alert_month date not null,
  product_name text not null,
  product_name_norm text not null,
  batch_no text not null check (batch_no <> ''),
  batch_no_norm text not null,           -- uppercase, no spaces/dashes
  mfg_date text,
  exp_date text,
  manufacturer text,
  failed_parameter text,
  lab text,
  is_spurious boolean not null default false,
  source_url text not null
);
create index nsq_batch on nsq_alerts (batch_no_norm);

-- CDSCO prohibited and unapproved fixed-dose combinations.
create table banned_fdcs (
  id serial primary key,
  combination_key text not null,         -- sorted salt_ids, e.g. '12|48'
  strengths jsonb,                       -- null when the notice bans all strengths
  notice_type text not null check (notice_type in ('prohibited', 'unapproved')),
  notified_on date,
  description text,
  source_url text not null
);
create index banned_fdcs_key on banned_fdcs (combination_key);

-- NPPA ceiling prices for scheduled formulations.
create table ceiling_prices (
  id serial primary key,
  formulation text not null,
  composition_key text not null,
  unit text not null,                    -- e.g. '1 tablet', '1 ml'
  ceiling_price numeric not null check (ceiling_price > 0),
  notified_on date,
  source_url text not null
);
create index ceiling_prices_key on ceiling_prices (composition_key);

-- Jan Aushadhi Kendras (stores). Also exported as static JSON for the browser.
create table kendras (
  id serial primary key,
  kendra_code text unique,
  name text,
  address text,
  district text,
  state text,
  pincode text,
  phone text,
  lat double precision,
  lng double precision,
  geo_precision text check (geo_precision in ('address', 'pincode'))
);

-- One row per pipeline source: when it last ran and how it went (shown on the About page).
create table data_sources (
  source text primary key,
  last_run_at timestamptz,
  rows_loaded int,
  status text,
  source_url text
);

-- Row Level Security: turned on for every table, with a single "anyone may read"
-- policy. No insert/update/delete policies exist, so the public (anon) key cannot
-- write. The pipeline's service key bypasses RLS and is the only writer.
do $$
declare
  t text;
begin
  foreach t in array array[
    'salts', 'brands', 'brand_ingredients', 'ja_products', 'ja_product_ingredients',
    'nsq_alerts', 'banned_fdcs', 'ceiling_prices', 'kendras', 'data_sources'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "public read" on %I for select to anon, authenticated using (true)', t
    );
  end loop;
end
$$;
