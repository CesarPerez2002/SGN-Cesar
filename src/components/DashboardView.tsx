import type { ComponentType } from 'react';
import {
  ArrowRight,
  Building2,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import { canAccessModule } from '../shared/businessLogic.ts';
import type { ModuloId, ResumenDashboard, Usuario } from '../shared/types.ts';

interface ModuleButtonConfig {
  id: ModuloId;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  cardGradient: string;
  iconGradient: string;
  arrowClass: string;
  dividerClass: string;
  getMeta?: (summary: ResumenDashboard) => string;
}

const MODULE_BUTTONS: ModuleButtonConfig[] = [
  {
    id: 'ventas',
    title: 'Ventas',
    description: 'Registrar ventas, calcular ISV y generar facturas.',
    icon: ShoppingBag,
    cardGradient:
      'bg-gradient-to-br from-white via-emerald-50/50 to-teal-50 border-emerald-200 hover:border-emerald-500 hover:from-emerald-50/80 hover:to-teal-100/70',
    iconGradient: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm',
    arrowClass: 'text-emerald-600',
    dividerClass: 'border-emerald-100',
    getMeta: (s) => `${s.totalSalesCount} facturas emitidas`,
  },
  {
    id: 'compras',
    title: 'Compras',
    description: 'Órdenes a proveedores y entrada al inventario.',
    icon: Truck,
    cardGradient:
      'bg-gradient-to-br from-white via-amber-50/50 to-orange-50 border-amber-200 hover:border-amber-500 hover:from-amber-50/80 hover:to-orange-100/70',
    iconGradient: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm',
    arrowClass: 'text-amber-600',
    dividerClass: 'border-amber-100',
    getMeta: (s) => `${s.pendingPurchasesCount} pendientes por recibir`,
  },
  {
    id: 'inventario',
    title: 'Inventario',
    description: 'Administrar productos, categorías y existencias.',
    icon: Package,
    cardGradient:
      'bg-gradient-to-br from-white via-indigo-50/50 to-violet-50 border-indigo-200 hover:border-indigo-500 hover:from-indigo-50/80 hover:to-violet-100/70',
    iconGradient: 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm',
    arrowClass: 'text-indigo-600',
    dividerClass: 'border-indigo-100',
    getMeta: (s) => `${s.totalProductsCount} productos registrados`,
  },
  {
    id: 'clientes',
    title: 'Clientes',
    description: 'Directorio de clientes, teléfonos y RTN.',
    icon: Users,
    cardGradient:
      'bg-gradient-to-br from-white via-cyan-50/50 to-sky-50 border-cyan-200 hover:border-cyan-500 hover:from-cyan-50/80 hover:to-sky-100/70',
    iconGradient: 'bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm',
    arrowClass: 'text-cyan-700',
    dividerClass: 'border-cyan-100',
    getMeta: (s) => `${s.totalCustomersCount} clientes`,
  },
  {
    id: 'proveedores',
    title: 'Proveedores',
    description: 'Catálogo de proveedores y contactos.',
    icon: Building2,
    cardGradient:
      'bg-gradient-to-br from-white via-rose-50/50 to-pink-50 border-rose-200 hover:border-rose-500 hover:from-rose-50/80 hover:to-pink-100/70',
    iconGradient: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-sm',
    arrowClass: 'text-rose-600',
    dividerClass: 'border-rose-100',
    getMeta: (s) => `${s.totalSuppliersCount} proveedores`,
  },
  {
    id: 'usuarios',
    title: 'Usuarios y Seguridad',
    description: 'Cuentas, contraseñas y permisos por rol.',
    icon: ShieldCheck,
    cardGradient:
      'bg-gradient-to-br from-white via-purple-50/50 to-fuchsia-50 border-purple-200 hover:border-purple-500 hover:from-purple-50/80 hover:to-fuchsia-100/70',
    iconGradient: 'bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-sm',
    arrowClass: 'text-purple-700',
    dividerClass: 'border-purple-100',
  },
  {
    id: 'configuracion',
    title: 'Datos del Negocio',
    description: 'Nombre comercial, RTN y datos de factura.',
    icon: Settings,
    cardGradient:
      'bg-gradient-to-br from-white via-slate-50 to-teal-50 border-teal-200 hover:border-teal-600 hover:from-slate-100/80 hover:to-teal-100/70',
    iconGradient: 'bg-gradient-to-br from-slate-700 to-teal-700 text-white shadow-sm',
    arrowClass: 'text-teal-700',
    dividerClass: 'border-teal-100',
  },
];

interface DashboardViewProps {
  businessName: string;
  user: Usuario;
  summary: ResumenDashboard | null;
  loading: boolean;
  onNavigate: (moduleId: ModuloId) => void;
}

export function DashboardView({
  businessName,
  user,
  summary,
  loading,
  onNavigate,
}: DashboardViewProps) {
  const visibleModules = MODULE_BUTTONS.filter((item) => canAccessModule(user.role, item.id));

  return (
    <div className="max-w-5xl mx-auto py-3 sm:py-6 space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-indigo-700 via-violet-700 to-teal-700 p-6 sm:p-8 text-white shadow-sm">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
          {businessName}
        </h1>
        <p className="mt-1.5 text-sm text-indigo-100">
          <span>{user.fullName}</span>
          <span aria-hidden="true" className="mx-2 text-indigo-300">
            ·
          </span>
          <span>{user.role}</span>
          <span aria-hidden="true" className="mx-2 text-indigo-300">
            ·
          </span>
          <span>Seleccione un módulo para trabajar</span>
        </p>
      </div>

      {loading && !summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((item) => (
            <div
              key={item.id}
              className="h-40 rounded-xl border border-slate-200 bg-white animate-pulse p-6"
            />
          ))}
        </div>
      ) : (
        <div
          role="navigation"
          aria-label="Módulos del sistema"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {visibleModules.map((item) => {
            const Icon = item.icon;
            const metaText = summary && item.getMeta ? item.getMeta(summary) : null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`group flex flex-col justify-between rounded-xl border p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-all duration-150 cursor-pointer min-h-[156px] ${item.cardGradient}`}
              >
                <div className="w-full">
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 ${item.iconGradient}`}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <ArrowRight
                      className={`w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5 shrink-0 ${item.arrowClass}`}
                      aria-hidden="true"
                    />
                  </div>
                  <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
                    {item.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 leading-snug">{item.description}</p>
                </div>

                {metaText && (
                  <p
                    className={`mt-4 pt-3 border-t text-xs font-mono text-slate-600 tabular-nums w-full ${item.dividerClass}`}
                  >
                    {metaText}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
