# Mis Préstamos

Registro personal de préstamos de dinero. Cada usuario se registra con su correo y solo ve sus propios datos (Row Level Security en Supabase).

- **Stack:** Next.js 15 (App Router) + Supabase (Postgres + Auth) + Vercel.
- **Por préstamo:** persona y contacto, monto, moneda, fecha, periodo (semanal, quincenal o mensual), tasa por periodo, fecha límite opcional, abonos y estado.
- **Recordatorios:** dentro de la app. El resumen muestra los atrasados y lo que vence en los próximos 7 días. No hay envío por correo ni WhatsApp todavía.

## Reglas de cálculo

1. El préstamo se divide en periodos contados desde la fecha del préstamo. Por ejemplo, si es quincenal y empezó el 1 de enero, los cortes son el 15 de enero, el 29 de enero, etc.
2. Al **empezar** cada periodo se cobra **interés = tasa del periodo × capital pendiente**, y vence al terminar el periodo (fecha de corte). El interés que no se paga queda como **interés pendiente**: no se suma al capital ni genera más interés (no hay interés sobre interés).
3. Después de registrar cada abono, la app pregunta qué porcentaje se usará en el periodo siguiente (sugiere la tasa actual). Si no se cambia, el periodo usa la tasa por defecto del préstamo.
4. Cada abono se aplica **primero al interés pendiente** y lo que sobra **al principal**. Ejemplo: préstamo de 200 al 20%, abono de 50 dentro de la quincena → 40 a interés y 10 a capital (queda 190). Un abono hecho el día del corte pertenece al periodo que vence ese día.
5. Estados calculados: `Pagado` (saldo 0, ya no genera interés), `Atrasado` (interés de un periodo ya vencido sin pagar, o fecha límite vencida con saldo), `Activo`, y `Cancelado` (manual, deja de generar interés desde ese día).

El cálculo está en `lib/loans/calc.ts`. Los saldos no se guardan: se derivan de principal + tasas + abonos, así que corregir una tasa o borrar un abono recalcula todo de forma consistente.

## 1. Supabase

1. **SQL Editor → New query →** pega y ejecuta **en orden** cada archivo de `supabase/migrations/` que aún no hayas ejecutado (`0001_init.sql`, `0002_compound_interest.sql`, luego `0003_grants.sql`). Cada uno se ejecuta una sola vez.
2. **Authentication → URL Configuration:**
   - *Site URL:* la URL de tu sitio en Vercel, por ejemplo `https://mis-prestamos.vercel.app`.
   - *Redirect URLs:* agrega `https://mis-prestamos.vercel.app/auth/callback` y `http://localhost:3000/auth/callback`.
3. **Authentication → Sign In / Providers → Email:** déjalo activo. Con *Confirm email* activo, Supabase envía el enlace de confirmación con su propio servidor de correo, que tiene un límite bajo de envíos por hora. Si lo desactivas, la cuenta queda activa al registrarse, pero cualquiera podría registrarse con un correo ajeno.

## 2. Vercel

1. En vercel.com → **Add New… → Project → Import** el repositorio de GitHub. En **Production Branch** (Settings → Git) usa la rama que quieras publicar.
2. Vercel detecta Next.js solo; no cambies *Build & Output Settings*.
3. **Settings → Environment Variables** (marca Production, Preview y Development):
   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` (sin `/rest/v1/`) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | tu clave `sb_publishable_...` |
   | `APP_TIMEZONE` | tu zona horaria IANA, por ejemplo `America/Panama` (si falta o es inválida se usa `America/Panama`) |
4. **Deploy.** Copia el dominio (`https://tu-proyecto.vercel.app`) y úsalo en el paso 1.2 de Supabase. El pie de cada pantalla muestra la versión publicada (los 7 primeros caracteres del commit).

La clave *publishable* puede estar en el navegador, porque la seguridad la da RLS. **Nunca** pongas la clave `service_role` / `secret` en estas variables.

## Desarrollo local

```bash
cp .env.example .env.local   # completa los valores
npm install
npm run dev                  # http://localhost:3000
npm test                     # cálculos de interés, abonos y estados
npm run lint && npm run typecheck && npm run build
```

## Estructura

- `supabase/migrations/`: tablas y RLS (`0002` cambia a interés por periodo con tasa editable y agrega `period_rates`).
- `lib/loans/calc.ts`: interés por periodo, aplicación de abonos y estado (funciones puras, con tests).
- `lib/loans/queries.ts`: lectura de datos (RLS filtra por usuario).
- `app/(app)/...`: resumen, préstamos y personas. `app/(auth)/...`: login y registro.
- `middleware.ts`: refresca la sesión y protege las rutas privadas.
