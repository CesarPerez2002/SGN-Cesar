import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Pencil, Plus, Search, X } from 'lucide-react';
import { sgnApi } from '../api/client.ts';
import type { Proveedor } from '../shared/types.ts';

interface ProveedoresModuleProps {
  suppliers: Proveedor[];
  onDataChanged: () => Promise<void>;
}

export function ProveedoresModule({ suppliers, onDataChanged }: ProveedoresModuleProps) {
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.companyName.toLowerCase().includes(q) ||
        s.contactName.toLowerCase().includes(q) ||
        s.taxId.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q),
    );
  }, [suppliers, query]);

  function openNew() {
    setEditing(null);
    setCompanyName('');
    setContactName('');
    setTaxId('');
    setPhone('');
    setEmail('');
    setAddress('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(s: Proveedor) {
    setEditing(s);
    setCompanyName(s.companyName);
    setContactName(s.contactName);
    setTaxId(s.taxId);
    setPhone(s.phone);
    setEmail(s.email);
    setAddress(s.address);
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      const payload = { companyName, contactName, taxId, phone, email, address };
      if (editing) {
        await sgnApi.updateSupplier(editing.id, payload);
        setFeedback(`Proveedor "${companyName}" actualizado.`);
      } else {
        await sgnApi.createSupplier(payload);
        setFeedback(`Proveedor "${companyName}" registrado.`);
      }
      setModalOpen(false);
      await onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el proveedor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
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
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por empresa, contacto o RTN..."
              aria-label="Buscar proveedores"
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2 text-xs font-medium text-white hover:from-rose-700 hover:to-pink-700 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo proveedor</span>
          </button>
        </div>

        {suppliers.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
            <div>
              <p className="text-sm font-medium text-slate-800">
                Aún no hay proveedores registrados
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Agrega proveedores para registrar órdenes de compra y reabastecer el inventario.
              </p>
            </div>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2 text-xs font-medium text-white hover:from-rose-700 hover:to-pink-700 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar primer proveedor</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No se encontraron proveedores con el criterio de búsqueda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-3 px-5">Empresa / Razón social</th>
                  <th className="py-3 px-4">Contacto principal</th>
                  <th className="py-3 px-4">RTN</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4">Correo</th>
                  <th className="py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-5">
                      <div className="font-medium text-slate-900">{s.companyName}</div>
                      {s.address && (
                        <div className="text-xs text-slate-500 truncate max-w-xs">{s.address}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{s.contactName}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {s.taxId || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {s.phone}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{s.email || '—'}</td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        aria-label={`Editar proveedor ${s.companyName}`}
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
        )}
      </section>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="supplier-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3
                id="supplier-modal-title"
                className="font-display text-base font-semibold text-slate-900"
              >
                {editing ? 'Actualizar proveedor' : 'Registrar proveedor'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar formulario de proveedor"
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
                <label
                  htmlFor="sup-company"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Empresa o razón social *
                </label>
                <input
                  id="sup-company"
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="sup-contact"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Contacto principal *
                  </label>
                  <input
                    id="sup-contact"
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="sup-tax" className="block text-xs font-medium text-slate-700 mb-1">
                    RTN
                  </label>
                  <input
                    id="sup-tax"
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="sup-phone"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Teléfono *
                  </label>
                  <input
                    id="sup-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sup-email"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Correo electrónico
                  </label>
                  <input
                    id="sup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="sup-address"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Dirección
                </label>
                <input
                  id="sup-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

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
                  className="rounded-lg bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2 text-xs font-medium text-white hover:from-rose-700 hover:to-pink-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
