-- banned_fdcs: keep what each ban is limited to.
--
-- Found on the live site after the first load: "Aceclofenac (SR) + Paracetamol" (only the
-- sustained-release form is banned), "Diclofenac + Paracetamol injection" (only the injection)
-- and "Gliclazide 80mg + Metformin 325 mg" (only those strengths) were matched on their salts
-- alone, which called thousands of legal medicines banned. The check now compares these too.
alter table banned_fdcs
  add column salt_strengths jsonb not null default '{}'::jsonb,  -- {"gliclazide": ["80:mg"]}
  add column forms jsonb not null default '[]'::jsonb,           -- ["injection"]
  add column releases jsonb not null default '[]'::jsonb;        -- ["er"]
