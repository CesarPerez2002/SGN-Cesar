import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Pencil, Plus, Shield, X } from 'lucide-react';
import { sgnApi } from '../api/client.ts';
import { formatDateTime } from '../shared/businessLogic.ts';
import type { RolUsuario, Usuario } from '../shared/types.ts';

interface UsuariosModuleProps {
  users: Usuario[];
  currentUser: Usuario;
  onDataChanged: () => Promise<void>;
}

export function UsuariosModule({ users, currentUser, onDataChanged }: UsuariosModuleProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RolUsuario>('Cajero');
  const [active, setActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('Cajero');
    setActive(true);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(u: Usuario) {
    setEditing(u);
    setFullName(u.fullName);
    setUsername(u.username);
    setEmail(u.email);
    setPassword('');
    setRole(u.role);
    setActive(u.active);
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSaving(true);

    try {
      if (editing) {
        await sgnApi.updateUser(editing.id, {
          fullName,
          username,
          email,
          password: password.trim() ? password : undefined,
          role,
          active,
        });
        setFeedback(`Cuenta de usuario "${username}" actualizada.`);
      } else {
        await sgnApi.createUser({
          fullName,
          username,
          email,
          password,
          role,
          active,
        });
        setFeedback(`Usuario "${username}" creado con rol ${role}.`);
      }
      setModalOpen(false);
      await onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el usuario.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Role Responsibility Reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Shield className="w-4 h-4 text-blue-700" />
            <span>Rol: Administrador</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Acceso total a gestión y configuración: Ventas, Compras, Inventario (edición de
            productos y categorías), Clientes, Proveedores y Usuarios y Seguridad.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Shield className="w-4 h-4 text-slate-600" />
            <span>Rol: Cajero</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Acceso operativo enfocado en punto de venta: registro de Ventas, consulta de existencias
            en Inventario y administración básica del directorio de Clientes.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Cuentas de usuario ({users.length})
            </h2>
          </div>

          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2 text-xs font-medium text-white hover:from-purple-700 hover:to-fuchsia-700 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo usuario</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-3 px-5">Nombre completo</th>
                <th className="py-3 px-4">Usuario</th>
                <th className="py-3 px-4">Correo electrónico</th>
                <th className="py-3 px-4">Rol</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Último acceso</th>
                <th className="py-3 px-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-5 font-medium text-slate-900">
                    {u.fullName}
                    {u.id === currentUser.id && (
                      <span className="ml-2 text-xs font-normal text-blue-700">(Sesión actual)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">{u.username}</td>
                  <td className="py-3 px-4 text-slate-600">{u.email}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{u.role}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`text-xs font-medium ${
                        u.active ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Sin ingresos'}
                  </td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      aria-label={`Editar usuario ${u.username}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3
                id="user-modal-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                {editing ? 'Editar cuenta de usuario' : 'Nueva cuenta de usuario'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar formulario de usuario"
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="usr-fullname" className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre completo *
                </label>
                <input
                  id="usr-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="usr-username" className="block text-xs font-medium text-slate-700 mb-1">
                    Nombre de usuario *
                  </label>
                  <input
                    id="usr-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="usr-role" className="block text-xs font-medium text-slate-700 mb-1">
                    Rol asignado *
                  </label>
                  <select
                    id="usr-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as RolUsuario)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Administrador">Administrador</option>
                    <option value="Cajero">Cajero</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="usr-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Correo electrónico *
                </label>
                <input
                  id="usr-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="usr-password" className="block text-xs font-medium text-slate-700 mb-1">
                  {editing ? 'Nueva contraseña (dejar vacío para conservar actual)' : 'Contraseña *'}
                </label>
                <input
                  id="usr-password"
                  type="password"
                  required={!editing}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                <span>Cuenta activa (permitir inicio de sesión)</span>
              </label>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2 text-xs font-medium text-white hover:from-purple-700 hover:to-fuchsia-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
