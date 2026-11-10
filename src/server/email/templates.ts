function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const shell = (inner: string) => `<!doctype html><html lang="es"><body style="margin:0;background:#F2F5F4;font-family:Arial,Helvetica,sans-serif;color:#172C3C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F4;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:8px;overflow:hidden">
<tr><td style="background:#172C3C;padding:18px 28px;color:#FFFFFF;font-size:18px;font-weight:bold">Firma<span style="color:#5FC79F">QR</span></td></tr>
<tr><td style="height:4px;background:#176B52"></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${inner}</td></tr>
<tr><td style="padding:16px 28px;background:#F2F5F4;color:#5b6b77;font-size:12px">Este es un mensaje automático de la plataforma FirmaQR. Por favor no responda a este correo.</td></tr>
</table></td></tr></table></body></html>`;

/** Plantilla obligatoria del comprobante (sección 13 del requerimiento). */
export function receiptEmail(p: { participantName: string; eventName: string; companyName: string }) {
  const subject = `Comprobante de asistencia - ${p.eventName}`;
  const text = `Estimado(a) ${p.participantName}:

Gracias por participar en nuestro evento ${p.eventName}.

Adjuntamos su comprobante electrónico de asistencia generado mediante la plataforma FirmaQR.

El documento contiene los datos del evento, la información de registro y la evidencia de su firma electrónica.

Le recomendamos conservar este documento como constancia de su participación.

Atentamente,

${p.companyName}
Sistema FirmaQR
Registro digital de asistencia y firma electrónica.`;
  const html = shell(`<p>Estimado(a) <strong>${esc(p.participantName)}</strong>:</p>
<p>Gracias por participar en nuestro evento <strong>${esc(p.eventName)}</strong>.</p>
<p>Adjuntamos su comprobante electrónico de asistencia generado mediante la plataforma FirmaQR.</p>
<p>El documento contiene los datos del evento, la información de registro y la evidencia de su firma electrónica.</p>
<p>Le recomendamos conservar este documento como constancia de su participación.</p>
<p>Atentamente,</p>
<p><strong>${esc(p.companyName)}</strong><br/>Sistema FirmaQR<br/><span style="color:#5b6b77">Registro digital de asistencia y firma electrónica.</span></p>`);
  return { subject, text, html };
}

export function otpEmail(p: { code: string; eventName: string; companyName: string; minutes: number }) {
  const subject = `Código de verificación FirmaQR: ${p.code}`;
  const text = `Su código de verificación para registrar su asistencia al evento "${p.eventName}" es: ${p.code}

El código vence en ${p.minutes} minutos y es de uso personal. No lo comparta con nadie.

Si usted no solicitó este código, ignore este mensaje.

${p.companyName} - Sistema FirmaQR`;
  const html = shell(`<p>Su código de verificación para registrar su asistencia al evento <strong>${esc(p.eventName)}</strong> es:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#176B52;text-align:center;margin:24px 0">${p.code}</p>
<p>El código vence en ${p.minutes} minutos y es de uso personal. <strong>No lo comparta con nadie.</strong></p>
<p style="color:#5b6b77">Si usted no solicitó este código, ignore este mensaje.</p>
<p>${esc(p.companyName)} · Sistema FirmaQR</p>`);
  return { subject, text, html };
}
