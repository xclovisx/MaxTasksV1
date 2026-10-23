create table afwezigheden (
  id uuid primary key default gen_random_uuid(),
  begindatum date not null,
  einddatum date,
  hele_dag boolean not null,
  van time,
  tot time,
  reden text check (char_length(reden) <= 100),
  herhaling_type text check (herhaling_type in ('dagelijks', 'wekelijks', 'maandelijks', 'weekdagen', 'elke_x_weken')),
  weekdagen int[] not null default '{}' check (weekdagen <@ array[1, 2, 3, 4, 5, 6, 7]),
  interval_weken int not null default 1 check (interval_weken between 1 and 52),
  aangemaakt_door uuid references gebruikers(id) on delete set null,
  aangemaakt_op timestamptz not null default now(),
  constraint afwezigheid_einde check (einddatum is null or einddatum >= begindatum),
  constraint afwezigheid_tijdvak check (
    (hele_dag and van is null and tot is null) or (not hele_dag and van is not null and tot is not null and van < tot)
  )
);
