# Publicar "Mis Préstamos" en Vercel

Guía paso a paso para subir este proyecto (Next.js 15 + Supabase) a Vercel.
El proyecto ya funciona sin cambios en el código; solo hay que configurar Vercel y Supabase.

> Si ya lo tienes publicado en Netlify, puedes tener los dos a la vez. Solo recuerda agregar la URL nueva de Vercel en Supabase (paso 4).

---

## Antes de empezar

Necesitas tener a mano:

- [ ] Tu cuenta de GitHub (este repositorio).
- [ ] Tu proyecto de Supabase ya creado, con las 3 migraciones ejecutadas (`supabase/migrations/0001`, `0002`, `0003`). Si no lo has hecho, sigue la sección **1. Supabase** del `README.md`.
- [ ] De Supabase → **Project Settings → API**:
  - La **Project URL** (ejemplo: `https://abcdxyz.supabase.co`, **sin** `/rest/v1/`).
  - La **publishable key** (empieza con `sb_publishable_...`).

⚠️ **Nunca** uses la clave `service_role` o `secret`. Solo la *publishable*.

---

## Paso 1. Entrar a Vercel

1. Ve a [vercel.com](https://vercel.com).
2. **Sign Up / Log In → Continue with GitHub.**
3. Elige el plan **Hobby** (gratis).

## Paso 2. Importar el repositorio

1. En el panel, pulsa **Add New… → Project**.
2. En la lista de repositorios de GitHub, busca **`Josue23478018`** y pulsa **Import**.
   - Si no aparece: pulsa **Adjust GitHub App Permissions** y dale acceso a este repo.
3. Vercel detecta **Next.js** solo. **No cambies** *Framework Preset*, *Root Directory* ni *Build Command*.

## Paso 3. Variables de entorno

Antes de pulsar Deploy, abre **Environment Variables** y agrega estas 3 (el nombre tiene que ser exactamente igual):

| Nombre | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Tu Project URL, por ejemplo `https://abcdxyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Tu clave `sb_publishable_...` |
| `APP_TIMEZONE` | `America/Panama` |

Después pulsa **Deploy** y espera 1–3 minutos.

Al terminar, Vercel te da una URL tipo **`https://josue23478018.vercel.app`**. Cópiala.

> Si se te olvidó una variable: **Settings → Environment Variables**, agrégala y luego **Deployments → ⋯ → Redeploy**. Las variables nuevas solo se aplican después de un redeploy.

## Paso 4. Decirle a Supabase cuál es tu URL

Sin esto, el enlace de confirmación del correo te mandará a la página equivocada.

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL:** pega tu URL de Vercel, por ejemplo `https://josue23478018.vercel.app`.
3. **Redirect URLs → Add URL:** agrega
   - `https://josue23478018.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (para pruebas en tu computadora)
4. Guarda.

Cambia `josue23478018.vercel.app` por la URL que te dio Vercel si es distinta.

## Paso 5. Comprobar que todo funciona

1. Abre `https://TU-URL.vercel.app/diagnostico`.
   - Debe decir `"todo_bien": true` (o fallar solo en `sesion` si no has iniciado sesión, eso es normal).
   - Si `variables` sale en `false`: revisa los nombres y valores del Paso 3 y haz Redeploy.
   - Si una `tabla` sale en `false`: falta ejecutar alguna migración en Supabase.
2. Abre la URL principal, crea una cuenta, confirma el correo y entra.
3. Crea un préstamo de prueba para confirmar que guarda.

---

## Cómo se actualiza después

Cada vez que subas cambios (push) a la rama principal del repo, Vercel publica la nueva versión solo. No tienes que hacer nada más.

La rama que Vercel publica es la rama por defecto del repo (ahora `claude/loan-tracking-website-w435nf`). Puedes cambiarla en **Settings → Git → Production Branch**.

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Página en blanco o error 500 al entrar | Faltan variables de entorno | Paso 3 + Redeploy |
| El correo de confirmación lleva a `localhost` o a Netlify | Site URL vieja en Supabase | Paso 4 |
| "No se pudo crear la cuenta" varias veces seguidas | Límite de correos por hora de Supabase | Espera una hora o desactiva *Confirm email* en Supabase (ver README) |
| El pie de página dice "Versión local" | La versión no se tomó del commit (por ejemplo, un deploy subido a mano) | No afecta nada; con deploys desde GitHub muestra los 7 primeros caracteres del commit |

## Detalle importante

El plan **Hobby** de Vercel es para uso personal y no comercial. Para registrar tus propios préstamos está bien. Si algún día lo vendes o lo usas para un negocio, revisa los términos de Vercel o pasa al plan Pro.
