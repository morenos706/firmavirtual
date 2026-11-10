# Informe de desarrollo por fases — FirmaQR

Fecha: 10/11/2026 · Rama: `claude/happy-goodall-3wplzq`

## Resumen de verificación

| Verificación | Resultado |
|---|---|
| Pruebas automatizadas (`npm test`) | **32/32 aprobadas** (5 archivos) |
| Prueba de extremo a extremo en Chromium (`npm run test:e2e`) | **Aprobada** (login → evento → QR → 2 registros desde celular emulado con firma dibujada → cierre → correos → bloqueo posterior → verificación) |
| TypeScript (`tsc --noEmit`) | Sin errores |
| Compilación de producción (`next build`) | Correcta |
| Comparación visual de la planilla con el documento de referencia | Coincide distribución, medidas y textos (ver `docs/muestras/`) |

## FASE 1 — Arquitectura y estructura
- **Funcionalidades**: proyecto Next.js 15 + TypeScript + Tailwind; Prisma/PostgreSQL con 17 tablas, relaciones, índices, restricciones y *triggers* de integridad; configuración por variables de entorno.
- **Archivos**: `package.json`, `tsconfig.json`, `next.config.mjs`, `prisma/schema.prisma`, `prisma/migrations/*`, `src/lib/{env,db,crypto,errors,storage,format}.ts`.
- **Pruebas**: migraciones aplicadas en BD de desarrollo y de pruebas; triggers verificados en `closing-email.test.ts` y `verification-audit.test.ts`.

