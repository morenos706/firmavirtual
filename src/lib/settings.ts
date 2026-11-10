import { prisma } from './db';

export async function getSettings() {
  const s = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (s) return s;
  return prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export async function getActiveLegalTexts() {
  const [agreement, data] = await Promise.all([
    prisma.legalText.findFirst({ where: { type: 'SIGNATURE_AGREEMENT', active: true }, orderBy: { createdAt: 'desc' } }),
    prisma.legalText.findFirst({ where: { type: 'DATA_TREATMENT', active: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  return { agreement, data };
}

export function renderLegal(content: string, companyName: string) {
  return content.replaceAll('{{EMPRESA}}', companyName);
}
