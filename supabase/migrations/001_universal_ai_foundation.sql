create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,

  full_name text,
  avatar_url text,

  plan text not null
    default 'free',

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);

create table if not exists public.workspaces (
  id uuid primary key
    default gen_random_uuid(),

  owner_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null
    default 'Workspace principal',

  slug text not null unique,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);

create table if not exists public.projects (
  id uuid primary key
    default gen_random_uuid(),

  owner_id uuid not null
    references auth.users(id)
    on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  name text not null,
  description text,

  status text not null
    default 'active',

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);

create table if not exists public.conversations (
  id uuid primary key
    default gen_random_uuid(),

  owner_id uuid not null
    references auth.users(id)
    on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  project_id uuid
    references public.projects(id)
    on delete set null,

  title text not null
    default 'Nouvelle mission',

  model_preference text not null
    default 'auto',

  status text not null
    default 'active',

  summary text,
  summary_updated_at timestamptz,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);

create table if not exists public.messages (
  id uuid primary key
    default gen_random_uuid(),

  owner_id uuid not null
    references auth.users(id)
    on delete cascade,

  conversation_id uuid not null
    references public.conversations(id)
    on delete cascade,

  role text not null
    check (
      role in (
        'user',
        'assistant',
        'system',
        'tool'
      )
    ),

  content text not null,

  provider text,
  model text,
  token_count integer,

  metadata jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now()
);

create table if not exists public.memories (
  id uuid primary key
    default gen_random_uuid(),

  owner_id uuid not null
    references auth.users(id)
    on delete cascade,

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  conversation_id uuid
    references public.conversations(id)
    on delete cascade,

  kind text not null
    default 'fact',

  content text not null,

  importance real not null
    default 0.5
    check (
      importance >= 0
      and importance <= 1
    ),

  metadata jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now(),

  last_used_at timestamptz
);

create table if not exists public.attachments (
  id uuid primary key
    default gen_random_uuid(),

  owner_id uuid not null
    references auth.users(id)
    on delete cascade,

  conversation_id uuid
    references public.conversations(id)
    on delete cascade,

  project_id uuid
    references public.projects(id)
    on delete cascade,

  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,

  extracted_text text,

  metadata jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now()
);

create index if not exists conversations_owner_updated_idx
on public.conversations (
  owner_id,
  updated_at desc
);

create index if not exists messages_conversation_created_idx
on public.messages (
  conversation_id,
  created_at asc
);

create index if not exists memories_owner_importance_idx
on public.memories (
  owner_id,
  importance desc
);

alter table public.profiles
enable row level security;

alter table public.workspaces
enable row level security;

alter table public.projects
enable row level security;

alter table public.conversations
enable row level security;

alter table public.messages
enable row level security;

alter table public.memories
enable row level security;

alter table public.attachments
enable row level security;

drop policy if exists
  "profiles_owner_all"
on public.profiles;

create policy
  "profiles_owner_all"
on public.profiles
for all
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);

drop policy if exists
  "workspaces_owner_all"
on public.workspaces;

create policy
  "workspaces_owner_all"
on public.workspaces
for all
using (
  owner_id = auth.uid()
)
with check (
  owner_id = auth.uid()
);

drop policy if exists
  "projects_owner_all"
on public.projects;

create policy
  "projects_owner_all"
on public.projects
for all
using (
  owner_id = auth.uid()
)
with check (
  owner_id = auth.uid()
);

drop policy if exists
  "conversations_owner_all"
on public.conversations;

create policy
  "conversations_owner_all"
on public.conversations
for all
using (
  owner_id = auth.uid()
)
with check (
  owner_id = auth.uid()
);

drop policy if exists
  "messages_owner_all"
on public.messages;

create policy
  "messages_owner_all"
on public.messages
for all
using (
  owner_id = auth.uid()
)
with check (
  owner_id = auth.uid()
);

drop policy if exists
  "memories_owner_all"
on public.memories;

create policy
  "memories_owner_all"
on public.memories
for all
using (
  owner_id = auth.uid()
)
with check (
  owner_id = auth.uid()
);

drop policy if exists
  "attachments_owner_all"
on public.attachments;

create policy
  "attachments_owner_all"
on public.attachments
for all
using (
  owner_id = auth.uid()
)
with check (
  owner_id = auth.uid()
);

create or replace function
public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_slug text;
begin
  workspace_slug :=
    'workspace-' ||
    replace(
      new.id::text,
      '-',
      ''
    );

  insert into public.profiles (
    id,
    full_name
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data
        ->> 'full_name',
      ''
    )
  )
  on conflict (id)
  do nothing;

  insert into public.workspaces (
    owner_id,
    name,
    slug
  )
  values (
    new.id,
    'Workspace principal',
    workspace_slug
  )
  on conflict (slug)
  do nothing;

  return new;
end;
$$;

drop trigger if exists
  on_auth_user_created
on auth.users;

create trigger
  on_auth_user_created
after insert
on auth.users
for each row
execute procedure
  public.handle_new_user();
