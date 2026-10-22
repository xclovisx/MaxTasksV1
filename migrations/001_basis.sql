create table bedrijven (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  garage_adres text,
  werkdagen int[] not null default '{1,2,3,4,5}',
  aangemaakt_op timestamptz not null default now(),
  constraint werkdagen_geldig check (cardinality(werkdagen) between 1 and 7 and werkdagen <@ array[1,2,3,4,5,6,7])
);

create table gebruikers (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid references bedrijven(id) on delete cascade,
  naam text not null,
  gebruikersnaam text not null unique,
  wachtwoord_hash text,
  rol text not null check (rol in ('beheerder', 'medewerker')),
  actief boolean not null default true,
  mislukte_pogingen int not null default 0,
  geblokkeerd_tot timestamptz,
  activatie_token_hash text unique,
  activatie_code_hash text,
  activatie_verloopt_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  constraint rol_bedrijf check ((rol = 'beheerder' and bedrijf_id is null) or (rol = 'medewerker' and bedrijf_id is not null)),
  constraint gebruikersnaam_klein check (gebruikersnaam = lower(gebruikersnaam))
);

create table sessies (
  id text primary key,
  gebruiker_id uuid not null references gebruikers(id) on delete cascade,
  verloopt_op timestamptz not null,
  aangemaakt_op timestamptz not null default now()
);
create index sessies_gebruiker on sessies (gebruiker_id);

create table borden (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijven(id) on delete cascade,
  naam text not null,
  gearchiveerd boolean not null default false,
  aangemaakt_op timestamptz not null default now()
);

create table herhalingen (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijven(id) on delete cascade,
  bord_id uuid not null references borden(id) on delete cascade,
  titel text not null,
  omschrijving text not null default '',
  tijd time,
  prioriteit text not null check (prioriteit in ('laag', 'middel', 'hoog', 'zsm', 'nu')),
  type text not null check (type in ('dagelijks', 'wekelijks', 'maandelijks', 'weekdagen', 'elke_x_weken')),
  weekdagen int[] not null default '{}',
  interval_weken int not null default 1,
  startdatum date not null,
  gegenereerd_tot date,
  actief boolean not null default true,
  aangemaakt_door uuid references gebruikers(id) on delete set null,
  aangemaakt_op timestamptz not null default now()
);

create table taken (
  id uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijven(id) on delete cascade,
  bord_id uuid not null references borden(id) on delete cascade,
  titel text not null,
  omschrijving text not null default '',
  datum date not null,
  tijd time,
  prioriteit text not null check (prioriteit in ('laag', 'middel', 'hoog', 'zsm', 'nu')),
  status text not null default 'open' check (status in ('open', 'bezig', 'klaar')),
  oorspronkelijke_datum date not null,
  uitgesteld_van date,
  gemist boolean not null default false,
  herhaling_id uuid references herhalingen(id) on delete set null,
  afwijkend boolean not null default false,
  versie int not null default 1,
  aangemaakt_door uuid references gebruikers(id) on delete set null,
  aangemaakt_op timestamptz not null default now(),
  gewijzigd_door uuid references gebruikers(id) on delete set null,
  gewijzigd_op timestamptz not null default now(),
  klaar_op timestamptz
);
create index taken_bord_datum on taken (bord_id, datum);
create index taken_bedrijf_datum on taken (bedrijf_id, datum);
create unique index taken_herhaling_datum on taken (herhaling_id, oorspronkelijke_datum) where herhaling_id is not null;

create table taak_historie (
  id uuid primary key default gen_random_uuid(),
  taak_id uuid not null references taken(id) on delete cascade,
  gebruiker_id uuid references gebruikers(id) on delete set null,
  tijdstip timestamptz not null default now(),
  wijzigingen jsonb not null
);
create index taak_historie_taak on taak_historie (taak_id, tijdstip);

create view taken_weergave with (security_invoker = true) as
select
  t.id, t.bedrijf_id, t.bord_id, t.titel, t.omschrijving, t.datum,
  to_char(t.tijd, 'HH24:MI') as tijd,
  t.prioriteit, t.status, t.oorspronkelijke_datum, t.uitgesteld_van, t.gemist,
  t.herhaling_id, t.afwijkend, t.versie, t.aangemaakt_op, t.gewijzigd_op, t.klaar_op,
  ag.naam as aangemaakt_door_naam,
  gg.naam as gewijzigd_door_naam,
  h.type as herhaling_type,
  h.weekdagen as herhaling_weekdagen,
  h.interval_weken as herhaling_interval,
  bd.naam as bedrijf_naam,
  bo.naam as bord_naam,
  bo.gearchiveerd as bord_gearchiveerd
from taken t
join bedrijven bd on bd.id = t.bedrijf_id
join borden bo on bo.id = t.bord_id
left join gebruikers ag on ag.id = t.aangemaakt_door
left join gebruikers gg on gg.id = t.gewijzigd_door
left join herhalingen h on h.id = t.herhaling_id;
