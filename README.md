# Yego — despliegue independiente

App de delivery "Yego" lista para publicar. API serverless en **Vercel** (plan Hobby gratis, sin tarjeta), base de datos **Postgres** (Supabase) y cliente web estático.

## Despliegue en Vercel (gratis, sin tarjeta)

1. Crea tu cuenta en **vercel.com** (gratis, sin tarjeta; entra con GitHub).
2. **Add New… → Project** → **Import** el repositorio `yego-app`.
3. Deja el **Build Command** vacío (el cliente ya va compilado en el repo, en `public/`; la API vive en `api/`).
4. En **Environment Variables** agrega:
   - `DATABASE_URL`: en Supabase → Project Settings → Database → Connection string → **Transaction pooler** (puerto 6543, no la conexión directa). Reemplaza `[YOUR-PASSWORD]` por tu contraseña de la base de datos.
   - `ADMIN_TOKEN`: la clave del panel de administración (la que ya tienes; si la pierdes, genera otra con `openssl rand -hex 32`).
5. **Deploy**. Te dará una URL pública como `https://yego-app.vercel.app`.

## Uso

- App pública: la URL del proyecto
- Panel de administración: la misma URL + `#admin` (pide la `ADMIN_TOKEN`)

## Notas

- El plan Hobby de Vercel es para proyectos personales no comerciales: como Yego es gratis y no genera ingresos, encaja. Si algún día les cobras a los locales, habría que pasar al plan Pro ($20/mes).
- La base de datos arranca limpia: las tablas se crean solas con la primera petición. Los locales y repartidores se registran desde la app ("Ingresar mi local" / "Solicitar ser repartidor") y se aprueban en el panel admin.
- Alternativas descartadas: Render exige tarjeta para verificar identidad; Koyeb (tras ser comprado por Mistral) ya no ofrece plan gratis a usuarios nuevos. El `render.yaml` y el `Dockerfile` quedan en el repo por si algún día quieres usarlos en otro host con Docker.
