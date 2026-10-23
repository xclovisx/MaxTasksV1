alter table instellingen
  add column ntfy_onderwerp text constraint ntfy_onderwerp_geldig check (ntfy_onderwerp ~ '^[A-Za-z0-9_-]{1,64}$');
