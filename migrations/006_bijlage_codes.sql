alter table bijlagen
  add column code_formaat text,
  add column code_tekst text check (char_length(code_tekst) between 1 and 2000),
  add constraint bijlagen_code_compleet check ((code_formaat is null) = (code_tekst is null));

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
    select json_agg(json_build_object(
      'id', b.id, 'naam', b.naam, 'type', b.type, 'grootte', b.grootte,
      'code', case when b.code_formaat is null then null
                   else json_build_object('formaat', b.code_formaat, 'tekst', b.code_tekst) end)
      order by b.aangemaakt_op, b.id)
    from bijlagen b where b.taak_id = t.id
  ), '[]'::json) as bijlagen
from taken t
join borden bo on bo.id = t.bord_id
left join gebruikers ag on ag.id = t.aangemaakt_door
left join gebruikers gg on gg.id = t.gewijzigd_door
left join herhalingen h on h.id = t.herhaling_id;
