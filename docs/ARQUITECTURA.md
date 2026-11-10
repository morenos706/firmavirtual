# Arquitectura de FirmaQR

## Vista general

```
Navegador (admin/organizador) ──HTTPS──┐
Celular del participante (QR) ──HTTPS──┤
                                       ▼
                         Next.js 15 (Node.js 22)
         ┌──────────────────────────────────────────────────┐
         │ Páginas React (App Router)                       │
         │ Rutas API /api/*  → validación Zod, CSRF, roles  │
         │ Servicios de dominio (src/server/*)              │
         │   eventos · registro/OTP/firma · documentos PDF  │
         │   cierre idempotente · cola de correos · verif.  │
         └───────┬────────────────────┬─────────────────────┘
                 │                    │
           PostgreSQL 16        Almacenamiento privado (STORAGE_DIR)
       (Prisma + triggers)     firmas PNG · PDF · XLSX · logo
                 ▲
                 │ FOR UPDATE SKIP LOCKED
          Worker de correos (npm run worker) ──► SMTP / SES / Resend / SendGrid
```

## Estructura del código

| Ruta | Contenido |
|---|---|
| `prisma/schema.prisma` | Modelo de datos (14 tablas solicitadas + sesiones, configuración y textos jurídicos) |
| `prisma/migrations/` | `init`, `integrity_controls` (triggers e índices parciales), `sheet_signature_column` |
| `src/lib/` | Configuración, Prisma, criptografía, autenticación, auditoría, permisos, validación, formato |
| `src/server/events.ts` | Creación/edición de eventos, estados, QR |
| `src/server/registration.ts` · `otp.ts` | Flujo público: datos → OTP → consentimientos → firma → evidencia |
| `src/server/documents/` | Planilla oficial, comprobante, cartel QR, Excel, informe de cierre |
| `src/server/closing.ts` | Proceso de cierre idempotente |
| `src/server/email/` | Proveedores, plantillas y cola de correos |
| `src/server/verification.ts` | Verificación documental pública |
| `src/app/api/` | 34 endpoints REST |
| `src/app/(app)/` | Panel interno (dashboard, eventos, correos, usuarios, auditoría, configuración) |
| `src/app/r/[token]` | Formulario público del QR |
| `src/app/verificar` | Verificación documental pública |
| `tests/` | Pruebas automatizadas · `scripts/e2e.ts` prueba en navegador |

## Modelo de datos

| Tabla | Propósito | Claves / restricciones relevantes |
|---|---|---|
| `roles` | ADMIN, ORGANIZER | `name` único |
| `users` | Usuarios internos (bcrypt, bloqueo por intentos) | `email` único, FK `role_id` |
| `sessions` | Sesiones (solo hash SHA-256 del token) | `token_hash` único |
| `events` | Eventos con estados DRAFT/SCHEDULED/ACTIVE/FINALIZED/CANCELLED | `code` único (EV-AAAA-NNNNN); trigger bloquea campos de evidencia tras el cierre |
| `event_fields` | Campos configurables del formulario | único (`event_id`,`key`) |
| `event_qr` | QR exclusivo, token aleatorio de 192 bits | `token` único, `event_id` único |
| `attendees` | Datos del participante; cédula y celular **cifrados AES-256-GCM** + índice ciego HMAC | trigger congela datos firmados |
| `attendance_records` | Registro de asistencia (UUID + código FQR-XXXX-XXXX-XXXX), estados, evidencia y huella | índice único parcial (evento, cédula) para registros no anulados; trigger: solo admite registros con evento ACTIVO y bloquea cambios a evidencia firmada |
| `signatures` | Imagen PNG (ruta privada), SHA-256, trazos, puntos, duración, tipo de puntero, dispositivo, IP | solo inserción (trigger) |
| `otp_verifications` | OTP (solo hash HMAC), canal, destino enmascarado, intentos, vencimiento | |
| `consent_records` | Aceptación del acuerdo / tratamiento de datos con versión y SHA-256 del texto | único (registro, tipo); solo inserción |
| `legal_texts` | Textos jurídicos versionados | único (tipo, versión) |
| `documents` | Documentos definitivos con SHA-256, código de verificación y clave de idempotencia | `idempotency_key` y `verification_code` únicos; inmutables (trigger) |
| `audit_logs` | Bitácora encadenada por hash | solo inserción (trigger); `verifyAuditChain()` detecta alteraciones |
| `email_jobs` | Cola de correos con estados, intentos, próximo intento, bloqueo | `idempotency_key` único (evita envíos duplicados) |
| `notification_logs` | Historial de cada intento/evento del proveedor (OTP y comprobantes) | |
| `app_settings` | Empresa, logo, código/versión del formato, columna Firma | fila única |

## Evidencia electrónica por registro

Al confirmar la firma se construye un **paquete de evidencia** (JSON canónico) con: identificación del registro y del evento, datos del firmante (cédula como HMAC), método/destino/fecha de autenticación OTP, consentimientos (tipo, versión, SHA-256 del texto, fecha), SHA-256 y metadatos técnicos de la firma, IP y navegador. Su SHA-256 (`evidence_hash`) se imprime en el comprobante y se verifica en el cierre y en la consulta pública.

## Decisiones técnicas (supuestos documentados)

1. **Backend integrado en Next.js** (rutas API) en lugar de un servidor separado: un solo despliegue, misma validación y tipos. Toda regla de permisos se aplica en el servidor.
2. **Cola de correos en PostgreSQL** (`email_jobs` + `FOR UPDATE SKIP LOCKED`) en lugar de Redis: menos infraestructura, transaccional con los documentos, segura con varios workers.
3. **Cédula y celular cifrados** con AES-256-GCM; búsquedas de duplicados mediante HMAC (índice ciego). El correo se guarda en claro porque es necesario para el envío.
4. **Fuente Liberation Sans** (métricamente idéntica a Arial, licencia OFL) incrustada para reproducir el formato institucional.
5. **Rate limiting en memoria** por IP; los límites críticos de OTP (cooldown, envíos por hora, intentos) se validan además contra la base de datos. Para varias instancias se recomienda un almacén compartido.
6. **Almacenamiento local privado** detrás de rutas autenticadas; la interfaz `src/lib/storage.ts` permite migrar a S3/Blob.
