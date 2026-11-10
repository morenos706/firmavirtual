import type { Event } from '@prisma/client';
import type { SessionUser } from './auth';
import { Errors } from './errors';
import { prisma } from './db';

/** Matriz de permisos (validada en el backend en cada operación). */
export const can = {
  manageUsers: (u: SessionUser) => u.role === 'ADMIN',
  manageSettings: (u: SessionUser) => u.role === 'ADMIN',
  viewAudit: (u: SessionUser) => u.role === 'ADMIN',
  resendEmails: (u: SessionUser) => u.role === 'ADMIN',
  viewSignatures: (u: SessionUser) => u.role === 'ADMIN',
  downloadReceipts: (u: SessionUser) => u.role === 'ADMIN',
  createEvents: (u: SessionUser) => u.role === 'ADMIN' || u.role === 'ORGANIZER',
  viewEvent: (u: SessionUser, e: Pick<Event, 'organizerId' | 'createdById'>) =>
    u.role === 'ADMIN' || e.organizerId === u.id || e.createdById === u.id,
  manageEvent: (u: SessionUser, e: Pick<Event, 'organizerId' | 'createdById'>) =>
    u.role === 'ADMIN' || e.organizerId === u.id || e.createdById === u.id,
};

export function eventScope(u: SessionUser) {
  return u.role === 'ADMIN' ? {} : { OR: [{ organizerId: u.id }, { createdById: u.id }] };
}

export async function loadEventFor(u: SessionUser, eventId: string, mode: 'view' | 'manage' = 'view') {
  const ev = await prisma.event.findUnique({ where: { id: eventId } });
  if (!ev) throw Errors.notFound('Evento');
  const ok = mode === 'view' ? can.viewEvent(u, ev) : can.manageEvent(u, ev);
  if (!ok) throw Errors.forbidden('No tiene acceso a este evento.');
  return ev;
}
