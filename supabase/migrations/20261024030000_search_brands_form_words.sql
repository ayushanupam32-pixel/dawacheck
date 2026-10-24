-- search_brands(): ignore dosage-form words in the query ("Telma Tablet" -> "telma").
--
-- Found by the M4 matching evaluation: OCR text like "LAH TABLET" made the trigram search
-- compare the query with nearly every brand (they all contain "tablet") and hit the 3-second
-- statement timeout. Same function otherwise (see 20261024020000_search_brands_discontinued.sql).
create or replace function public.search_brands(
  q text,
  max_results int default 8,
  include_discontinued boolean default false
)
returns table (
  id int,
  name text,
  manufacturer text,
  form text,
  release text,
  pack_size numeric,
  pack_unit text,
  mrp_2022 numeric,
  composition_key text,
  composition_complete boolean,
  discontinued boolean,
  ingredients jsonb,
  score real
)
language sql
stable
security invoker                 -- runs with the caller's rights, so RLS still applies
set search_path = public, extensions
as $$
  with query as (
    -- Same normalization as the pipeline: lowercase, punctuation -> spaces. Then drop dosage-form
    -- words: almost every name contains "tablet", so "lah tablet" would be compared with
    -- 200,000 names and time out. The name part ("lah") is what identifies the brand.
    select trim(regexp_replace(
      regexp_replace(lower(q), '[^a-z0-9]+', ' ', 'g'),
      '\m(tablets?|tabs?|capsules?|caps?|syrup|suspension|injection|inj|cream|gel|ointment|drops?|solution|lotion|spray|powder|kit|mg|mcg|ml|ip|bp|usp)\M',
      ' ', 'g')) as nq
  ),
  candidates as (
    -- One row per brand name (the dataset lists some brands twice, e.g. two pack sizes).
    select distinct on (b.name)
      b.*,
      (word_similarity(query.nq, b.name_norm) + similarity(query.nq, b.name_norm)) / 2 as score
    from brands b, query
    where length(query.nq) >= 3
      and (include_discontinued or not b.discontinued)
      and query.nq <% b.name_norm            -- uses the trigram index
    order by b.name, b.discontinued, b.pack_size nulls last
  )
  select
    c.id, c.name, c.manufacturer, c.form, c.release, c.pack_size, c.pack_unit, c.mrp_2022,
    c.composition_key, c.composition_complete, c.discontinued,
    (
      select jsonb_agg(
        jsonb_build_object('salt', s.display_name, 'value', bi.strength_value, 'unit', bi.strength_unit)
        order by s.name_norm
      )
      from brand_ingredients bi join salts s on s.id = bi.salt_id
      where bi.brand_id = c.id
    ) as ingredients,
    c.score::real
  from candidates c
  order by c.score desc, c.name
  limit least(max_results, 20);
$$;

