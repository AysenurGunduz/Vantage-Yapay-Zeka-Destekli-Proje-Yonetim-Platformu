-- Vantage veritabanı şeması (Supabase / Postgres)
-- Görsel diyagram: docs/erd.md
-- Bu dosya Supabase projesinin SQL Editor'ünde çalıştırılarak tabloları oluşturur.

create extension if not exists "pgcrypto";

create type member_role as enum ('owner', 'admin', 'member');
create type task_status as enum ('backlog', 'todo', 'in_progress', 'review', 'done');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');
create type suggestion_status as enum ('pending', 'accepted', 'rejected');
create type risk_level as enum ('low', 'medium', 'high');
create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  title text,
  created_at timestamptz not null default now()
);

-- Yeni bir kullanıcı auth.users'a eklendiğinde otomatik bir profiles satırı oluşturur.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  role member_role not null default 'member',
  token uuid not null default gen_random_uuid(),
  status invitation_status not null default 'pending',
  invited_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);
create unique index idx_organization_invitations_token on organization_invitations (token);
create index idx_organization_invitations_organization_id on organization_invitations (organization_id);

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active',
  start_date date,
  end_date date,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
create index idx_projects_organization_id on projects (organization_id);

create table project_members (
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role_in_project member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  parent_task_id uuid references tasks (id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'backlog',
  priority task_priority not null default 'medium',
  tags text[] not null default '{}',
  assignee_id uuid references profiles (id),
  estimated_hours numeric(6, 2),
  due_date date,
  order_index integer not null default 0,
  ai_generated boolean not null default false,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tasks_project_id on tasks (project_id);
create index idx_tasks_assignee_id on tasks (assignee_id);
create index idx_tasks_due_date on tasks (due_date);

-- Realtime, RLS'siz bir tabloda tüm değişiklikleri tüm bağlı istemcilere yayınlar.
-- Kanban panosunun canlı senkronu için bu yüzden önce satır düzeyi güvenlik (RLS)
-- ekleniyor: bir kullanıcı yalnızca üyesi olduğu projenin görevlerini okuyabilir.
alter table tasks enable row level security;

create policy "Project members can read their tasks"
on tasks for select
using (
  exists (
    select 1 from project_members
    where project_members.project_id = tasks.project_id
      and project_members.user_id = auth.uid()
  )
);

alter publication supabase_realtime add table tasks;

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  user_id uuid not null references profiles (id),
  content text not null,
  created_at timestamptz not null default now()
);
create index idx_task_comments_task_id on task_comments (task_id);

create table task_activity_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  user_id uuid not null references profiles (id),
  action_type text not null,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);
create index idx_task_activity_log_task_id on task_activity_log (task_id);

create table ai_task_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  source_description text not null,
  suggested_tasks jsonb not null,
  status suggestion_status not null default 'pending',
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table work_style_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  traits jsonb not null,
  summary text,
  model_used text,
  generated_at timestamptz not null default now()
);
create index idx_work_style_profiles_user_id on work_style_profiles (user_id);

create table progress_summaries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  summary text not null,
  model_used text,
  generated_at timestamptz not null default now()
);
create index idx_progress_summaries_project_id on progress_summaries (project_id);

create table delay_risk_scores (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  risk_score numeric(5, 2) not null,
  risk_level risk_level not null,
  explanation text,
  computed_at timestamptz not null default now()
);
create index idx_delay_risk_scores_task_id on delay_risk_scores (task_id);

-- Bir görev birine atanırken yöneticinin bırakabileceği not; ilgili
-- "assignee_id" aktivite kaydına eklenir, geçmişte kalıcı olarak durur.
alter table task_activity_log add column note text;

-- Manuel efor girişi / sayaç (timer) durdurulunca eklenen zaman kaydı.
-- Toplam harcanan süre bu tablodaki kayıtların toplanmasıyla hesaplanır,
-- tasks üzerinde ayrı bir "spent_hours" kolonu tutulmaz (tek doğruluk kaynağı).
create table task_time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  user_id uuid not null references profiles (id),
  minutes integer not null check (minutes > 0),
  note text,
  logged_at timestamptz not null default now()
);
create index idx_task_time_entries_task_id on task_time_entries (task_id);

create type task_dependency_type as enum ('blocked_by', 'relates_to', 'duplicates');

-- Yön: task_id, depends_on_task_id'ye bağımlı/ilişkili (örn. task_id "blocked_by"
-- depends_on_task_id ise, depends_on_task_id bitmeden task_id tamamlanamaz).
create table task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  depends_on_task_id uuid not null references tasks (id) on delete cascade,
  dependency_type task_dependency_type not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  check (task_id <> depends_on_task_id),
  unique (task_id, depends_on_task_id, dependency_type)
);
create index idx_task_dependencies_task_id on task_dependencies (task_id);
create index idx_task_dependencies_depends_on_task_id on task_dependencies (depends_on_task_id);
