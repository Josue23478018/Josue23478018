# Mis Préstamos

Registro personal de préstamos de dinero. Cada usuario se registra con su correo y solo ve sus propios datos (Row Level Security en Supabase).

- **Stack:** Next.js 15 (App Router) + Supabase (Postgres + Auth) + Netlify.
- **Por préstamo:** persona y contacto, monto, moneda, fecha, interés simple (total o mensual), pago único o cuotas (semanal, quincenal o mensual), pagos recibidos y estado.
- **Estado calculado, no manual:** `Pagado` cuando los pagos cubren el total. `Atrasado` cuando hay una cuota vencida sin cubrir, con los pagos aplicados primero a la cuota más antigua. `Activo` en cualquier otro caso. `Cancelado` es el único estado que se marca a mano.
- **Recordatorios:** dentro de la app. El resumen muestra los atrasados y lo que vence en los próximos 7 días. No hay envío por correo ni WhatsApp todavía.

## 1. Supabase

1. **SQL Editor → New query →** pega `supabase/migrations/0001_init.sql` → **Run** (una sola vez).
2. **Authentication → URL Configuration:**
   - *Site URL:* la URL de tu sitio en Netlify, por ejemplo `https://mis-prestamos.netlify.app`.
   - *Redirect URLs:* agrega `https://mis-prestamos.netlify.app/auth/callback` y `http://localhost:3000/auth/callback`.
3. **Authentication → Sign In / Providers → Email:** déjalo activo. Con *Confirm email* activo, Supabase envía el enlace de confirmación con su propio servidor de correo, que tiene un límite bajo de envíos por hora. Si lo desactivas, la cuenta queda activa al registrarse, pero cualquiera podría registrarse con un correo ajeno.

## 2. Netlify

1. **Add new site → Import an existing project → GitHub →** elige este repositorio y la rama que quieras publicar.
2. Netlify detecta Next.js y lee `netlify.toml` (comando `npm run build`). No cambies nada en *Build settings*.
3. **Site configuration → Environment variables**, agrega:
   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` (sin `/rest/v1/`) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | tu clave `sb_publishable_...` |
   | `APP_TIMEZONE` | tu zona horaria, por ejemplo `America/Mexico_City`, `America/Bogota` o `America/Caracas` |
4. **Deploys → Trigger deploy.** Cuando termine, copia la URL del sitio y úsala en el paso 1.2 de Supabase.

La clave *publishable* puede estar en el navegador, porque la seguridad la da RLS. **Nunca** pongas la clave `service_role` / `secret` en estas variables.

## Desarrollo local

```bash
cp .env.example .env.local   # completa los valores
npm install
npm run dev                  # http://localhost:3000
npm test                     # cálculos de interés, cuotas y estados
npm run lint && npm run typecheck && npm run build
```

## Estructura

- `supabase/migrations/0001_init.sql`: tablas, RLS y la función `create_loan`.
- `lib/loans/calc.ts`: interés, calendario de cuotas y estado (funciones puras, con tests).
- `lib/loans/queries.ts`: lectura de datos (RLS filtra por usuario).
- `app/(app)/...`: resumen, préstamos y personas. `app/(auth)/...`: login y registro.
- `middleware.ts`: refresca la sesión y protege las rutas privadas.
