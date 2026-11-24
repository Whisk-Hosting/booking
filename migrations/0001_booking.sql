-- The booking app's tables. Times are timestamptz (instants); weekly hours are minutes past
-- midnight in the business's own time zone.

create table settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Bookings',
  tagline text not null default '',
  accent text not null default '#e85d2a',
  timezone text not null default 'America/New_York',
  currency text not null default 'USD',
  min_notice_minutes int not null default 120,
  window_days int not null default 60,
  step_minutes int not null default 30,
  cancel_cutoff_minutes int not null default 720,
  reminder_minutes int not null default 1440,
  email_from text not null default '',
  reply_to text not null default ''
);
insert into settings (id) values (1);

create table staff (
  id serial primary key,
  name text not null,
  email text not null default '',
  role text not null default '',
  active boolean not null default true,
  position int not null default 0,
  -- Their bookings as a calendar feed to subscribe to, at /feeds/<feed_token>.ics.
  feed_token text not null unique,
  -- Their own calendar's private iCal address; its busy times block bookings.
  busy_url text not null default '',
  busy jsonb not null default '[]',
  busy_checked_at timestamptz,
  busy_error text not null default ''
);

create table services (
  id serial primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  duration int not null check (duration between 5 and 720),
  buffer_after int not null default 0 check (buffer_after between 0 and 240),
  price_cents int check (price_cents >= 0),
  location text not null default '',
  active boolean not null default true,
  position int not null default 0
);

create table service_staff (
  service_id int not null references services on delete cascade,
  staff_id int not null references staff on delete cascade,
  primary key (service_id, staff_id)
);

create table hours (
  id serial primary key,
  staff_id int not null references staff on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_minute int not null check (start_minute between 0 and 1440),
  end_minute int not null check (end_minute between 0 and 1440),
  check (end_minute > start_minute)
);
create index hours_staff on hours (staff_id);

create table time_off (
  id serial primary key,
  staff_id int not null references staff on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '',
  check (ends_at > starts_at)
);
create index time_off_staff on time_off (staff_id, ends_at);

create table bookings (
  id serial primary key,
  -- The customer's private link to see, move or cancel it: /b/<token>.
  token text not null unique,
  service_id int not null references services,
  staff_id int not null references staff,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by text not null default 'customer',
  cancelled_at timestamptz,
  cancelled_by text not null default '',
  reminder_sent_at timestamptz,
  check (ends_at > starts_at)
);
create index bookings_staff_time on bookings (staff_id, starts_at) where status = 'confirmed';
create index bookings_start on bookings (starts_at);

create table emails (
  id serial primary key,
  booking_id int references bookings on delete set null,
  kind text not null,
  to_address text not null,
  subject text not null,
  html text not null,
  body_text text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'demo')),
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index emails_recent on emails (created_at desc);
