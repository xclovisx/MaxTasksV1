create table bijlagen (
  id uuid primary key default gen_random_uuid(),
  taak_id uuid not null references taken(id) on delete cascade,
  naam text not null check (char_length(naam) between 1 and 200),
  type text not null check (type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  grootte integer not null check (grootte between 1 and 10485760),
  aangemaakt_door uuid references gebruikers(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);
create index bijlagen_taak on bijlagen (taak_id, aangemaakt_op);

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
  ), '[]'::json) as stops,
  coalesce((
    select json_agg(json_build_object('id', b.id, 'naam', b.naam, 'type', b.type, 'grootte', b.grootte)
      order by b.aangemaakt_op, b.id)
    from bijlagen b where b.taak_id = t.id
  ), '[]'::json) as bijlagen
from taken t
join borden bo on bo.id = t.bord_id
left join gebruikers ag on ag.id = t.aangemaakt_door
left join gebruikers gg on gg.id = t.gewijzigd_door
left join herhalingen h on h.id = t.herhaling_id;
