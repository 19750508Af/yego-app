# Yego — despliegue independiente

App de delivery "Yego" lista para publicar. Servidor en **Bun**, base de datos **Postgres** (Supabase), cliente web estático servido por el mismo servidor.

## Despliegue en Render (gratis)

1. En Render: **New → Blueprint**, elige este repositorio y dale **Apply**.
2. Configura estas 2 variables de entorno en el servicio:
   - `DATABASE_URL`: en Supabase → Settings → Database → Connection string → **Direct connection**. Reemplaza `[YOUR-PASSWORD]` por tu contraseña (o reseteala ahí mismo).
   - `ADMIN_TOKEN`: una clave larga que inventes tú (ej. generada con `openssl rand -hex 32`). Es la contraseña del panel de administración.
3. Render construye la imagen Docker, crea las tablas solas al arrancar y listo.

## Uso

- App pública: la URL del servicio (ej. `https://yego.onrender.com`)
- Panel de administración: la misma URL + `#admin` (pide la `ADMIN_TOKEN`)

## Notas

- La base de datos arranca limpia: los locales y repartidores se registran desde la app ("Ingresar mi local" / "Solicitar ser repartidor") y se aprueban en el panel admin.
- Plan gratuito de Render: el servicio se duerme tras inactividad y tarda ~1 min en despertar.
