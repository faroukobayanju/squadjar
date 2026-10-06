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
create table if not exists autopay (
  member text not null,
  squad text not null references squads(address),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (member, squad)
);
alter table users add column if not exists username text;
create unique index if not exists users_username_key on users (lower(username));
alter table squads add column if not exists visibility text not null default 'private' check (visibility in ('private','public'));
alter table squads add column if not exists description text check (description is null or char_length(description) <= 80);
alter table squads add column if not exists min_tier int not null default 0 check (min_tier between 0 and 2);
alter table squads add column if not exists approval boolean not null default false;
create table if not exists join_requests (
  squad text not null references squads(address),
  member text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  primary key (squad, member)
);
create table if not exists activity (
  tx text not null,
  log_index int not null,
  member text not null,
  kind text not null check (kind in ('topup','deposit','contribution','payout','refund','covered','withdraw','sent','received','stopped')),
  amount numeric not null,
  squad text,
  round int,
  block bigint not null,
  at timestamptz not null,
  primary key (tx, log_index, member)
);
create index if not exists activity_member_at on activity (member, at desc);
alter table activity drop constraint if exists activity_kind_check;
alter table activity add constraint activity_kind_check check (kind in ('topup','deposit','contribution','payout','refund','covered','withdraw','sent','received','stopped'));
alter table activity add column if not exists counterparty text;
