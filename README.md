# FirmaQR

**Plataforma web de registro de asistencia, firma electrónica y gestión documental** (Colombia · español).

Los usuarios autorizados crean eventos y generan un código QR. Los participantes escanean el QR desde su celular (sin instalar aplicaciones), registran sus datos, verifican su identidad con un código OTP, aceptan el acuerdo de firma electrónica y la autorización de tratamiento de datos, y firman en la pantalla. Al cerrar el evento, FirmaQR consolida la **planilla oficial de asistencia (formato 11020001F-01 V0.6)**, genera un **comprobante PDF individual** por participante, calcula las huellas **SHA-256**, y **envía automáticamente cada comprobante por correo** mediante una cola con reintentos.

| | |
|---|---|
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS |
| Backend | Rutas API de Next.js (Node.js 22) · validación Zod · permisos por rol en cada endpoint |
| Base de datos | PostgreSQL 16 · Prisma ORM 6 · *triggers* de integridad |
| Documentos | PDFKit (planilla, comprobantes, cartel QR, informe) · ExcelJS · qrcode · JSZip |
| Firma | signature_pad (dedo, lápiz o mouse) · evidencia técnica del trazo |
| Correo | SMTP seguro / Amazon SES (SMTP) / Resend / SendGrid · cola en PostgreSQL con reintentos |
| Seguridad | bcrypt · sesiones HttpOnly · CSRF · CSP/HSTS · rate limiting · AES-256-GCM · auditoría encadenada |

## Inicio rápido (desarrollo)

```bash
npm install
cp .env.example .env        # ajuste DATABASE_URL; en desarrollo puede usar EMAIL_PROVIDER=file
npx prisma migrate deploy
npm run db:seed             # roles, textos jurídicos v1.0, configuración y administrador inicial
npm run dev                 # http://localhost:3000
```

El usuario administrador inicial se define con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (cámbielo al ingresar). Con `EMAIL_PROVIDER=file` los correos (OTP y comprobantes) se guardan en `storage/outbox/` en lugar de enviarse.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo, compilación y servidor de producción |
| `npm run worker` | Worker dedicado de la cola de correos |
| `npm run db:migrate` · `db:seed` | Migraciones (no destructivas) y carga inicial |
| `npm test` | 32 pruebas automatizadas (Vitest + PostgreSQL de pruebas `firmaqr_test`) |
| `npm run test:e2e` | Prueba de extremo a extremo en Chromium contra un servidor en ejecución |
| `npm run samples` | Regenera los PDF de muestra en `docs/muestras/` |
| `npm run db:backup` | Copia de seguridad de base de datos + documentos con SHA256SUMS |

## Documentación

- [Arquitectura y modelo de datos](docs/ARQUITECTURA.md)
- [Formato institucional de la planilla](docs/FORMATO_INSTITUCIONAL.md)
- [Manual de instalación](docs/INSTALACION.md)
- [Manual de administración](docs/ADMINISTRACION.md)
- [Guía de despliegue](docs/DESPLIEGUE.md)
- [Informe de fases, pruebas y pendientes](docs/INFORME_FASES.md)
- Muestras: [planilla 1](docs/muestras/planilla-1-asistentes.pdf) · [25](docs/muestras/planilla-25-asistentes.pdf) · [57](docs/muestras/planilla-57-asistentes.pdf) · [120](docs/muestras/planilla-120-asistentes.pdf) asistentes · [comprobante](docs/muestras/comprobante-individual.pdf)

## Aviso jurídico

FirmaQR implementa un mecanismo de **firma electrónica** (Ley 527 de 1999, Decreto 2364 de 2012 compilado en el Decreto 1074 de 2015) que conserva identificación del firmante, evidencia de autenticación OTP, manifestación de voluntad con versión del acuerdo, vinculación con el documento, integridad (SHA-256) y trazabilidad. **No es una firma digital certificada** y la imagen de la firma por sí sola no garantiza identidad ni validez jurídica. Los textos jurídicos incluidos son una base de trabajo configurable que **debe ser revisada por un abogado colombiano** antes de su uso en producción.
