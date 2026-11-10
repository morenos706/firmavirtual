# Guía de despliegue

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
