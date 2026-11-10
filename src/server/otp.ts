import type { AttendanceRecord, Attendee, Event, OtpChannel } from '@prisma/client';
import { prisma } from '@/lib/db';
import { blindIndex, decrypt, hmac, randomOtp, timingSafeEqualHex } from '@/lib/crypto';
import { env } from '@/lib/env';
import { Errors } from '@/lib/errors';
import { maskEmail, maskPhone } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { getEmailProvider } from './email/providers';
import { otpEmail } from './email/templates';
import { sendSms, toE164 } from './sms';

export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_S = 60;
export const OTP_MAX_SENDS_PER_HOUR = 5;

function codeHash(recordId: string, code: string) {
  return hmac(env.otpSecret, `${recordId}:${code}`);
}

export async function issueOtp(
  record: AttendanceRecord & { attendee: Attendee },
  event: Event,
  ip: string | null,
): Promise<{ channel: OtpChannel; destinationMasked: string; expiresAt: Date; devCode?: string }> {
  const channel: OtpChannel = event.otpChannel === 'SMS' && record.attendee.phoneEnc ? 'SMS' : 'EMAIL';
  const destination = channel === 'SMS' ? toE164(decrypt(record.attendee.phoneEnc!)) : record.attendee.emailNormalized;
  const destinationHash = blindIndex(`otp:${destination}`);
  const destinationMasked = channel === 'SMS' ? maskPhone(destination) : maskEmail(destination);

  const last = await prisma.otpVerification.findFirst({ where: { attendanceRecordId: record.id }, orderBy: { createdAt: 'desc' } });
  if (last && Date.now() - last.sentAt.getTime() < OTP_RESEND_COOLDOWN_S * 1000)
    throw Errors.tooMany(`Espere ${OTP_RESEND_COOLDOWN_S} segundos antes de solicitar un nuevo código.`);
  const sentLastHour = await prisma.otpVerification.count({
    where: { destinationHash, createdAt: { gt: new Date(Date.now() - 3600_000) } },
  });
  if (sentLastHour >= OTP_MAX_SENDS_PER_HOUR) throw Errors.tooMany('Se alcanzó el máximo de códigos enviados a este destino. Intente en una hora.');

  const code = randomOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);
  await prisma.otpVerification.updateMany({ where: { attendanceRecordId: record.id, status: 'PENDING' }, data: { status: 'SUPERSEDED' } });
  const otp = await prisma.otpVerification.create({
    data: {
      attendanceRecordId: record.id,
      channel,
      destinationMasked,
      destinationHash,
      codeHash: codeHash(record.id, code),
      expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
      ip,
    },
  });

  const settings = await getSettings();
  try {
    let result: { provider: string; messageId: string };
    if (channel === 'SMS') {
      result = await sendSms(destination, `FirmaQR: su código de verificación es ${code}. Vence en ${OTP_TTL_MIN} min. No lo comparta.`);
    } else {
      const tpl = otpEmail({ code, eventName: event.name, companyName: settings.companyName, minutes: OTP_TTL_MIN });
      result = await getEmailProvider().send({ to: destination, ...tpl, idempotencyKey: `OTP:${otp.id}` });
    }
    await prisma.otpVerification.update({ where: { id: otp.id }, data: { providerMessageId: result.messageId } });
    await prisma.notificationLog.create({
      data: { channel, kind: 'OTP', recipientMasked: destinationMasked, status: 'SENT_TO_PROVIDER', provider: result.provider, providerMessageId: result.messageId },
    });
  } catch (e) {
    await prisma.otpVerification.update({ where: { id: otp.id }, data: { status: 'BLOCKED' } });
    await prisma.notificationLog.create({
      data: { channel, kind: 'OTP', recipientMasked: destinationMasked, status: 'FAILED', error: (e as Error).message.slice(0, 500) },
    });
    throw Errors.badRequest('No fue posible enviar el código de verificación. Verifique sus datos o intente más tarde.');
  }

  const devCode = !env.isProduction && process.env.OTP_DEV_ECHO === 'true' ? code : undefined;
  return { channel, destinationMasked, expiresAt, devCode };
}

export async function checkOtp(recordId: string, code: string) {
  const otp = await prisma.otpVerification.findFirst({
    where: { attendanceRecordId: recordId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw Errors.badRequest('No hay un código vigente. Solicite uno nuevo.');
  if (otp.expiresAt < new Date()) {
    await prisma.otpVerification.update({ where: { id: otp.id }, data: { status: 'EXPIRED' } });
    throw Errors.badRequest('El código expiró. Solicite uno nuevo.');
  }
  const ok = /^\d{6}$/.test(code) && timingSafeEqualHex(codeHash(recordId, code), otp.codeHash);
  if (!ok) {
    const attempts = otp.attempts + 1;
    const blocked = attempts >= otp.maxAttempts;
    await prisma.otpVerification.update({ where: { id: otp.id }, data: { attempts, status: blocked ? 'BLOCKED' : 'PENDING' } });
    throw Errors.badRequest(
      blocked ? 'Código bloqueado por exceso de intentos. Solicite uno nuevo.' : `Código incorrecto. Le quedan ${otp.maxAttempts - attempts} intentos.`,
    );
  }
  return prisma.otpVerification.update({ where: { id: otp.id }, data: { status: 'VERIFIED', verifiedAt: new Date(), attempts: otp.attempts + 1 } });
}
