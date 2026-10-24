-- search_brands() can now include discontinued brands (for scanning).
--
-- Typing a name shows only brands still sold, as before. But a strip in someone's cabinet may be
-- old stock of a brand the dataset marks discontinued (e.g. Fincover 1mg), and its composition is
-- still what the person is taking, so the scan matcher (lib/find-match.ts) asks for them too.
-- When a name exists as both, the active row wins.
drop function if exists public.search_brands(text, int);

create function public.search_brands(
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

grant execute on function public.search_brands(text, int, boolean) to anon, authenticated;
