function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Identidad del Manual de Marca Prebel: Azul Prebel, Gris Prebel, tinte de Blanco Prebel y barra de color.
const BAR = `<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${['#5E8AB4', '#6FA287', '#8DC8E8', '#5C7F71', '#FF8674']
  .map((c) => `<td style="height:6px;background:${c};font-size:0;line-height:0">&nbsp;</td>`)
  .join('')}</tr></table></td></tr>`;

const shell = (inner: string, companyName = '') => `<!doctype html><html lang="es"><body style="margin:0;background:#F4F2EF;font-family:'Work Sans',Roboto,Arial,Helvetica,sans-serif;color:#55606B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EF;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:6px;overflow:hidden">
${BAR}
<tr><td style="background:#40637D;padding:18px 28px;color:#E3DED8;font-size:18px;font-weight:bold">${esc(companyName) || 'FirmaQR'}<span style="float:right;font-size:13px;font-weight:normal;color:#E3DED8">Firma<span style="color:#8DC8E8">QR</span></span></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6;color:#55606B">${inner}</td></tr>
<tr><td style="padding:16px 28px;background:#F4F2EF;color:#55606B;font-size:12px">Este es un mensaje automático de la plataforma FirmaQR. Por favor no responda a este correo.</td></tr>
${BAR}
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
  const html = shell(`<p>Estimado(a) <strong style="color:#40637D">${esc(p.participantName)}</strong>:</p>
<p>Gracias por participar en nuestro evento <strong>${esc(p.eventName)}</strong>.</p>
<p>Adjuntamos su comprobante electrónico de asistencia generado mediante la plataforma FirmaQR.</p>
<p>El documento contiene los datos del evento, la información de registro y la evidencia de su firma electrónica.</p>
<p>Le recomendamos conservar este documento como constancia de su participación.</p>
<p>Atentamente,</p>
<p><strong style="color:#40637D">${esc(p.companyName)}</strong><br/>Sistema FirmaQR<br/><span style="color:#55606B">Registro digital de asistencia y firma electrónica.</span></p>`, p.companyName);
  return { subject, text, html };
}

export function otpEmail(p: { code: string; eventName: string; companyName: string; minutes: number }) {
  const subject = `Código de verificación FirmaQR: ${p.code}`;
  const text = `Su código de verificación para registrar su asistencia al evento "${p.eventName}" es: ${p.code}

El código vence en ${p.minutes} minutos y es de uso personal. No lo comparta con nadie.

Si usted no solicitó este código, ignore este mensaje.

${p.companyName} - Sistema FirmaQR`;
  const html = shell(`<p>Su código de verificación para registrar su asistencia al evento <strong>${esc(p.eventName)}</strong> es:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#40637D;text-align:center;margin:24px 0">${p.code}</p>
<p>El código vence en ${p.minutes} minutos y es de uso personal. <strong>No lo comparta con nadie.</strong></p>
<p style="color:#55606B">Si usted no solicitó este código, ignore este mensaje.</p>
<p>${esc(p.companyName)} · Sistema FirmaQR</p>`, p.companyName);
  return { subject, text, html };
}
