'use client';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, UserPlus, Users } from 'lucide-react';
import { Badge, Button, Card, Field, Modal, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { apiFetch, errorMessage, fmtDate } from '@/lib/client';

type U = { id: string; email: string; name: string; active: boolean; lastLoginAt: string | null; role: { name: 'ADMIN' | 'ORGANIZER'; label: string } };

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<U[] | null>(null);
  const [edit, setEdit] = useState<Partial<U> & { password?: string; roleName?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => apiFetch<{ users: U[] }>('/api/users').then((r) => setUsers(r.users)).catch((e) => toast('error', errorMessage(e))), [toast]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id) await apiFetch(`/api/users/${edit.id}`, { method: 'PATCH', body: { name: edit.name, role: edit.roleName, active: edit.active, ...(edit.password ? { password: edit.password } : {}) } });
      else await apiFetch('/api/users', { body: { email: edit.email, name: edit.name, role: edit.roleName, password: edit.password } });
      toast('success', 'Usuario guardado.');
      setEdit(null);
      await load();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Usuarios" subtitle="Cree usuarios internos y asigne roles." actions={<Button onClick={() => setEdit({ roleName: 'ORGANIZER', active: true, name: '', email: '', password: '' })}><UserPlus className="h-4 w-4" /> Nuevo usuario</Button>} />
      <Card title="Usuarios" icon={<Users className="h-4 w-4" />}>
        {!users ? <Spinner /> : (
          <div className="-m-5 overflow-x-auto">
            <table className="table-pro">
              <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th className="hidden md:table-cell">Último acceso</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-semibold">{u.name}</td>
                    <td className="text-sm">{u.email}</td>
                    <td><Badge status={u.role.name === 'ADMIN' ? 'FINALIZED' : 'SCHEDULED'}>{u.role.label}</Badge></td>
                    <td><Badge status={u.active ? 'ACTIVE' : 'CANCELLED'}>{u.active ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="hidden text-xs md:table-cell">{fmtDate(u.lastLoginAt)}</td>
                    <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setEdit({ ...u, roleName: u.role.name, password: '' })}><Pencil className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? 'Editar usuario' : 'Nuevo usuario'} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button loading={busy} onClick={save}>Guardar</Button></>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Nombre"><input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Correo"><input className="input" type="email" value={edit.email ?? ''} disabled={Boolean(edit.id)} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Rol">
              <select className="input" value={edit.roleName} onChange={(e) => setEdit({ ...edit, roleName: e.target.value })}>
                <option value="ORGANIZER">Organizador</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </Field>
            <Field label={edit.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} hint="Mínimo 10 caracteres con mayúsculas, minúsculas y números.">
              <input className="input" type="password" autoComplete="new-password" value={edit.password ?? ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
            {edit.id && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={Boolean(edit.active)} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Usuario activo</label>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
