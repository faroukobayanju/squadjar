create table if not exists users (
  privy_id text primary key,
  address text unique not null,
  display_name text not null,
  email text,
  language text not null default 'en' check (language in ('en','pcm','yo','ig','ha')),
  created_at timestamptz not null default now()
);
create table if not exists squads (
  address text primary key,
  slug text unique not null,
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null,
  organizer text not null,
  last_poke timestamptz,
  created_at timestamptz not null default now()
);
