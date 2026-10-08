-- Estudio Cristofaro · Fase 1
-- Base preparada para multi-estudio: todas las tablas llevan studio_id.

create extension if not exists "pgcrypto";

-- ───────────────────────── Estudios y perfiles ─────────────────────────

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create type public.user_role as enum ('admin', 'contador', 'cliente');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'contador',
  created_at timestamptz not null default now()
);

-- Helpers para RLS (security definer para evitar recursión sobre profiles)
create or replace function public.current_studio_id()
returns uuid language sql stable security definer set search_path = public as $$
  select studio_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'contador')
  )
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── Consultas (leads) ─────────────────────────

create type public.lead_status as enum ('nuevo', 'contactado', 'presupuesto', 'ganado', 'perdido');
create type public.lead_source as enum ('diagnostico', 'contacto', 'whatsapp', 'manual', 'otro');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text,
  phone text,
  company text,
  contributor_type text,          -- monotributista | responsable_inscripto | sociedad | empleador | emprendedor | otro
  activity text,
  employees text,
  needs text[] not null default '{}',
  message text,
  source public.lead_source not null default 'contacto',
  status public.lead_status not null default 'nuevo',
  assigned_to uuid references public.profiles(id) on delete set null,
  next_action text,
  next_action_at date,
  notes text,
  lost_reason text,
  client_id uuid
);
create index leads_studio_status_idx on public.leads (studio_id, status);
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ───────────────────────── Clientes ─────────────────────────

create type public.tax_regime as enum ('monotributo', 'responsable_inscripto', 'sociedad', 'exento', 'otro');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  business_name text not null,
  cuit text,
  regime public.tax_regime not null default 'otro',
  category text,                  -- categoría de monotributo, tipo societario, etc.
  services text[] not null default '{}',
  monthly_fee numeric(12,2),
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  active boolean not null default true,
  lead_id uuid references public.leads(id) on delete set null
);
create unique index clients_studio_cuit_idx on public.clients (studio_id, cuit) where cuit is not null;
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.leads
  add constraint leads_client_fk foreign key (client_id) references public.clients(id) on delete set null;

-- ───────────────────────── Contenidos ─────────────────────────

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  slug text not null,
  title text not null,
  excerpt text,
  body text not null default '',
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, slug)
);
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  question text not null,
  answer text not null,
  position int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  segment text,                   -- monotributistas | pymes-y-sociedades | empleadores | emprendedores
  price_label text,               -- ej: "Desde $45.000 / mes". Vacío = "Consultá"
  description text,
  features text[] not null default '{}',
  highlighted boolean not null default false,
  position int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Fase 2 (estructura lista, sin UI todavía) ─────────────────────────

-- Usuarios cliente con acceso al portal
create table public.client_users (
  client_id uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (client_id, profile_id)
);

-- Vencimientos por cliente (generados según terminación de CUIT y régimen)
create type public.obligation_status as enum ('pendiente', 'en_proceso', 'presentado', 'pagado', 'vencido');

create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  tax text not null,              -- IVA, IIBB, Ganancias, Monotributo, F.931, etc.
  period text not null,           -- ej: 2026-09
  due_date date not null,
  status public.obligation_status not null default 'pendiente',
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index obligations_due_idx on public.obligations (studio_id, due_date);

-- Documentos (archivos en Supabase Storage, bucket "documents")
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  storage_path text not null,
  category text,                  -- comprobantes, constancias, ddjj, recibos, otro
  period text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── RLS ─────────────────────────

alter table public.studios enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.clients enable row level security;
alter table public.posts enable row level security;
alter table public.faqs enable row level security;
alter table public.plans enable row level security;
alter table public.client_users enable row level security;
alter table public.obligations enable row level security;
alter table public.documents enable row level security;

-- Estudios: lectura pública (la web necesita resolver el estudio por slug)
create policy "studios_public_read" on public.studios for select using (true);

-- Perfiles: cada uno ve el suyo; el staff ve los de su estudio
create policy "profiles_self_read" on public.profiles for select
  using (id = auth.uid() or (public.is_staff() and studio_id = public.current_studio_id()));

-- Staff: acceso completo a los datos de su estudio
create policy "leads_staff_all" on public.leads for all
  using (public.is_staff() and studio_id = public.current_studio_id())
  with check (public.is_staff() and studio_id = public.current_studio_id());

create policy "clients_staff_all" on public.clients for all
  using (public.is_staff() and studio_id = public.current_studio_id())
  with check (public.is_staff() and studio_id = public.current_studio_id());

create policy "posts_staff_all" on public.posts for all
  using (public.is_staff() and studio_id = public.current_studio_id())
  with check (public.is_staff() and studio_id = public.current_studio_id());

create policy "faqs_staff_all" on public.faqs for all
  using (public.is_staff() and studio_id = public.current_studio_id())
  with check (public.is_staff() and studio_id = public.current_studio_id());

create policy "plans_staff_all" on public.plans for all
  using (public.is_staff() and studio_id = public.current_studio_id())
  with check (public.is_staff() and studio_id = public.current_studio_id());

create policy "obligations_staff_all" on public.obligations for all
  using (public.is_staff() and studio_id = public.current_studio_id())
  with check (public.is_staff() and studio_id = public.current_studio_id());

create policy "documents_staff_all" on public.documents for all
  using (public.is_staff() and studio_id = public.current_studio_id())
  with check (public.is_staff() and studio_id = public.current_studio_id());

create policy "client_users_staff_all" on public.client_users for all
  using (public.is_staff())
  with check (public.is_staff());

-- Contenido publicado: lectura pública
create policy "posts_public_read" on public.posts for select using (published = true);
create policy "faqs_public_read" on public.faqs for select using (published = true);
create policy "plans_public_read" on public.plans for select using (published = true);

-- Los leads de la web se insertan desde el servidor con la service role key (bypassa RLS).
