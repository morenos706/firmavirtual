import type { Prisma, PrismaClient, ActorType } from '@prisma/client';
import { prisma } from './db';
import { canonicalJson, sha256 } from './crypto';

export type AuditActor = {
  type: ActorType;
  userId?: string | null;
  label?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  eventId?: string | null;
  details?: Record<string, unknown>;
};

type Tx = Prisma.TransactionClient | PrismaClient;

const AUDIT_LOCK_KEY = 727_211; // pg_advisory_xact_lock: serializa la cadena de hashes

/**
 * Registra una entrada en la bitácora encadenada por hash.
 * hash = SHA-256(prevHash + contenido canónico). Cualquier alteración rompe la cadena
 * y es detectable con verifyAuditChain().
 */
export async function audit(actor: AuditActor, entry: AuditEntry, tx?: Tx) {
  const run = async (client: Prisma.TransactionClient) => {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
    const last = await client.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? 'GENESIS';
    const createdAt = new Date();
    const content = {
      createdAt: createdAt.toISOString(),
      actorType: actor.type,
      actorUserId: actor.userId ?? null,
      actorLabel: actor.label ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      eventId: entry.eventId ?? null,
      ip: actor.ip ?? null,
      details: entry.details ?? null,
    };
    const hash = sha256(prevHash + canonicalJson(content));
    return client.auditLog.create({
      data: {
        createdAt,
        actorType: actor.type,
        actorUserId: actor.userId ?? null,
        actorLabel: actor.label ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        eventId: entry.eventId ?? null,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent?.slice(0, 500) ?? null,
        details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
        prevHash,
        hash,
      },
    });
  };
  if (tx && !('$transaction' in tx)) return run(tx as Prisma.TransactionClient);
  return prisma.$transaction((t) => run(t));
}

/** Recalcula la cadena completa y reporta la primera inconsistencia. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
  let prev = 'GENESIS';
  let checked = 0;
  let cursor: bigint | undefined;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: 1000,
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const content = {
        createdAt: r.createdAt.toISOString(),
        actorType: r.actorType,
        actorUserId: r.actorUserId,
        actorLabel: r.actorLabel,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        eventId: r.eventId,
        ip: r.ip,
        details: r.details ?? null,
      };
      const expected = sha256(prev + canonicalJson(content));
      if (r.prevHash !== prev || r.hash !== expected) return { ok: false, checked, brokenAt: r.id.toString() };
      prev = r.hash;
      checked++;
      cursor = r.id;
    }
  }
  return { ok: true, checked };
}

export const systemActor: AuditActor = { type: 'SYSTEM', label: 'FirmaQR' };
