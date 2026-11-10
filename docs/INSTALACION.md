# Manual de instalación

## Requisitos

- Node.js 22 LTS y npm 10
- PostgreSQL 16 (o 14+)
- Un proveedor de correo transaccional (SMTP corporativo, Amazon SES, Resend o SendGrid)
- Dominio con certificado HTTPS para producción

## 1. Base de datos

```sql
CREATE USER firmaqr WITH PASSWORD 'una-clave-segura';
CREATE DATABASE firmaqr OWNER firmaqr;
```

## 2. Código y dependencias

```bash
git clone <repositorio> firmaqr && cd firmaqr
npm ci
cp .env.example .env
```

## 3. Variables de entorno

Edite `.env` (ver comentarios en `.env.example`). Genere los secretos:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY
```

```bash
openssl rand -hex 32      # HASH_PEPPER y OTP_SECRET (uno distinto para cada uno)
```

> **Importante:** `APP_ENCRYPTION_KEY` y `HASH_PEPPER` no deben cambiarse después de registrar asistentes: con otra clave no se pueden descifrar las cédulas ni detectar duplicados. Guárdelas en un gestor de secretos y respáldelas.

## 4. Migraciones y carga inicial

```bash
npx prisma migrate deploy
```

```bash
SEED_ADMIN_EMAIL=admin@suempresa.com.co SEED_ADMIN_PASSWORD='Clave-Segura-2026' SEED_COMPANY_NAME='Su Empresa S.A.S.' npm run db:seed
```

La carga inicial crea los roles, la configuración, los textos jurídicos versión 1.0 y el administrador.

## 5. Ejecución

```bash
npm run build && npm start        # aplicación en el puerto 3000
```

```bash
npm run worker                    # worker de correos (recomendado en producción)
```

## 6. Verificación

- `GET /api/health` debe responder `{"status":"ok","db":"ok"}`.
- Ingrese con el administrador, configure empresa y logo, cree un evento de prueba, actívelo y regístrese con su celular.

## Pruebas automatizadas

Cree la base de pruebas (el nombre debe terminar en `_test`):

```sql
CREATE DATABASE firmaqr_test OWNER firmaqr;
```

```bash
npm test
```

Prueba en navegador (con un servidor en marcha y `EMAIL_PROVIDER=file`):

```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```
