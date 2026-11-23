
-- OfficeOurs schema: all tables, relationships and constraints.

-- Ownership: [S1] Scheduling & Notifications  [S2] Requests & FAQ
--            [S3] Queue, QR & History

drop table if exists notifications, meetings, queue_entries, requests, faqs,
  holidays, slots, schedule_entries, instructor_modules, group_modules,
  profiles, university_registry, modules, groups cascade;

-- ---------------------------------------------------------------------
-- University data (seeded, read-only for the app)
-- ---------------------------------------------------------------------

-- Student groups. each group (SE-A3 for example) shares one timetable and one set of modules
create table groups (
  id          serial primary key, --serial for auto increment
  name        text not null unique                      
);

-- Modules
create table modules (
  id          serial primary key,
  code        text not null unique,                    
  name        text not null
);

-- Every valid university ID, registration only succeeds for IDs found here
create table university_registry ( --students and instructors
  university_id text primary key,                       -- student or staff ID
  full_name     text not null,
  email         text not null unique,                   -- 3shan login + QR emails
  role          text not null check (role in ('student', 'instructor')),
  group_id      int references groups(id),              -- students bs 3ndhom group_id
  check ((role = 'student' and group_id is not null) or --lw student lazm group
         (role = 'instructor' and group_id is null))  --lw instructor lazm no group
);

-- Which modules each group studies (auto filled after student enter his/her ID)
create table group_modules ( --Junction table cause many to many
  group_id    int not null references groups(id) on delete cascade,
  module_id   int not null references modules(id) on delete cascade,
  --cascade ashan lw ms7t el primrary key, ems7 brdo el foreign key
  primary key (group_id, module_id) --composite key cause one group many modules and vice versa
);

-- Which modules each instructor teaches
create table instructor_modules ( --junction table as well, cause many to many
  instructor_id text not null references university_registry(university_id) on delete cascade,
  module_id     int  not null references modules(id) on delete cascade,
  primary key (instructor_id, module_id)
);

-- Weekly timetable per group (used to rank non-clashing slots first)
create table schedule_entries (
  id          serial primary key,
  group_id    int  not null references groups(id) on delete cascade,
  module_id   int  not null references modules(id),
  day_of_week int  not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time  time not null,
  end_time    time not null,
  kind        text not null default 'lecture' check (kind in ('lecture', 'lab', 'tutorial')),
  check (end_time > start_time) --Entry validation, ezay tkhls before you start
);

-- ---------------------------------------------------------------------
--  Accounts: one row per registered user, linked to Supabase Auth
-- ---------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  university_id text not null unique references university_registry(university_id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Office-hour slots + holiday cache
-- ---------------------------------------------------------------------
create table slots (
  id            uuid primary key default gen_random_uuid(),
  instructor_id text not null references university_registry(university_id),
  module_id     int  references modules(id),   -- null = open to all of the instructor's modules
  slot_date     date not null,
  start_time    time not null,
  end_time      time not null,
  location      text not null, --class kza, building kza
  capacity      int  not null default 5 check (capacity between 1 and 50),
  status        text not null default 'active' check (status in ('active', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_time > start_time)
);
create index slots_instructor_date_idx on slots (instructor_id, slot_date);
create index slots_date_status_idx on slots (slot_date, status);

-- Egypt holidays fetched from Calendarific once per year and cached here
create table holidays (
  holiday_date date primary key,
  name         text not null,
  year         int  not null,
  fetched_at   timestamptz not null default now()
);
create index holidays_year_idx on holidays (year);

-- ---------------------------------------------------------------------
-- FAQ + meeting requests
-- ---------------------------------------------------------------------
create table faqs (
  id            uuid primary key default gen_random_uuid(),
  instructor_id text not null references university_registry(university_id) on delete cascade,
  module_id     int  references modules(id),
  question      text not null,
  answer        text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index faqs_instructor_idx on faqs (instructor_id);

create table requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      text not null references university_registry(university_id),
  slot_id         uuid not null references slots(id) on delete cascade,
  title           text not null check (char_length(title) between 3 and 120),
  description     text not null check (char_length(description) between 10 and 2000),
  preferred_start time not null,                        -- time window inside the slot
  preferred_end   time not null,
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status          text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')),
  faq_suggestion  text,                                 -- AI answer shown before submitting (null = no match)
  opened_at       timestamptz,                          -- first time the instructor opened it student can't edit after
  status_reason   text,                                 -- reason for rejection / emergency cancellation
  cancelled_by    text check (cancelled_by in ('student', 'instructor')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (preferred_end > preferred_start)
);
create index requests_slot_status_idx on requests (slot_id, status);
create index requests_student_idx on requests (student_id);
-- one active request per student per slot
create unique index requests_one_active_per_slot
  on requests (student_id, slot_id) where status in ('pending', 'confirmed');

-- ---------------------------------------------------------------------
--  Queue + meeting history
-- ---------------------------------------------------------------------
create table queue_entries (
  id            uuid primary key default gen_random_uuid(),
  slot_id       uuid not null references slots(id) on delete cascade,
  request_id    uuid not null unique references requests(id) on delete cascade,
  position      int  not null check (position > 0),
  status        text not null default 'waiting'
                check (status in ('waiting', 'in_meeting', 'done', 'skipped')),
  qr_token      uuid not null unique default gen_random_uuid(),  -- encoded in the QR -> check-in page
  checked_in_at timestamptz,
  called_at     timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (slot_id, position)
);

create table meetings (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null unique references requests(id) on delete cascade,
  slot_id          uuid not null references slots(id),
  student_id       text not null references university_registry(university_id),
  instructor_id    text not null references university_registry(university_id),
  started_at       timestamptz not null,
  ended_at         timestamptz,
  instructor_notes text,
  student_notes    text,
  created_at       timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index meetings_student_idx on meetings (student_id);
create index meetings_instructor_idx on meetings (instructor_id);

-- ---------------------------------------------------------------------
--  Notifications 
-- ---------------------------------------------------------------------
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id text not null references university_registry(university_id) on delete cascade,
  type         text not null check (type in ('request_created', 'request_updated', 'request_confirmed',
                 'request_rejected', 'request_cancelled', 'slot_changed', 'slot_cancelled',
                 'queue_called', 'meeting_completed')),
  message      text not null,
  link         text,                                    -- frontend route to open
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on notifications (recipient_id, is_read, created_at desc);

-- ---------------------------------------------------------------------
-- Security Practice, to make sure public key can't read: RLS on every table
-- ---------------------------------------------------------------------
alter table groups              enable row level security;
alter table modules             enable row level security;
alter table university_registry enable row level security;
alter table group_modules       enable row level security;
alter table instructor_modules  enable row level security;
alter table schedule_entries    enable row level security;
alter table profiles            enable row level security;
alter table slots               enable row level security;
alter table holidays            enable row level security;
alter table faqs                enable row level security;
alter table requests            enable row level security;
alter table queue_entries       enable row level security;
alter table meetings            enable row level security;
alter table notifications       enable row level security;

-- ---------------------------------------------------------------------
-- Auto-update updated_at whenever there is an update
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger slots_set_updated_at    before update on slots    for each row execute function set_updated_at();
create trigger faqs_set_updated_at     before update on faqs     for each row execute function set_updated_at();
create trigger requests_set_updated_at before update on requests for each row execute function set_updated_at();
