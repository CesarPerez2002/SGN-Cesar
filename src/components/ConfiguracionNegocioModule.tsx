import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { sgnApi } from '../api/client.ts';
import { formatDateTime } from '../shared/businessLogic.ts';
import type { DatosNegocio } from '../shared/types.ts';
import { AnimatedNotice, SPRING_SNAPPY } from './MotionPrimitives.tsx';

interface ConfiguracionNegocioModuleProps {
  profile: DatosNegocio;
  onDataChanged: () => Promise<void>;
}

export function ConfiguracionNegocioModule({
  profile,
  onDataChanged,
}: ConfiguracionNegocioModuleProps) {
  const [businessName, setBusinessName] = useState(profile.businessName);
  const [legalName, setLegalName] = useState(profile.legalName);
  const [rtn, setRtn] = useState(profile.rtn);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email);
  const [address, setAddress] = useState(profile.address);
  const [cai, setCai] = useState(profile.cai);
  const [invoiceFooter, setInvoiceFooter] = useState(profile.invoiceFooter);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setBusinessName(profile.businessName);
    setLegalName(profile.legalName);
    setRtn(profile.rtn);
    setPhone(profile.phone);
    setEmail(profile.email);
    setAddress(profile.address);
    setCai(profile.cai);
    setInvoiceFooter(profile.invoiceFooter);
  }, [profile]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (!businessName.trim()) {
      setError('El nombre comercial del negocio es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      await sgnApi.updateBusinessProfile({
        businessName,
        legalName,
        rtn,
        phone,
        email,
        address,
        cai,
        invoiceFooter,
      });
      setFeedback('Datos del negocio guardados. Se aplicarán en las nuevas facturas generadas.');
      await onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <AnimatedNotice visible={Boolean(error)} noticeKey={error ?? 'biz-error'}>
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </AnimatedNotice>

      <AnimatedNotice visible={Boolean(feedback)} noticeKey={feedback ?? 'biz-feedback'}>
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      </AnimatedNotice>

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Información fiscal y de facturación
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Actualizado: {formatDateTime(profile.updatedAt)}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="biz-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Nombre comercial *
              </label>
              <input
                id="biz-name"
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Ej. Distribuidora Central"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="biz-legal"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Razón social
              </label>
              <input
                id="biz-legal"
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Ej. Distribuidora Central S.A. de C.V."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="biz-rtn" className="block text-xs font-medium text-slate-700 mb-1">
                RTN de la empresa
              </label>
              <input
                id="biz-rtn"
                type="text"
                value={rtn}
                onChange={(e) => setRtn(e.target.value)}
                placeholder="08019999000000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="biz-phone"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Teléfono
              </label>
              <input
                id="biz-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2234-5678"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="biz-email"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Correo electrónico
              </label>
              <input
                id="biz-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="facturacion@empresa.hn"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="biz-address"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Dirección comercial
            </label>
            <input
              id="biz-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Colonia, boulevard o calle, ciudad, Honduras"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="biz-cai" className="block text-xs font-medium text-slate-700 mb-1">
                CAI / Código de autorización (opcional)
              </label>
              <input
                id="biz-cai"
                type="text"
                value={cai}
                onChange={(e) => setCai(e.target.value)}
                placeholder="Ej. A1B2C3-D4E5F6-..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="biz-footer"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Mensaje al pie de factura
              </label>
              <input
                id="biz-footer"
                type="text"
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
                placeholder="Gracias por su compra."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <motion.button
              type="submit"
              disabled={saving}
              whileHover={saving ? undefined : { scale: 1.02 }}
              whileTap={saving ? undefined : { scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-slate-800 to-teal-700 px-5 py-2.5 text-xs font-medium text-white hover:from-slate-900 hover:to-teal-800 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar datos del negocio'}</span>
            </motion.button>
          </div>
        </form>
      </section>
    </div>
  );
}
