import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, LogOut, RefreshCw } from 'lucide-react';
import { getStoredToken, setStoredToken, sgnApi } from './api/client.ts';
import { ClientesModule } from './components/ClientesModule.tsx';
import { ComprasModule } from './components/ComprasModule.tsx';
import { ConfiguracionNegocioModule } from './components/ConfiguracionNegocioModule.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { InventarioModule } from './components/InventarioModule.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { ProveedoresModule } from './components/ProveedoresModule.tsx';
import { UsuariosModule } from './components/UsuariosModule.tsx';
import { VentasModule } from './components/VentasModule.tsx';
import { canAccessModule, getDefaultModuleForRole } from './shared/businessLogic.ts';
import type {
  Categoria,
  Cliente,
  Compra,
  DatosNegocio,
  ModuloId,
  Producto,
  Proveedor,
  ResumenDashboard,
  Usuario,
  Venta,
} from './shared/types.ts';

const MODULE_META: Record<ModuloId, { title: string; subtitle: string }> = {
  resumen: {
    title: 'Inicio',
    subtitle: 'Menú principal de módulos',
  },
  ventas: {
    title: 'Ventas y Facturación',
    subtitle: 'Registro de operaciones comerciales y generación de facturas',
  },
  compras: {
    title: 'Compras',
    subtitle: 'Órdenes de abastecimiento a proveedores y entrada al inventario',
  },
  inventario: {
    title: 'Inventario',
    subtitle: 'Control de productos, categorías y niveles mínimos de stock',
  },
  clientes: {
    title: 'Clientes',
    subtitle: 'Directorio de clientes y datos de contacto comercial',
  },
  proveedores: {
    title: 'Proveedores',
    subtitle: 'Administración de proveedores y abastecimiento',
  },
  usuarios: {
    title: 'Usuarios y Seguridad',
    subtitle: 'Gestión de cuentas, roles de Administrador y Cajero y control de acceso',
  },
  configuracion: {
    title: 'Datos del Negocio',
    subtitle: 'Información comercial y fiscal impresa en cada factura generada',
  },
};

