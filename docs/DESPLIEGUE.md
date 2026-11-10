# Guía de despliegue

## Opción 0 — Vercel

1. **Base de datos**: cree PostgreSQL en Vercel → Storage (Neon) o Supabase. Copie la URL *pooled* en `DATABASE_URL` y la URL *directa* (sin pooler) en `DIRECT_URL`.
2. **Almacenamiento**: Vercel no conserva archivos en disco. Cree un bucket **privado** S3 compatible (AWS S3 o Cloudflare R2) y configure `STORAGE_DRIVER=s3` y `S3_*`. No use almacenamiento con URL públicas: las firmas y comprobantes contienen datos personales.
3. **Variables** (Settings → Environment Variables): `DATABASE_URL`, `DIRECT_URL`, `APP_URL` (https://SU-PROYECTO.vercel.app), `APP_ENCRYPTION_KEY`, `HASH_PEPPER`, `OTP_SECRET`, `STORAGE_DRIVER`, `S3_*`, `EMAIL_PROVIDER` (recomendado `resend`), `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_WEBHOOK_SECRET`, `CRON_SECRET`.
4. **Despliegue**: el script `vercel-build` ejecuta `prisma migrate deploy` antes de compilar (crea las tablas y los controles de integridad).
5. **Carga inicial** (una vez, desde su computador, apuntando a la base de datos y al bucket de producción):
   `DATABASE_URL=... DIRECT_URL=... STORAGE_DRIVER=s3 S3_...=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run db:seed`
6. **Verificación**: abra `https://SU-PROYECTO.vercel.app/api/health`; debe responder `"status":"ok"`. Si no, la lista `problems` indica qué falta.
7. **Correos**: se envían al cerrar el evento con `after()`; los reintentos los procesa `/api/cron/email-queue` (en `vercel.json` una vez al día, límite del plan Hobby; en Pro cambie a `*/5 * * * *`) y también cada vez que se abre el panel de comprobantes o se pulsa *Procesar cola ahora*.
8. El cierre de eventos grandes puede tardar: `vercel.json` asigna hasta 300 s a esa función (requiere Fluid Compute o plan Pro).

## Opción A — Docker Compose (servidor propio o VM en la nube)

```bash
cp .env.example .env      # complete secretos, APP_URL https y proveedor de correo
```

```bash
POSTGRES_PASSWORD='clave-segura' docker compose up -d --build
```

```bash
docker compose exec app npm run db:seed
```

Servicios: `db` (PostgreSQL 16 con volumen), `app` (aplica migraciones al iniciar, puerto 3000 solo en localhost) y `worker` (cola de correos). Con worker dedicado puede usar `QUEUE_INLINE=false`.

### Proxy inverso HTTPS (Nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name firmaqr.suempresa.com.co;
  ssl_certificate     /etc/letsencrypt/live/firmaqr.suempresa.com.co/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/firmaqr.suempresa.com.co/privkey.pem;
  client_max_body_size 5m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
}
server { listen 80; server_name firmaqr.suempresa.com.co; return 301 https://$host$request_uri; }
```

Use `TRUST_PROXY=true` para registrar la IP real del participante en la evidencia.

## Opción B — Node.js + systemd

```bash
npm ci && npx prisma migrate deploy && npm run build
```

Cree dos servicios: `npm start` (aplicación) y `npm run worker` (correos), con `EnvironmentFile=/opt/firmaqr/.env` y `Restart=always`.

## Lista de verificación para producción

- [ ] `APP_URL` con **https** (se imprime en QR y comprobantes; no debe cambiar después).
- [ ] Secretos `APP_ENCRYPTION_KEY`, `HASH_PEPPER`, `OTP_SECRET` únicos, en gestor de secretos y respaldados.
- [ ] `NODE_ENV=production` (cookies `Secure`, sin eco de OTP).
- [ ] Dominio de envío verificado (SPF, DKIM, DMARC) en el proveedor de correo; webhook de entrega configurado con `EMAIL_WEBHOOK_SECRET`.
- [ ] `STORAGE_DIR` en volumen persistente con copias de seguridad cifradas; nunca expuesto públicamente.
- [ ] PostgreSQL con TLS, usuario con privilegios mínimos y copias diarias (`npm run db:backup`).
- [ ] Cambiar la contraseña del administrador inicial y crear usuarios nominales.
- [ ] Revisión de los textos jurídicos por un abogado colombiano y publicación de la versión aprobada.
- [ ] Verificar con un evento piloto: QR, registro móvil, cierre, correo y verificación pública.
- [ ] Para varias instancias de la app: almacén compartido para rate limiting y almacenamiento de objetos (S3) en lugar de disco local.
