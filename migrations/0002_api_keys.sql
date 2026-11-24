-- Keys for the JSON API at /api/v1, made and revoked by an admin in Settings. Only the sha256 of
-- each key is kept, with its first 10 characters to tell keys apart on the page.
create table api_keys (
  id serial primary key,
  label text not null,
  prefix text not null,
  hash text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
