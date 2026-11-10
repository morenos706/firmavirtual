import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { audit, verifyAuditChain } from '@/lib/audit';
import { getFile, resolveSafe } from '@/lib/storage';
import { closeEvent } from '@/server/closing';
import { compareDocumentHash, verifyCode } from '@/server/verification';
import { activeEvent, actorOf, makeUser, registerParticipant, resetDb } from './helpers';

describe('Verificación documental pública y auditoría', () => {
  beforeEach(resetDb);

  it('verifica existencia, integridad y correspondencia sin exponer datos sensibles', async () => {
    const org = await makeUser('ORGANIZER');
    const { event, token } = await activeEvent(org);
    const r = await registerParticipant(token, 1, { fullName: 'Ana María Gómez', documentNumber: '1037654321', email: 'ana@x.co' });
    await closeEvent(org, event.id, actorOf(org));

    const v = await verifyCode(r.evidenceCode.toLowerCase());
    expect(v.found).toBe(true);
    if (!v.found) return;
    expect(v.participant).toBe('A*** M*** G***');
    expect(JSON.stringify(v)).not.toContain('1037654321');
    expect(JSON.stringify(v)).not.toContain('ana@x.co');
    expect(v.integrity).toEqual({ evidence: true, signature: true, document: true });

    const receipt = await prisma.document.findFirstOrThrow({ where: { type: 'RECEIPT' } });
    const original = await getFile(receipt.storagePath);
    expect((await compareDocumentHash(r.evidenceCode, sha256(original))).match).toBe(true);
    const tampered = Buffer.concat([original, Buffer.from('x')]);
    expect((await compareDocumentHash(r.evidenceCode, sha256(tampered))).match).toBe(false);

    const sheet = await prisma.document.findFirstOrThrow({ where: { type: 'ATTENDANCE_SHEET' } });
    const vs = await verifyCode(sheet.verificationCode);
    expect(vs.found && vs.typeLabel).toBe('Planilla oficial de asistencia');

    // Alteración del archivo conservado → se detecta
    fs.writeFileSync(resolveSafe(receipt.storagePath), tampered);
    const v2 = await verifyCode(r.evidenceCode);
    expect(v2.found && v2.integrity.document).toBe(false);
    expect((await verifyCode('FQR-ZZZZ-ZZZZ-ZZZZ')).found).toBe(false);
    expect((await verifyCode("' OR 1=1 --")).found).toBe(false);
  });

  it('la bitácora está encadenada por hash y es de solo inserción', async () => {
    const admin = await makeUser('ADMIN');
    for (let i = 0; i < 5; i++) await audit(actorOf(admin), { action: 'TEST', entityType: 'x', details: { i } });
    expect(await verifyAuditChain()).toEqual({ ok: true, checked: 5 });
    await expect(prisma.auditLog.updateMany({ data: { action: 'HACK' } })).rejects.toThrow(/FIRMAQR_IMMUTABLE/);
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/FIRMAQR_IMMUTABLE/);
    // Si alguien deshabilita el trigger y altera una fila, la cadena lo delata
    await prisma.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_immutable');
    await prisma.$executeRawUnsafe(`UPDATE audit_logs SET details = '{"i":99}' WHERE id = 3`);
    await prisma.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_immutable');
    const res = await verifyAuditChain();
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe('3');
  });
});
