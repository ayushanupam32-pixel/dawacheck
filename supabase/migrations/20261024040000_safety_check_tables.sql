-- M5: tables for the batch check (CDSCO NSQ / spurious alerts) and the banned-combination check.
--
-- Replaces the M0 drafts of nsq_alerts and banned_fdcs (both empty), which were written from the
-- project brief before the real sources were inspected. The real data has a brand name, a lab
-- and a state, remarks on spurious drugs, and court statuses for banned combinations.
-- ceiling_prices is left as drafted until the NPPA file is inspected.

drop table if exists nsq_alerts;
drop table if exists banned_fdcs;

-- One row per alert (a batch a government lab found Not of Standard Quality, or spurious).
-- pipeline/dawacheck_pipeline/parse_cdsco_alerts.py
create table nsq_alerts (
  id text primary key,                   -- hash of the row's content (stable across reloads)
  kind text not null check (kind in ('nsq', 'spurious')),
  alert_month date not null,             -- first day of the month CDSCO published it for
  product_name text not null,
  brand_name text,                       -- often empty in older alerts (brand is in product_name)
  batch_no text not null check (batch_no <> ''),
  batch_no_norm text not null,           -- uppercase, no spaces/dashes/slashes (= the strip reader)
  mfg_date text,                         -- YYYY-MM
  exp_date text,
  manufacturer text,
  failed_parameter text,
  reporting_source text,                 -- CDSCO Labs / State lab
  reported_by text,                      -- lab or state
  remarks text,                          -- spurious: CDSCO's remark and the firm's reply
  source_url text not null,
  last_seen date not null
);
create index nsq_alerts_batch on nsq_alerts (batch_no_norm);

-- One row per entry in CDSCO's prohibited-FDC lists. pipeline/dawacheck_pipeline/parse_cdsco_fdc.py
create table banned_fdcs (
  id text primary key,                   -- hash of the entry (stable across reloads)
  combination_key text,                  -- sorted normalized salts 'a|b|c'; null for categories
  salts jsonb not null,
  kind text not null check (kind in ('combination', 'single', 'category')),
  status text not null check (status in (
    'prohibited', 'stayed', 'quashed', 'under_examination', 'revoked_with_conditions', 'restricted'
  )),
  description text not null,             -- as written in the list
  strengths text,                        -- strengths named in the entry, if any
  notification text,
  notified_on date,
  status_note text,
  source_title text not null,
  source_url text not null,
  last_seen date not null
);
create index banned_fdcs_key on banned_fdcs (combination_key);

-- Same Row Level Security as every other table: anyone may read, only the pipeline writes.
alter table nsq_alerts enable row level security;
alter table banned_fdcs enable row level security;
create policy "public read" on nsq_alerts for select to anon, authenticated using (true);
create policy "public read" on banned_fdcs for select to anon, authenticated using (true);
