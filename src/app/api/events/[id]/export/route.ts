import { api, actorFrom, fileResponse, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { loadEventFor } from '@/lib/permissions';
import { MIME, buildAttendanceXlsx } from '@/server/documents/service';

export const dynamic = 'force-dynamic';
export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req);
  const { id } = await params;
  const ev = await loadEventFor(u, id, 'view');
  await audit(actorFrom(req, u), { action: 'EXCEL_EXPORTED', entityType: 'event', entityId: id, eventId: id });
  return fileResponse(await buildAttendanceXlsx(id), `Asistencia_${ev.code}.xlsx`, MIME.xlsx);
});
