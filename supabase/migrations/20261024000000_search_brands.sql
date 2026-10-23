-- Typo-tolerant brand search for "type the medicine name" (used by /api/match).
--
-- How it ranks: pg_trgm splits text into 3-letter pieces ("tel", "elm", "lma", ...).
-- word_similarity(query, name) is high when the query looks like PART of the name, so "telma"
-- finds "Telma 40 Tablet" and the typo "glycomt" still finds "Glycomet". similarity() then
-- breaks ties in favour of names that are close overall.
create or replace function public.search_brands(q text, max_results int default 8)
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
  ingredients jsonb,
  score real
)
language sql
stable
security invoker                 -- runs with the caller's rights, so RLS still applies
set search_path = public, extensions
as $$
  with query as (
    -- Same normalization as the pipeline: lowercase, punctuation -> spaces.
    select trim(regexp_replace(lower(q), '[^a-z0-9]+', ' ', 'g')) as nq
  ),
  candidates as (
    -- One row per brand name (the dataset lists some brands twice, e.g. two pack sizes).
    select distinct on (b.name)
      b.*,
      (word_similarity(query.nq, b.name_norm) + similarity(query.nq, b.name_norm)) / 2 as score
    from brands b, query
    where length(query.nq) >= 3
      and not b.discontinued
      and query.nq <% b.name_norm            -- uses the trigram index
    order by b.name, b.pack_size nulls last
  )
  select
    c.id, c.name, c.manufacturer, c.form, c.release, c.pack_size, c.pack_unit, c.mrp_2022,
    c.composition_key, c.composition_complete,
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

grant execute on function public.search_brands(text, int) to anon, authenticated;
