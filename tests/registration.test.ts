import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { acceptConsent, completeRegistration, getPublicEvent, resendOtp, startRegistration, verifyRegistrationOtp } from '@/server/registration';
import { setQrActive } from '@/server/events';
import { closeEvent } from '@/server/closing';
import { SIGNATURE, activeEvent, actorOf, lastOtpFor, makeUser, meta, registerParticipant, resetDb } from './helpers';

describe('Registro de participantes, OTP y firma', () => {
  beforeEach(resetDb);

  it('flujo completo: datos → OTP → acuerdo → datos personales → firma → evidencia', async () => {
    const org = await makeUser('ORGANIZER');
    const { event, token } = await activeEvent(org);
    const pub = await getPublicEvent(token);
    expect(pub.event.name).toBe(event.name);
    expect(pub.availability.open).toBe(true);
    expect(pub.legal.agreement?.content).toContain('Empresa de Pruebas S.A.S.');

    const r = await registerParticipant(token, 1);
    expect(r.evidenceCode).toMatch(/^FQR-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const rec = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { evidenceCode: r.evidenceCode },
      include: { attendee: true, signature: true, consents: true, otpVerifications: true },
    });
    expect(rec.status).toBe('COMPLETED');
    expect(rec.authMethod).toBe('EMAIL_OTP');
    expect(rec.signature?.imageSha256).toHaveLength(64);
    expect(rec.consents.map((c) => c.type).sort()).toEqual(['DATA_TREATMENT', 'SIGNATURE_AGREEMENT']);
    expect(rec.consents[0].version).toBe('1.0');
    expect(rec.evidenceHash).toHaveLength(64);
    // Datos sensibles cifrados en reposo
    expect(rec.attendee.documentNumberEnc).not.toContain('1000001');
    expect(decrypt(rec.attendee.documentNumberEnc)).toBe('1000001');
    const evidence = rec.evidenceJson as Record<string, any>;
    expect(evidence.authentication.method).toBe('EMAIL_OTP');
    expect(evidence.consents).toHaveLength(2);
    expect(evidence.event.id).toBe(event.id);
    const actions = (await prisma.auditLog.findMany({ where: { eventId: event.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['REGISTRATION_STARTED', 'OTP_VERIFIED', 'CONSENT_ACCEPTED', 'ATTENDANCE_SIGNED']));
  });

  it('OTP incorrecto: descuenta intentos y bloquea al quinto', async () => {
    const org = await makeUser('ORGANIZER');
    const { token } = await activeEvent(org);
    const s = await startRegistration(token, { documentNumber: '12345678', fullName: 'Ana Gómez', email: 'ana@x.co', company: 'A', management: 'B', area: 'C' }, meta);
    const good = lastOtpFor('ana@x.co');
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await expect(verifyRegistrationOtp(s.registrationToken, bad, meta)).rejects.toThrow(/incorrecto/);
    await expect(verifyRegistrationOtp(s.registrationToken, bad, meta)).rejects.toThrow(/bloqueado/);
    await expect(verifyRegistrationOtp(s.registrationToken, good, meta)).rejects.toThrow(/No hay un código vigente/);
  });

  it('OTP expirado y reenvío con espera mínima', async () => {
    const org = await makeUser('ORGANIZER');
    const { token } = await activeEvent(org);
    const s = await startRegistration(token, { documentNumber: '22222222', fullName: 'Luis Díaz', email: 'luis@x.co', company: 'A', management: 'B', area: 'C' }, meta);
    await expect(resendOtp(s.registrationToken, meta)).rejects.toThrow(/Espere/);
    await prisma.otpVerification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000), sentAt: new Date(Date.now() - 120_000) } });
    await expect(verifyRegistrationOtp(s.registrationToken, lastOtpFor('luis@x.co'), meta)).rejects.toThrow(/expiró/);
    await resendOtp(s.registrationToken, meta);
    await verifyRegistrationOtp(s.registrationToken, lastOtpFor('luis@x.co'), meta);
  });

  it('no permite firmar sin OTP ni sin aceptar el acuerdo', async () => {
    const org = await makeUser('ORGANIZER');
    const { token } = await activeEvent(org);
    const s = await startRegistration(token, { documentNumber: '33333333', fullName: 'Eva Ruiz', email: 'eva@x.co', company: 'A', management: 'B', area: 'C' }, meta);
    await expect(completeRegistration(s.registrationToken, SIGNATURE(), meta)).rejects.toThrow(/verificar/);
    const agreement = await prisma.legalText.findFirstOrThrow({ where: { type: 'SIGNATURE_AGREEMENT' } });
    await expect(acceptConsent(s.registrationToken, 'SIGNATURE_AGREEMENT', agreement.id, true, meta)).rejects.toThrow(/OTP/);
    await verifyRegistrationOtp(s.registrationToken, lastOtpFor('eva@x.co'), meta);
    await expect(completeRegistration(s.registrationToken, SIGNATURE(), meta)).rejects.toThrow(/acuerdo de firma/);
    await acceptConsent(s.registrationToken, 'SIGNATURE_AGREEMENT', agreement.id, true, meta);
    await expect(completeRegistration(s.registrationToken, SIGNATURE(), meta)).rejects.toThrow(/tratamiento de datos/);
    const data = await prisma.legalText.findFirstOrThrow({ where: { type: 'DATA_TREATMENT' } });
    await expect(acceptConsent(s.registrationToken, 'DATA_TREATMENT', data.id, false, meta)).rejects.toThrow(/aceptar expresamente/);
    await acceptConsent(s.registrationToken, 'DATA_TREATMENT', data.id, true, meta);
    await expect(completeRegistration(s.registrationToken, { ...SIGNATURE(), pointCount: 3 }, meta)).rejects.toThrow(/vacía/);
    await expect(completeRegistration(s.registrationToken, { ...SIGNATURE(), imageDataUrl: 'data:image/png;base64,AAAA' }, meta)).rejects.toThrow(/PNG/);
    const ok = await completeRegistration(s.registrationToken, SIGNATURE(), meta);
    expect(ok.evidenceCode).toBeTruthy();
    await expect(completeRegistration(s.registrationToken, SIGNATURE(), meta)).rejects.toThrow();
  });

  it('prevención de duplicados por identificación (y por correo según la regla del evento)', async () => {
    const org = await makeUser('ORGANIZER');
    const { token } = await activeEvent(org);
    await registerParticipant(token, 7);
    await expect(registerParticipant(token, 7, { email: 'otro@x.co' })).rejects.toThrow(/Ya existe un registro/);
    await expect(registerParticipant(token, 7, { documentNumber: '1.000.007' })).rejects.toThrow(/Ya existe/); // normalización
    // Un registro iniciado y abandonado puede reanudarse sin crear duplicados
    await startRegistration(token, { documentNumber: '5555555', fullName: 'Pedro Paz', email: 'pp@x.co', company: 'A', management: 'B', area: 'C' }, meta);
    await prisma.otpVerification.updateMany({ data: { sentAt: new Date(Date.now() - 120_000) } });
    await registerParticipant(token, 0, { documentNumber: '5555555', email: 'pp2@x.co' });
    expect(await prisma.attendanceRecord.count({ where: { documentNumberHash: { not: '' } } })).toBe(2);

    const { token: t2 } = await activeEvent(org, { duplicateRule: 'DOCUMENT_AND_EMAIL' });
    await registerParticipant(t2, 1, { email: 'mismo@x.co' });
    await expect(registerParticipant(t2, 2, { email: 'mismo@x.co' })).rejects.toThrow(/correo/);
  });

  it('valida datos de entrada (correo inválido, campos obligatorios configurables)', async () => {
    const org = await makeUser('ORGANIZER');
    const { token } = await activeEvent(org);
    await expect(startRegistration(token, { documentNumber: '123456', fullName: 'Ana', email: 'no-es-correo', company: 'a', management: 'b', area: 'c' }, meta)).rejects.toThrow();
    await expect(startRegistration(token, { documentNumber: '123456', fullName: 'Ana María', email: 'a@b.co' }, meta)).rejects.toThrow(/obligatorios/);
    await expect(startRegistration(token, { documentNumber: '123456', fullName: '<script>', email: 'a@b.co', company: 'a', management: 'b', area: 'c' }, meta)).rejects.toThrow();
    const { token: t2 } = await activeEvent(org, {
      fields: [
        { key: 'company', label: 'Empresa', enabled: false, required: false, order: 3 },
        { key: 'management', label: 'Gerencia', enabled: false, required: false, order: 4 },
        { key: 'area', label: 'Área', enabled: true, required: false, order: 5 },
      ],
    });
    const pub = await getPublicEvent(t2);
    expect(pub.fields.map((f) => f.key)).not.toContain('company');
    const s = await startRegistration(t2, { documentNumber: '987654', fullName: 'Ana María', email: 'a@b.co' }, meta);
    expect(s.registrationToken).toBeTruthy();
  });

  it('celular: el campo aparece y es obligatorio con OTP por SMS, y acepta guiones/espacios/paréntesis', async () => {
    const org = await makeUser('ORGANIZER');
    // El formulario envía el celular desactivado aunque el canal sea SMS (caso reportado)
    const { token } = await activeEvent(org, {
      otpChannel: 'SMS',
      fields: [{ key: 'phone', label: 'Número de celular', enabled: false, required: false, order: 7 }],
    });
    const pub = await getPublicEvent(token);
    expect(pub.fields.find((f) => f.key === 'phone')).toMatchObject({ required: true });
    const s = await startRegistration(token, { documentNumber: '7777777', fullName: 'Rosa Gil', email: 'r@x.co', company: 'a', management: 'b', area: 'c', phone: '(300) 123-4567' }, meta);
    expect(s.otp.channel).toBe('SMS');
    // Con correo como canal y celular opcional habilitado
    const { token: t2 } = await activeEvent(org, { fields: [{ key: 'phone', label: 'Celular', enabled: true, required: false, order: 7 }] });
    expect((await getPublicEvent(t2)).fields.map((f) => f.key)).toContain('phone');
    await expect(startRegistration(t2, { documentNumber: '8888881', fullName: 'Rosa Gil', email: 'r2@x.co', company: 'a', management: 'b', area: 'c', phone: '300 12' }, meta)).rejects.toThrow();
    const ok = await startRegistration(t2, { documentNumber: '8888882', fullName: 'Rosa Gil', email: 'r3@x.co', company: 'a', management: 'b', area: 'c', phone: '+57 300 123 4567' }, meta);
    expect(ok.otp.channel).toBe('EMAIL');
  });

  it('OTP por SMS cuando el evento lo exige', async () => {
    const { smsOutbox } = await import('@/server/sms');
    const org = await makeUser('ORGANIZER');
    const { token } = await activeEvent(org, { otpChannel: 'SMS' });
    await expect(startRegistration(token, { documentNumber: '4444444', fullName: 'Sara Mesa', email: 's@x.co', company: 'a', management: 'b', area: 'c' }, meta)).rejects.toThrow(/obligatorios/);
    const s = await startRegistration(token, { documentNumber: '4444444', fullName: 'Sara Mesa', email: 's@x.co', company: 'a', management: 'b', area: 'c', phone: '3001234567' }, meta);
    expect(s.otp.channel).toBe('SMS');
    const sms = smsOutbox.at(-1)!;
    expect(sms.to).toBe('+573001234567');
    await verifyRegistrationOtp(s.registrationToken, /(\d{6})/.exec(sms.body)![1], meta);
    const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { eventId: (await prisma.eventQr.findUniqueOrThrow({ where: { token } })).eventId } });
    expect(rec.authMethod).toBe('SMS_OTP');
  });

  it('rechaza registros con QR desactivado y posteriores al cierre (también a nivel de base de datos)', async () => {
    const org = await makeUser('ORGANIZER');
    const { event, token } = await activeEvent(org);
    await setQrActive(org, event.id, false, actorOf(org));
    await expect(registerParticipant(token, 1)).rejects.toThrow(/desactivado/);
    await setQrActive(org, event.id, true, actorOf(org));
    await registerParticipant(token, 1);
    // registro en curso al momento del cierre
    const pending = await startRegistration(token, { documentNumber: '8888888', fullName: 'Tardío Ríos', email: 't@x.co', company: 'a', management: 'b', area: 'c' }, meta);
    await closeEvent(org, event.id, actorOf(org));
    await expect(registerParticipant(token, 2)).rejects.toThrow(/finalizó/);
    await expect(verifyRegistrationOtp(pending.registrationToken, lastOtpFor('t@x.co'), meta)).rejects.toThrow(/no admite/);
    // Trigger de base de datos: aunque se omita la aplicación, no se aceptan nuevos registros
    await expect(
      prisma.attendanceRecord.update({ where: { registrationTokenHash: (await prisma.attendanceRecord.findFirstOrThrow({ where: { status: 'STARTED' } })).registrationTokenHash }, data: { status: 'COMPLETED' } }),
    ).rejects.toThrow(/FIRMAQR_EVENT_CLOSED/);
  });
});
