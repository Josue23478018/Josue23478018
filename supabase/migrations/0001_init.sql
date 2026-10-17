-- Esquema inicial: personas, préstamos, cuotas y pagos.
-- Cada fila pertenece a un usuario (user_id) y Row Level Security garantiza
-- que nadie pueda leer ni modificar filas de otra cuenta.

create table public.borrowers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  borrower_id uuid not null,
  principal numeric(14, 2) not null check (principal > 0),
  currency text not null default 'USD',
  start_date date not null,
  interest_rate numeric(7, 3) not null default 0 check (interest_rate >= 0),
  interest_period text not null default 'total' check (interest_period in ('total', 'monthly')),
  total_due numeric(14, 2) not null check (total_due >= principal),
  repayment_type text not null check (repayment_type in ('single', 'installments')),
  installment_frequency text check (installment_frequency in ('weekly', 'biweekly', 'monthly')),
  installment_count int check (installment_count between 1 and 360),
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  -- La persona debe pertenecer al mismo usuario que el préstamo.
  foreign key (borrower_id, user_id) references public.borrowers (id, user_id) on delete restrict,
  check (
    (repayment_type = 'single' and installment_frequency is null and installment_count is null)
    or (repayment_type = 'installments' and installment_frequency is not null and installment_count is not null)
  )
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loan_id uuid not null,
  number int not null check (number >= 1),
  due_date date not null,
  amount_due numeric(14, 2) not null check (amount_due >= 0),
  unique (loan_id, number),
  foreign key (loan_id, user_id) references public.loans (id, user_id) on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loan_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_at date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  foreign key (loan_id, user_id) references public.loans (id, user_id) on delete cascade
);

create index on public.loans (user_id);
create index on public.loans (borrower_id);
create index on public.installments (loan_id);
create index on public.payments (loan_id);

-- Row Level Security: cada usuario solo ve y modifica sus propias filas.
alter table public.borrowers enable row level security;
alter table public.loans enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;

create policy "own rows" on public.borrowers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.loans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.installments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.payments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Crea el préstamo y su calendario de cuotas en una sola transacción.
-- security invoker: corre con los permisos del usuario, así que RLS aplica.
create function public.create_loan(loan jsonb, schedule jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.loans (
    borrower_id, principal, currency, start_date, interest_rate, interest_period,
    total_due, repayment_type, installment_frequency, installment_count, notes
  ) values (
    (loan ->> 'borrower_id')::uuid,
    (loan ->> 'principal')::numeric,
    loan ->> 'currency',
    (loan ->> 'start_date')::date,
    (loan ->> 'interest_rate')::numeric,
    loan ->> 'interest_period',
    (loan ->> 'total_due')::numeric,
    loan ->> 'repayment_type',
    loan ->> 'installment_frequency',
    (loan ->> 'installment_count')::int,
    loan ->> 'notes'
  ) returning id into new_id;

  insert into public.installments (loan_id, number, due_date, amount_due)
  select new_id, (s ->> 'number')::int, (s ->> 'due_date')::date, (s ->> 'amount_due')::numeric
  from jsonb_array_elements(schedule) as s;

  return new_id;
end;
$$;

revoke execute on function public.create_loan(jsonb, jsonb) from public, anon;
grant execute on function public.create_loan(jsonb, jsonb) to authenticated;
