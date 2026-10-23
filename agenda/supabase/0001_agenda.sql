-- Agenda familiar: acceso abierto (sin cuentas). Cualquiera con el enlace puede ver y editar.
-- El historial lo escribe un trigger y nadie puede borrarlo desde la app.

create table public.agenda_miembros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 40),
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  emoji text not null default '🙂' check (length(emoji) <= 16),
  orden int not null default 0,
  autor text check (autor is null or length(autor) <= 40),
  created_at timestamptz not null default now()
);

create table public.agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  miembro_id uuid references public.agenda_miembros(id) on delete set null,
  fecha date not null,
  hora_inicio time,
  hora_fin time,
  titulo text not null check (length(trim(titulo)) between 1 and 120),
  notas text check (notas is null or length(notas) <= 2000),
  hecho boolean not null default false,
  autor text check (autor is null or length(autor) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agenda_eventos_fecha_idx on public.agenda_eventos (fecha);

create table public.agenda_historial (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id uuid not null,
  accion text not null check (accion in ('crear', 'editar', 'borrar')),
  autor text,
  antes jsonb,
  despues jsonb,
  created_at timestamptz not null default now()
);
create index agenda_historial_created_idx on public.agenda_historial (created_at desc);

create or replace function public.agenda_registrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor text;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  v_autor := coalesce(
    nullif(current_setting('agenda.autor', true), ''),
    case when tg_op = 'DELETE' then old.autor else new.autor end
  );
  insert into public.agenda_historial (tabla, registro_id, accion, autor, antes, despues)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'editar' else 'borrar' end,
    left(v_autor, 40),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.agenda_registrar() from public, anon, authenticated;

-- Borrar indicando quién lo hizo (queda en el historial).
create or replace function public.agenda_borrar(p_tabla text, p_id uuid, p_autor text)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('agenda.autor', left(coalesce(p_autor, ''), 40), true);
  if p_tabla = 'agenda_eventos' then
    delete from public.agenda_eventos where id = p_id;
  elsif p_tabla = 'agenda_miembros' then
    delete from public.agenda_miembros where id = p_id;
  else
    raise exception 'tabla no permitida';
  end if;
end;
$$;
grant execute on function public.agenda_borrar(text, uuid, text) to anon, authenticated;

create trigger agenda_eventos_historial
  before insert or update or delete on public.agenda_eventos
  for each row execute function public.agenda_registrar();
create trigger agenda_miembros_historial
  before insert or update or delete on public.agenda_miembros
  for each row execute function public.agenda_registrar();

alter table public.agenda_miembros enable row level security;
alter table public.agenda_eventos enable row level security;
alter table public.agenda_historial enable row level security;

-- Acceso abierto a propósito: es la agenda compartida de la familia.
create policy "agenda abierta" on public.agenda_miembros
  for all to anon, authenticated using (true) with check (true);
create policy "agenda abierta" on public.agenda_eventos
  for all to anon, authenticated using (true) with check (true);
-- El historial solo se lee.
create policy "historial solo lectura" on public.agenda_historial
  for select to anon, authenticated using (true);

grant select, insert, update, delete on public.agenda_miembros, public.agenda_eventos to anon, authenticated;
grant select on public.agenda_historial to anon, authenticated;

alter publication supabase_realtime add table public.agenda_miembros, public.agenda_eventos, public.agenda_historial;
