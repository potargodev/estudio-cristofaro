import { asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { createStaffUser, setUserActive, updateUserRole } from "@/app/admin/actions";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { SubmitButton, FormSelect } from "@/components/admin/ui";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ROLES } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/admin/kit/Avatar";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";

export const metadata: Metadata = { title: "Usuarios" };

const errors: Record<string, string> = {
  campos: "Completá nombre, email y contraseña.",
  email: "Revisá el email.",
  password: "La contraseña inicial tiene que tener al menos 8 caracteres.",
  repetido: "Ya existe un usuario con ese email.",
  propio: "No podés cambiar tu propio rol ni desactivar tu usuario.",
  guardar: "No se pudo guardar. Probá de nuevo.",
};

const notices: Record<string, string> = {
  creado: "Usuario creado. Pasale el email y la contraseña inicial.",
  guardado: "Rol actualizado.",
  desactivado: "Usuario desactivado. Se cerraron sus sesiones abiertas.",
  activado: "Usuario reactivado.",
};

const STAFF_ROLES = ["admin", "contador"] as const;

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const admin = await requireAdmin();
  const team = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.studioId, admin.studioId))
    .orderBy(desc(users.active), asc(users.name));

  const notice = Object.keys(notices).find((k) => params[k]);
  const error = params.error ? (errors[params.error] ?? errors.guardar) : null;

  return (
    <div className="max-w-5xl">
      <AdminPageHeader title="Usuarios" description="Las personas del estudio que pueden entrar al backoffice. Los administradores además gestionan los usuarios y las integraciones." />
      {notice && (
        <Notice>{notices[notice]}</Notice>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[680px] text-left text-[14px]">
          <thead className="border-b border-line bg-paper text-[13px] text-muted">
            <tr>
              <th className="px-4 py-2.5 font-normal">Nombre</th>
              <th className="px-4 py-2.5 font-normal">Rol</th>
              <th className="px-4 py-2.5 font-normal">Estado</th>
              <th className="px-4 py-2.5 text-right font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {team.map((u) => {
              const self = u.id === admin.id;
              return (
                <tr key={u.id} className={u.active ? "" : "text-muted"}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={u.name} />
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">
                          {u.name}
                          {self && <span className="ml-1.5 text-[13px] font-normal text-muted">(vos)</span>}
                        </span>
                        <span className="block text-[13px] text-muted">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {self || u.role === "cliente" ? (
                      ROLES[u.role]
                    ) : (
                      <form action={updateUserRole} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <label htmlFor={`role-${u.id}`} className="sr-only">
                          Rol de {u.name}
                        </label>
                        <FormSelect
                          id={`role-${u.id}`}
                          name="role"
                          defaultValue={u.role}
                          options={STAFF_ROLES.map((r) => ({ value: r, label: ROLES[r] }))}
                          className="mt-0 w-40"
                        />
                        <SubmitButton variant="secondary" pendingText="…">
                          Cambiar
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.active ? "activa" : "baja"} label={u.active ? "Activo" : "Desactivado"} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!self && (
                      <form action={setUserActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                        {u.active ? (
                          <SubmitButton
                            variant="danger"
                            pendingText="Desactivando…"
                            confirm={`¿Desactivar a ${u.name}? No va a poder entrar al backoffice.`}
                          >
                            Desactivar
                          </SubmitButton>
                        ) : (
                          <SubmitButton variant="secondary" pendingText="Activando…">
                            Reactivar
                          </SubmitButton>
                        )}
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-10 text-[20px] font-medium">Agregar usuario</h2>
      <form action={createStaffUser} className="grid gap-4 border border-line bg-surface p-5 sm:grid-cols-2">
        <AdminField label="Nombre y apellido" htmlFor="name">
          <Input id="name" name="name" required autoComplete="off" />
        </AdminField>
        <AdminField label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="off" />
        </AdminField>
        <AdminField label="Contraseña inicial" htmlFor="password" hint="Mínimo 8 caracteres. Pasásela a la persona por un canal seguro.">
          <Input id="password" name="password" type="text" required minLength={8} autoComplete="new-password" />
        </AdminField>
        <AdminField label="Rol" htmlFor="role">
          <FormSelect id="role" name="role" defaultValue="contador" options={STAFF_ROLES.map((r) => ({ value: r, label: ROLES[r] }))} />
        </AdminField>
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Creando…">Crear usuario</SubmitButton>
        </div>
      </form>
    </div>
  );
}
