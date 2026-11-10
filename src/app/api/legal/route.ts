import { z } from 'zod';
import { api, actorFrom, json, parseJson } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { Errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const GET = api(async (req) => {
  await requireApiUser(req, ['ADMIN']);
  const texts = await prisma.legalText.findMany({ orderBy: [{ type: 'asc' }, { createdAt: 'desc' }], include: { _count: { select: { consents: true } } } });
  return json({ texts });
});

const schema = z.object({
  type: z.enum(['SIGNATURE_AGREEMENT', 'DATA_TREATMENT']),
  version: z.string().trim().regex(/^[0-9A-Za-z.\-]{1,20}$/, 'Versión inválida'),
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(50).max(20000),
});
/** Publica una nueva versión (las anteriores se conservan; las aceptaciones guardan su versión). */
export const POST = api(async (req) => {
  const u = await requireApiUser(req, ['ADMIN']);
  const input = await parseJson(req, schema);
  if (await prisma.legalText.findUnique({ where: { type_version: { type: input.type, version: input.version } } }))
    throw Errors.conflict('VERSION_EXISTS', 'Ya existe esa versión. Use un número de versión nuevo.');
  const t = await prisma.$transaction(async (tx) => {
    await tx.legalText.updateMany({ where: { type: input.type, active: true }, data: { active: false } });
    const created = await tx.legalText.create({ data: { ...input, sha256: sha256(input.content), active: true, createdById: u.id } });
    await audit(actorFrom(req, u), { action: 'LEGAL_TEXT_PUBLISHED', entityType: 'legal_text', entityId: created.id, details: { type: input.type, version: input.version, sha256: created.sha256 } }, tx);
    return created;
  });
  return json({ text: t }, 201);
});
