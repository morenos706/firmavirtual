# Manual de administración

## Roles

| Función | Administrador | Organizador |
|---|:-:|:-:|
| Crear / editar usuarios y asignar roles | ✔ | |
| Crear eventos, programar fechas, generar QR | ✔ | ✔ |
| Editar eventos (antes del cierre) | ✔ (todos) | ✔ (propios) |
| Consultar eventos y asistentes | ✔ (todos) | ✔ (propios) |
| Descargar planilla PDF / Excel, informe de cierre | ✔ | ✔ (propios) |
| Cerrar eventos | ✔ | ✔ (propios) |
| Consultar estado de envío de comprobantes | ✔ | ✔ (propios) |
| Ver firmas y expedientes de evidencia | ✔ | |
| Descargar comprobantes (individual o ZIP) | ✔ | |
| Reenviar correos | ✔ | |
| Configuración, logo, textos jurídicos | ✔ | |
| Auditoría | ✔ | |

Todos los permisos se validan en el servidor; ocultar un botón no es el único control.

## Configuración inicial (Configuración)

1. **Empresa y formato**: nombre, NIT, código y versión del formato (por defecto 11020001F-01 / V0.6), título de la planilla y columna «Firma».
2. **Logo institucional**: PNG o JPG ≤ 1 MB. Use solo un logo cuyo uso esté autorizado.
3. **Textos jurídicos**: publique nuevas versiones del acuerdo de firma electrónica y de la autorización de tratamiento de datos. Las versiones anteriores se conservan con el número de aceptaciones; cada registro guarda la versión y la huella SHA-256 del texto que aceptó. Deben ser revisados por un abogado.

## Ciclo de vida de un evento

1. **Crear** (Borrador): datos del formato institucional, horario, canal OTP (correo o SMS), regla de duplicados y campos del formulario (etiquetas, solicitar, obligatorio).
2. **Programar** y **Activar registro**: el QR solo admite registros cuando el evento está *Activo* y el QR habilitado.
3. **Código QR**: descargar PNG/PDF, imprimir, copiar enlace, desactivar/activar o regenerar el identificador (invalida los QR impresos).
4. **Asistentes**: avance en tiempo real; el administrador puede ver la firma y el expediente de evidencia.
5. **Planilla oficial**: vista previa en vivo; PDF, Excel e impresión.
6. **Cerrar evento**: tras la advertencia, el sistema pasa a *Finalizado*, bloquea registros, consolida y numera, verifica firmas, genera y guarda planilla, Excel, comprobantes e informe con SHA-256, y encola los correos. Si el cierre se interrumpe, use **Reanudar cierre** (no genera duplicados).
7. **Comprobantes enviados**: estado de cada correo, intentos, error, historial, descarga y reenvío.
8. **Informe de cierre**: indicadores y descarga en PDF/Excel.

### Correcciones después del cierre
Solo el administrador puede corregir la **descripción** y el **lugar**, con justificación obligatoria; queda en la auditoría con el valor anterior y el nuevo. Los campos de evidencia (programa, tema, fechas, formador, etc.) están bloqueados también por la base de datos.

## Estados de correo

| Estado | Significado |
|---|---|
| Pendiente | En cola |
| Reintentando | Error transitorio; se reintentará (1, 5, 15, 60, 240 min) |
| Enviado al proveedor | El proveedor **aceptó** el mensaje (no implica recepción) |
| Entregado | El proveedor **confirmó** la entrega por webhook |
| Rechazado | Dirección inválida o rechazo permanente: no se reintenta |
| Fallido | Agotó 5 intentos |

**Correos → Procesar cola ahora** fuerza el procesamiento si no hay worker. Para confirmar entregas configure el webhook del proveedor hacia `https://SU-DOMINIO/api/webhooks/email?token=EMAIL_WEBHOOK_SECRET` (eventos *delivered* y *bounced*).

## Auditoría

Registra inicio de sesión, cambios de eventos, QR, registros, OTP, consentimientos, firmas, cierres, descargas, envíos, cambios de configuración y de usuarios, con IP y navegador. La bitácora está encadenada por hash y la base de datos impide modificarla o borrarla; **Verificar integridad** recalcula la cadena completa.

## Verificación documental pública

`https://SU-DOMINIO/verificar/<código>`: confirma existencia, identificador, vigencia e integridad del expediente, y permite comparar un PDF (la huella se calcula en el navegador) con el documento conservado. No muestra cédula, correo ni teléfono; el nombre aparece enmascarado.

## Copias de seguridad

```bash
DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=/respaldos npm run db:backup
```

Respalde **siempre juntos** la base de datos y `STORAGE_DIR`, además de los secretos del `.env`. Programe la copia diaria (cron) y pruebe la restauración periódicamente (`pg_restore` + extraer `storage.tar.gz`).
