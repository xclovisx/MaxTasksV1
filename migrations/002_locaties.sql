alter table instellingen add column garage_lat double precision, add column garage_lng double precision;

create table locaties (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  adres text not null,
  lat double precision not null,
  lng double precision not null,
  google_place_id text unique,
  gebruik_teller int not null default 0,
  aangemaakt_op timestamptz not null default now()
);

create table taak_stops (
  id uuid primary key default gen_random_uuid(),
  taak_id uuid not null references taken(id) on delete cascade,
  volgorde int not null check (volgorde between 1 and 9),
  naam text not null,
  adres text not null,
  lat double precision not null,
  lng double precision not null,
  google_place_id text,
  locatie_id uuid references locaties(id) on delete set null,
  unique (taak_id, volgorde)
);

alter table herhalingen add column stops jsonb not null default '[]';

create or replace view taken_weergave as
select
  t.id, t.bord_id, t.titel, t.omschrijving, t.datum,
  to_char(t.tijd, 'HH24:MI') as tijd,
  t.prioriteit, t.status, t.oorspronkelijke_datum, t.uitgesteld_van, t.gemist,
  t.herhaling_id, t.afwijkend, t.versie, t.aangemaakt_op, t.gewijzigd_op, t.klaar_op,
  ag.naam as aangemaakt_door_naam,
  gg.naam as gewijzigd_door_naam,
  h.type as herhaling_type,
  h.weekdagen as herhaling_weekdagen,
  h.interval_weken as herhaling_interval,
  bo.naam as bord_naam,
  bo.gearchiveerd as bord_gearchiveerd,
  coalesce((
    select json_agg(json_build_object(
      'naam', s.naam, 'adres', s.adres, 'lat', s.lat, 'lng', s.lng,
      'googlePlaceId', s.google_place_id, 'locatieId', s.locatie_id) order by s.volgorde)
    from taak_stops s where s.taak_id = t.id
  ), '[]'::json) as stops
from taken t
join borden bo on bo.id = t.bord_id
left join gebruikers ag on ag.id = t.aangemaakt_door
left join gebruikers gg on gg.id = t.gewijzigd_door
left join herhalingen h on h.id = t.herhaling_id;