## FASE 2 — Diseño visual y dashboard
- **Funcionalidades**: identidad (#176B52, #172C3C, #F2F5F4, #FFFFFF), menú lateral responsive, tarjetas estadísticas, tablas, modales, notificaciones; dashboard con datos reales (eventos por estado, asistentes, firmas, correos enviados/pendientes/fallidos, actividad reciente) y botón CREAR NUEVO EVENTO.
- **Archivos**: `src/components/{ui,toast,app-shell}.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/server/dashboard.ts`.
- **Pruebas**: E2E (captura `docs/capturas/01-dashboard.png`).

## FASE 3 — Usuarios y autenticación
- **Funcionalidades**: roles ADMIN/ORGANIZADOR; bcrypt (12 rondas); bloqueo 15 min tras 5 intentos; sesiones en BD (hash del token, cookie HttpOnly/SameSite, expiración deslizante); gestión de usuarios (crear, editar, rol, activar, restablecer contraseña, invalidación de sesiones); protección de no dejar la plataforma sin administrador.
- **Archivos**: `src/lib/auth.ts`, `src/server/users.ts`, `src/app/api/auth/*`, `src/app/api/users/*`, `src/app/login`, `src/app/(app)/usuarios`.
- **Pruebas**: `api.test.ts` (login, bloqueo, cookie, 401/403, permisos por rol y por propietario del evento).

## FASE 4 — Eventos y generación QR
- **Funcionalidades**: todos los campos solicitados; campos del formulario configurables; estados con transiciones controladas; código EV-AAAA-NNNNN; QR con token aleatorio sin datos personales; descarga PNG/PDF (cartel), impresión, activar/desactivar, regenerar.
- **Archivos**: `src/server/events.ts`, `src/server/documents/qr.ts`, `src/components/event-form.tsx`, `src/app/(app)/eventos/**`, `src/app/api/events/**`.
- **Pruebas**: `api.test.ts` (QR PNG/PDF, activación, registro bloqueado en borrador y con QR inactivo).

## FASE 5 — Registro y firma
- **Funcionalidades**: formulario público móvil en 5 pasos; OTP por correo o SMS (HMAC, 10 min, 5 intentos, espera de 60 s, máximo 5 envíos/hora por destino); acuerdo de firma y autorización de datos versionados con SHA-256; firma con dedo/lápiz/mouse (borrar, deshacer, repetir, confirmar, alta resolución, recorte); paquete de evidencia con huella SHA-256; control de duplicados (cédula normalizada; opcionalmente correo); cifrado AES-256-GCM de cédula y celular.
- **Archivos**: `src/server/{registration,otp,sms}.ts`, `src/components/signature-pad.tsx`, `src/app/r/[token]/page.tsx`, `src/app/api/public/**`, `src/lib/legal-defaults.ts`.
- **Pruebas**: `registration.test.ts` (8 casos: flujo completo, OTP incorrecto/bloqueo, expiración/reenvío, orden obligatorio de pasos, duplicados, validación, SMS, cierre/QR inactivo) + E2E en celular emulado.

## FASE 6 — Planilla institucional
- **Funcionalidades**: reproducción fiel del formato 11020001F-01 V0.6 (medidas extraídas del .doc); 25 filas en página 1 y 32 en las siguientes; encabezados repetidos; numeración consecutiva; sin truncar ni dividir filas; filas sobrantes anuladas; vista previa y versión definitiva; PDF, Excel e impresión; **columna «Firma» con la imagen de la firma** (solicitud de la empresa, configurable).
- **Archivos**: `src/server/documents/{sheet-pdf,pdf-common,excel,service}.ts`, `assets/fonts/*`, `docs/FORMATO_INSTITUCIONAL.md`.
- **Pruebas**: `sheet.test.ts` (12 casos: 1, 25, 26, 57, 58 y 120 asistentes; distribución exacta 1–25/26–57; nombres largos; contenido del PDF; con/sin columna Firma).

## FASE 7 — Comprobantes individuales
- **Funcionalidades**: PDF con logo, empresa, título, datos del participante y del evento, hora de registro, firma, identificador único, método de autenticación, versiones aceptadas, huellas SHA-256 y QR de verificación.
- **Archivos**: `src/server/documents/receipt-pdf.ts`.
- **Pruebas**: `sheet.test.ts` (campos del comprobante); `closing-email.test.ts` (cada participante recibe solo su comprobante: SHA-256 del adjunto = documento conservado).

## FASE 8 — Cierre de eventos y correos automáticos
- **Funcionalidades**: advertencia previa; cierre idempotente (FINALIZADO, bloqueo de registros y QR, consolidación y numeración, verificación de firmas, planilla, Excel, comprobantes, huellas, informe PDF/Excel, encolado); reanudación sin duplicados; cola en PostgreSQL con reintentos exponenciales, control de duplicados, registro de errores, reenvío manual e historial; estados Pendiente / Reintentando / Enviado al proveedor / Entregado (solo con webhook) / Rechazado / Fallido; proveedores SMTP, SES, Resend, SendGrid; panel COMPROBANTES ENVIADOS; informe de cierre.
- **Archivos**: `src/server/closing.ts`, `src/server/email/{providers,queue,templates}.ts`, `scripts/worker.ts`, `src/app/api/webhooks/email`.
- **Pruebas**: `closing-email.test.ts` (5 casos: cierre completo, idempotencia, correo inválido, error del proveedor transitorio/permanente, agotamiento de reintentos, reenvío, webhook de entrega, inmutabilidad).

## FASE 9 — Auditoría y seguridad
- **Funcionalidades**: bitácora encadenada por SHA-256 con verificación; triggers que impiden modificar auditoría, firmas, consentimientos, documentos definitivos, evidencia firmada y campos de eventos cerrados; CSRF (cabecera + origen + SameSite); CSP, HSTS, X-Frame-Options; rate limiting; archivos privados con descarga autorizada y auditada; verificación pública sin datos sensibles; copias de seguridad.
- **Archivos**: `src/lib/{audit,http,rate-limit,permissions}.ts`, `src/server/verification.ts`, `src/app/verificar/**`, `src/app/(app)/auditoria`, `scripts/backup.sh`.
- **Pruebas**: `verification-audit.test.ts` (integridad, alteración detectada, comparación de huellas, cadena de auditoría rota detectada); `api.test.ts` (CSRF, webhook con secreto).

## FASE 10 — Pruebas y despliegue
- **Entregables**: `Dockerfile`, `docker-compose.yml` (app + worker + PostgreSQL), `.env.example`, `README.md`, manuales de instalación, administración y despliegue, muestras PDF, capturas.
- **Pruebas**: suite completa + E2E en navegador.

## Errores / pendientes conocidos (no marcados como terminados)
1. **Proveedores reales de correo y SMS**: las integraciones SMTP/SES/Resend/SendGrid/Twilio están implementadas pero solo se probaron con proveedores simulados (no hay credenciales en este entorno). Configure `EMAIL_*`/`SMTP_*` y valide con un evento piloto.
2. **Firma del webhook**: se autentica con secreto compartido; la verificación criptográfica nativa de cada proveedor (Svix/Resend, firma ECDSA de SendGrid) es una mejora recomendada.
3. **Rate limiting en memoria**: suficiente para una instancia; para varias instancias usar Redis u otro almacén compartido.
4. **Almacenamiento local**: para alta disponibilidad, migrar `src/lib/storage.ts` a S3/Azure Blob con cifrado en reposo.
5. **Dependencias**: `npm audit` reporta avisos en dependencias transitivas de herramientas (Prisma CLI → deepmerge-ts, PostCSS interno de Next.js, uuid de ExcelJS) sin corrección compatible publicada; nodemailer y zod se actualizaron a versiones sin avisos.
6. **Textos jurídicos**: base de trabajo; requieren revisión de un abogado colombiano.
7. **Tipografía Acid Grotesk**: es de licencia comercial y no se incluye; se usan Work Sans (web) y Arial/Liberation Sans (PDF), ambas autorizadas por el manual como complementaria y sustituta.
8. **Anulación de registros firmados**: la base de datos admite la anulación justificada, pero aún no existe una pantalla para hacerlo.
9. **Pruebas E2E**: usan el Playwright preinstalado del entorno; en otra máquina instale `playwright` y Chromium.

## Ajustes posteriores solicitados

- **Columna «Firma»** en la planilla oficial con la imagen de la firma de cada asistente (configurable).
- **Manual de Marca Prebel** aplicado: paleta corporativa y secundaria, barra de color, logotipo oficial (versiones azul y blanco), Work Sans/Arial. Ver `docs/IDENTIDAD_VISUAL.md`.
- **Salvedad jurídica sobre el uso de la firma electrónica** al final de cada planilla, con remisión en cada pie de página; texto configurable. Ver `docs/FORMATO_INSTITUCIONAL.md`.
- Pruebas: 32/32 automatizadas (las de planilla verifican la presencia y ubicación de la salvedad) y E2E en navegador aprobada.
