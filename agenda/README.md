# Agenda Familiar

Agenda compartida de la familia: una página sola (`index.html`), sin cuentas. Cualquiera que tenga el enlace puede ver, agregar, cambiar o borrar.

- **Semana:** los 7 días con lo de cada quien. Filtro por persona, desliza a los lados para cambiar de semana.
- **Año:** los 12 meses; los puntos de color marcan días con algo agendado. Toca un día para ir a esa semana.
- **Cambios:** todo lo que se agrega, cambia o borra, con el nombre de quien lo hizo. Lo borrado se puede restaurar.
- **Familia:** personas con su color e ícono.
- Se actualiza sola cuando otra persona hace un cambio (Supabase Realtime).

## Datos

Usa el mismo proyecto de Supabase que *Mis Préstamos*, con tablas propias (`agenda_miembros`, `agenda_eventos`, `agenda_historial`). El esquema está en `supabase/0001_agenda.sql` (ya aplicado).

El historial lo escribe un trigger en la base de datos; desde la página solo se puede leer, así que no se puede borrar. Quien se identifica en "¿Quién eres?" queda como autor del cambio (se guarda en el teléfono; no es una verificación).

## Publicación

Proyecto `agenda-familiar` en Vercel, con *Root Directory* `agenda`. Es un sitio estático: no hay build ni variables de entorno. La URL y la clave *publishable* de Supabase están en `index.html` (son públicas por diseño).
