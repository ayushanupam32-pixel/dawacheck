-- M2: the official Kendra list already has coordinates for 99.9% of Kendras, so most rows use
-- them directly ('official'). 'address' (OpenStreetMap geocoding) and 'pincode' (centre of the
-- PIN code area) are only used to fix the few that are missing or clearly misplaced.
alter table kendras drop constraint if exists kendras_geo_precision_check;
alter table kendras
  add constraint kendras_geo_precision_check
  check (geo_precision in ('official', 'address', 'pincode'));

-- The Kendra list has no shop name, only an address; the app shows "Jan Aushadhi Kendra".
alter table kendras drop column if exists name;

-- Every monthly load stamps the Kendras it saw; older stamps = closed Kendras, deleted.
alter table kendras add column if not exists last_seen date;
