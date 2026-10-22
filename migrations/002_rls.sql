do $$
begin
  if not exists (select from pg_roles where rolname = 'takenbord_app') then
    create role takenbord_app nologin;
  end if;
end
$$;
grant takenbord_app to current_user;

grant usage on schema public to takenbord_app;
grant select, insert, update, delete on bedrijven, gebruikers, borden, herhalingen, taken, taak_historie to takenbord_app;
grant select, delete on sessies to takenbord_app;
grant select on taken_weergave to takenbord_app;

create function app_rol() returns text language sql stable
  as $$ select nullif(current_setting('app.rol', true), '') $$;
create function app_bedrijf_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.bedrijf_id', true), '')::uuid $$;

alter table bedrijven enable row level security;
alter table gebruikers enable row level security;
alter table sessies enable row level security;
alter table borden enable row level security;
alter table herhalingen enable row level security;
alter table taken enable row level security;
alter table taak_historie enable row level security;

create policy beheerder_alles on bedrijven for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_lezen on bedrijven for select using (id = app_bedrijf_id());

create policy beheerder_alles on gebruikers for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy collega_lezen on gebruikers for select using (bedrijf_id = app_bedrijf_id());
create policy beheerder_zichtbaar on gebruikers for select using (rol = 'beheerder');

create policy beheerder_alles on sessies for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');

create policy beheerder_alles on borden for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_lezen on borden for select using (bedrijf_id = app_bedrijf_id());

create policy beheerder_alles on herhalingen for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_bedrijf on herhalingen for all using (bedrijf_id = app_bedrijf_id()) with check (bedrijf_id = app_bedrijf_id());

create policy beheerder_alles on taken for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_bedrijf on taken for all using (bedrijf_id = app_bedrijf_id()) with check (bedrijf_id = app_bedrijf_id());

create policy beheerder_alles on taak_historie for all using (app_rol() = 'beheerder') with check (app_rol() = 'beheerder');
create policy eigen_bedrijf on taak_historie for all
  using (exists (select 1 from taken t where t.id = taak_historie.taak_id))
  with check (exists (select 1 from taken t where t.id = taak_historie.taak_id));
