# Yego — despliegue independiente

App de delivery "Yego" lista para publicar. Servidor en **Bun**, base de datos **Postgres** (Supabase), cliente web estático servido por el mismo servidor.

## Despliegue en Koyeb (gratis, sin tarjeta)

Koyeb es la opción recomendada: plan gratis sin pedir tarjeta y el servicio no se duerme (a diferencia de Render).

1. Crea tu cuenta en **koyeb.com** (gratis, sin tarjeta; entra con GitHub).
2. **Create App** → **GitHub** → elige el repositorio `yego-app`, rama `main`.
3. **Builder:** Dockerfile. **Instance:** Free (Nano).
4. **Puertos expuestos:** `3000` con protocolo `http`.
5. **Variables de entorno:**
   - `DATABASE_URL`: en Supabase → Settings → Database → Connection string → **Direct connection**. Reemplaza `[YOUR-PASSWORD]` por tu contraseña de la base de datos.
   - `ADMIN_TOKEN`: una clave larga que inventes tú (ej. generada con `openssl rand -hex 32`). Es la contraseña del panel de administración.
6. **Deploy**. Te dará una URL pública como `https://yego-xxxx.koyeb.app`.

## Alternativa: Render (pide tarjeta)

También funciona con el `render.yaml` incluido: en Render **New → Blueprint**, elige el repo y configura las mismas 2 variables. Ojo: Render ahora exige una tarjeta para verificar identidad (hace una autorización temporal de $1 USD, no te cobran) y el plan gratis se duerme tras 15 min de inactividad.

## Uso

- App pública: la URL del servicio
- Panel de administración: la misma URL + `#admin` (pide la `ADMIN_TOKEN`)

## Notas

- La base de datos arranca limpia: las tablas se crean solas al arrancar. Los locales y repartidores se registran desde la app ("Ingresar mi local" / "Solicitar ser repartidor") y se aprueban en el panel admin.
- El servidor escucha en el puerto de la variable `PORT` (por defecto 3000).
