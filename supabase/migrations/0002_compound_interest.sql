-- Cambio a interés compuesto por periodo con tasa editable por periodo.
--
-- Antes: interés simple fijo y calendario de cuotas precalculado (tabla installments).
-- Ahora: el préstamo genera interés al cierre de cada periodo sobre el saldo pendiente;
-- la tasa de cada periodo puede ser distinta (tabla period_rates). Nada se precalcula:
-- el saldo se deriva de principal + tasas + pagos.
--
-- Los préstamos existentes se convierten: su frecuencia pasa a ser la de sus cuotas
-- (o mensual si eran de pago único), su tasa pasa a ser la tasa por periodo y su
-- última fecha de cuota pasa a ser la fecha límite.

begin;

alter table public.loans
  add column period_frequency text,
  add column due_date date;

update public.loans l
set period_frequency = coalesce(l.installment_frequency, 'monthly'),
    due_date = (select max(i.due_date) from public.installments i where i.loan_id = l.id);

alter table public.loans
  alter column period_frequency set not null,
  alter column period_frequency set default 'biweekly',
  add constraint loans_period_frequency_check check (period_frequency in ('weekly', 'biweekly', 'monthly')),
  add constraint loans_due_date_check check (due_date is null or due_date >= start_date);

alter table public.loans rename column interest_rate to default_rate;

-- Al borrar estas columnas Postgres borra también sus restricciones.
alter table public.loans
  drop column interest_period,
  drop column total_due,
  drop column repayment_type,
  drop column installment_frequency,
  drop column installment_count;

drop function public.create_loan(jsonb, jsonb);
drop table public.installments;

-- Tasa de un periodo concreto. Si un periodo no tiene fila, usa loans.default_rate.
create table public.period_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loan_id uuid not null,
  period_number int not null check (period_number >= 1),
  rate numeric(7, 3) not null check (rate >= 0 and rate <= 1000),
  unique (loan_id, period_number),
  foreign key (loan_id, user_id) references public.loans (id, user_id) on delete cascade
);

alter table public.period_rates enable row level security;

create policy "own rows" on public.period_rates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Un pago no puede ser anterior a la fecha del préstamo.
create function public.check_payment_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.paid_at < (select start_date from public.loans where id = new.loan_id) then
    raise exception 'El pago no puede ser anterior a la fecha del préstamo';
  end if;
  return new;
end;
$$;

create trigger payments_check_date
  before insert or update on public.payments
  for each row execute function public.check_payment_date();

commit;
