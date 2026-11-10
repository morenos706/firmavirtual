import { api, fileResponse, json, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { loadEventFor } from '@/lib/permissions';
import { MIME, buildClosingReport, computeClosingMetrics } from '@/server/documents/service';

export const dynamic = 'force-dynamic';
/** Informe de cierre con métricas actualizadas (?format=pdf|xlsx|json). */
export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req);
  const { id } = await params;
  const ev = await loadEventFor(u, id, 'view');
  const format = req.nextUrl.searchParams.get('format') ?? 'json';
  if (format === 'json') return json({ metrics: await computeClosingMetrics(id), snapshot: ev.closingReport, closingStatus: ev.closingStatus, closingError: ev.closingError });
  if (format === 'xlsx') return fileResponse(await buildClosingReport(id, 'xlsx'), `Informe_Cierre_${ev.code}.xlsx`, MIME.xlsx);
  return fileResponse(await buildClosingReport(id, 'pdf'), `Informe_Cierre_${ev.code}.pdf`, MIME.pdf);
});
