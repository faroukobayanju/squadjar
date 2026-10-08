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
create table if not exists activity (
  tx text not null,
  log_index int not null,
  member text not null,
  kind text not null,
  amount numeric not null,
  squad text,
  round int,
  block bigint not null,
  at timestamptz not null,
  primary key (tx, log_index, member)
);
create index if not exists activity_member_at on activity (member, at desc);
alter table activity drop constraint if exists activity_kind_check;
-- No deposits since the no-deposit contracts: a deposit-era deposit was money paid into the squad.
update activity set kind = 'contribution' where kind = 'deposit';
-- covered and stopped only exist in rows from deposit-era squads.
alter table activity add constraint activity_kind_check check (kind in ('topup','contribution','payout','held','refund','payback','credit','withdraw','sent','received','covered','stopped'));
alter table activity add column if not exists counterparty text;
create table if not exists notifications (
  member text not null,
  squad text not null references squads(address),
  round int not null,
  stage text not null,
  channel text not null check (channel in ('inapp','email')),
  body text not null,
  sent_at timestamptz not null default now(),
  primary key (member, squad, round, stage, channel)
);
create index if not exists notifications_member_sent on notifications (member, sent_at desc);
-- Pay nudges (t24h, t1h, missed) and settlement alerts: debt, covered (held money paid the miss), short (payout short), credit.
alter table notifications drop constraint if exists notifications_stage_check;
alter table notifications add constraint notifications_stage_check check (stage in ('t24h','t1h','missed','debt','covered','short','credit'));
-- ref tells apart alerts that share a round (one per CreditPaid log: tx:logIndex); '' for everything else.
alter table notifications add column if not exists ref text not null default '';
alter table notifications drop constraint if exists notifications_pkey;
alter table notifications add primary key (member, squad, round, stage, channel, ref);
create table if not exists judge_squads (
  address text primary key references squads(address),
  invite_code text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
