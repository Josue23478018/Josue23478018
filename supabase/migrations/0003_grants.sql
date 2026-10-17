-- Permisos explícitos para que la API de Supabase pueda leer y escribir estas tablas
-- con la sesión del usuario. RLS sigue limitando cada fila a su dueño.
-- Es seguro ejecutarlo más de una vez.

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.borrowers, public.loans, public.payments, public.period_rates
  to authenticated;

-- Pide a la API que recargue el esquema (columnas y relaciones nuevas de la 0002).
notify pgrst, 'reload schema';