export default function App() {
  const [user, setUser] = useState<Usuario | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuloId>('resumen');

  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<ResumenDashboard | null>(null);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [products, setProducts] = useState<Producto[]>([]);
  const [customers, setCustomers] = useState<Cliente[]>([]);
  const [suppliers, setSuppliers] = useState<Proveedor[]>([]);
  const [sales, setSales] = useState<Venta[]>([]);
  const [purchases, setPurchases] = useState<Compra[]>([]);
  const [usersList, setUsersList] = useState<Usuario[]>([]);
  const [businessProfile, setBusinessProfile] = useState<DatosNegocio | null>(null);

  const loadWorkspaceData = useCallback(async (currentUser: Usuario) => {
    setLoadingData(true);
    setLoadError(null);
    try {
      const isAdmin = currentUser.role === 'Administrador';
      const [dashData, catData, prodData, custData, salesData, profileData] = await Promise.all([
        sgnApi.getDashboard(),
        sgnApi.listCategories(),
        sgnApi.listProducts(),
        sgnApi.listCustomers(),
        sgnApi.listSales(),
        sgnApi.getBusinessProfile(),
      ]);

      setDashboard(dashData);
      setCategories(catData);
      setProducts(prodData);
      setCustomers(custData);
      setSales(salesData);
      setBusinessProfile(profileData);

      if (isAdmin) {
        const [supData, purchData, usrData] = await Promise.all([
          sgnApi.listSuppliers(),
          sgnApi.listPurchases(),
          sgnApi.listUsers(),
        ]);
        setSuppliers(supData);
        setPurchases(purchData);
        setUsersList(usrData);
      } else {
        setSuppliers([]);
        setPurchases([]);
        setUsersList([]);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'No se pudieron cargar los datos del sistema.',
      );
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      const token = getStoredToken();
      if (!token) {
        if (active) setBootstrapping(false);
        return;
      }
      try {
        const res = await sgnApi.getMe();
        if (!active) return;
        setUser(res.user);
        setActiveModule(getDefaultModuleForRole(res.user.role));
        await loadWorkspaceData(res.user);
      } catch {
        setStoredToken(null);
        if (active) setUser(null);
      } finally {
        if (active) setBootstrapping(false);
      }
    }
    restoreSession();
    return () => {
      active = false;
    };
  }, [loadWorkspaceData]);

  async function handleLoginSuccess(loggedUser: Usuario) {
    setUser(loggedUser);
    setActiveModule(getDefaultModuleForRole(loggedUser.role));
    await loadWorkspaceData(loggedUser);
  }

  async function handleLogout() {
    try {
      await sgnApi.logout();
    } catch {
      // Ignore network errors on logout
    }
    setStoredToken(null);
    setUser(null);
    setDashboard(null);
    setBusinessProfile(null);
  }

  function handleSelectModule(nextModule: ModuloId) {
    if (!user || !canAccessModule(user.role, nextModule)) return;
    setActiveModule(nextModule);
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-teal-900 flex items-center justify-center p-6">
        <div className="text-sm text-indigo-100">Verificando sesión en SGN...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const effectiveModule = canAccessModule(user.role, activeModule)
    ? activeModule
    : getDefaultModuleForRole(user.role);
  const meta = MODULE_META[effectiveModule];
  const companyName = businessProfile?.businessName?.trim() || 'Mi Negocio';

  const quickHeaderLinks: Array<{ id: ModuloId; label: string }> =
    user.role === 'Administrador'
      ? [
          { id: 'resumen', label: 'Inicio' },
          { id: 'ventas', label: 'Ventas' },
          { id: 'compras', label: 'Compras' },
          { id: 'inventario', label: 'Inventario' },
          { id: 'clientes', label: 'Clientes' },
        ]
      : [
          { id: 'resumen', label: 'Inicio' },
          { id: 'ventas', label: 'Ventas' },
          { id: 'inventario', label: 'Inventario' },
          { id: 'clientes', label: 'Clientes' },
        ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/80 via-slate-50 to-amber-50/60 flex flex-col">
      {/* Top Bar Contract: 3 zones with dark gradient header */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-slate-900 via-indigo-950 to-teal-950 text-white border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => handleSelectModule('resumen')}
          className="flex items-center gap-2.5 text-left cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-md"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-white"
            >
              <path
                d="M4 7h16M4 12h10M4 17h16"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="font-display text-base font-bold tracking-tight text-white truncate max-w-[200px] sm:max-w-xs">
            {companyName}
          </span>
        </button>

        {effectiveModule !== 'resumen' ? (
          <nav
            aria-label="Acceso rápido a módulos"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {quickHeaderLinks.map((link) => {
              const isActive = effectiveModule === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => handleSelectModule(link.id)}
                  className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors pb-0.5 border-b-2 ${
                    isActive
                      ? 'text-white border-amber-400'
                      : 'text-slate-300 border-transparent hover:text-white'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="hidden md:block text-xs text-indigo-200 whitespace-nowrap shrink-0">
            {user.fullName} · {user.role}
          </div>
        )}

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
        {loadError && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {loadError}
          </div>
        )}

        {effectiveModule === 'resumen' ? (
          <DashboardView
            businessName={companyName}
            user={user}
            summary={dashboard}
            loading={loadingData && !dashboard}
            onNavigate={handleSelectModule}
          />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => handleSelectModule('resumen')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-800 to-indigo-800 hover:from-slate-900 hover:to-indigo-900 px-3.5 py-2 text-xs font-medium text-white transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Módulos</span>
                </button>
                <div className="min-w-0">
                  <h1 className="font-display text-xl font-semibold text-slate-900 truncate">
                    {meta.title}
                  </h1>
                  <p className="text-xs text-slate-600 truncate">{meta.subtitle}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => loadWorkspaceData(user)}
                disabled={loadingData}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                <span>Actualizar</span>
              </button>
            </div>

            {effectiveModule === 'ventas' && (
              <VentasModule
                sales={sales}
                products={products}
                categories={categories}
                customers={customers}
                userRole={user.role}
                onNavigate={handleSelectModule}
                onDataChanged={() => loadWorkspaceData(user)}
              />
            )}

            {effectiveModule === 'compras' && user.role === 'Administrador' && (
              <ComprasModule
                purchases={purchases}
                products={products}
                suppliers={suppliers}
                onNavigate={handleSelectModule}
                onDataChanged={() => loadWorkspaceData(user)}
              />
            )}

            {effectiveModule === 'inventario' && (
              <InventarioModule
                products={products}
                categories={categories}
                userRole={user.role}
                onDataChanged={() => loadWorkspaceData(user)}
              />
            )}

            {effectiveModule === 'clientes' && (
              <ClientesModule
                customers={customers}
                onDataChanged={() => loadWorkspaceData(user)}
              />
            )}

            {effectiveModule === 'proveedores' && user.role === 'Administrador' && (
              <ProveedoresModule
                suppliers={suppliers}
                onDataChanged={() => loadWorkspaceData(user)}
              />
            )}

            {effectiveModule === 'usuarios' && user.role === 'Administrador' && (
              <UsuariosModule
                users={usersList}
                currentUser={user}
                onDataChanged={() => loadWorkspaceData(user)}
              />
            )}

            {effectiveModule === 'configuracion' &&
              user.role === 'Administrador' &&
              businessProfile && (
                <ConfiguracionNegocioModule
                  profile={businessProfile}
                  onDataChanged={() => loadWorkspaceData(user)}
                />
              )}
          </div>
        )}
      </main>
    </div>
  );
}
